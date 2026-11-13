//! What every running container takes, for the Environment page's memory
//! map: ckpro's cluster nodes, its own services, and whatever else runs in
//! the same Docker. One sample per container (no streaming), only while the
//! page is open.

use super::model::{ContainerUse, HostFacts, MachineMemory, Owner};
use crate::cluster::kind::CLUSTER_LABEL;
use bollard::Docker;
use bollard::query_parameters::{ListContainersOptions, StatsOptions};
use futures_util::StreamExt;

/// The compose label naming a container's service (`compose_labels`)
const SERVICE_LABEL: &str = "com.docker.compose.service";
const PROJECT_LABEL: &str = "com.docker.compose.project";

/// The running containers and their memory now, largest first. `owned`:
/// ckpro's clusters (other kind clusters count as other apps)
pub async fn measure(docker: &Docker, owned: &[String]) -> Vec<ContainerUse> {
    let Ok(containers) = docker.list_containers(Some(ListContainersOptions::default())).await else {
        return Vec::new();
    };
    let samples = containers.into_iter().filter_map(|c| {
        let name = c.names?.first()?.trim_start_matches('/').to_string();
        let labels = c.labels.unwrap_or_default();
        let owner = owner(&labels, owned);
        Some(async move {
            let options = StatsOptions { stream: false, one_shot: true };
            let stats = docker.stats(&name, Some(options)).next().await?.ok()?;
            let mb = super::preflight::used_mb(&stats.memory_stats?);
            Some(ContainerUse { name, owner, mb })
        })
    });
    let mut used: Vec<ContainerUse> = futures_util::future::join_all(samples).await.into_iter().flatten().collect();
    used.sort_by_key(|c| std::cmp::Reverse(c.mb));
    used
}

/// Whose a container is, from its labels
fn owner(labels: &std::collections::HashMap<String, String>, owned: &[String]) -> Owner {
    if let Some(cluster) = labels.get(CLUSTER_LABEL) {
        // The app's clusters, and the ones of proofs and verify runs, whose
        // nodes the kind shim labels as ckpro's
        let ours = labels.get(PROJECT_LABEL).is_some_and(|p| p == super::docker::COMPOSE_PROJECT);
        return if owned.contains(cluster) || ours {
            Owner::Cluster { cluster: cluster.clone() }
        } else {
            Owner::Other { cluster: Some(cluster.clone()) }
        };
    }
    match (labels.get(PROJECT_LABEL), labels.get(SERVICE_LABEL)) {
        (Some(project), Some(service)) if project == super::docker::COMPOSE_PROJECT => {
            Owner::Service { service: service.clone() }
        }
        _ => Owner::Other { cluster: None },
    }
}

/// Docker's disk and the kernel's file watch limits, read in the image
/// mirror (its cache sits on Docker's disk); none while it does not run
pub async fn host_facts(docker: &Docker) -> Option<HostFacts> {
    let script = "df -Pk /var/lib/registry | tail -1; du -sk /var/lib/registry; \
                  cat /proc/sys/fs/inotify/max_user_watches /proc/sys/fs/inotify/max_user_instances";
    let out = super::exec::run(docker, super::infra::MIRROR, &["sh", "-c", script], &[], None).await.ok()?;
    (out.exit_code == 0).then(|| parse_facts(&out.text)).flatten()
}

/// The memory of Docker's machine, read in the image mirror: every
/// container shares its kernel, whose `/proc/meminfo` is the machine's
/// (none while the mirror does not run)
pub async fn machine_memory(docker: &Docker) -> Option<MachineMemory> {
    let out = super::exec::run(docker, super::infra::MIRROR, &["cat", "/proc/meminfo"], &[], None).await.ok()?;
    (out.exit_code == 0).then(|| parse_memory(&out.text)).flatten()
}

/// `/proc/meminfo`'s `MemTotal` and `MemAvailable` (in kB there)
fn parse_memory(text: &str) -> Option<MachineMemory> {
    let mb = |key: &str| -> Option<u32> {
        let line = text.lines().find(|l| l.split(':').next() == Some(key))?;
        let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
        u32::try_from(kb / 1024).ok()
    };
    Some(MachineMemory { total_mb: mb("MemTotal")?, available_mb: mb("MemAvailable")? })
}

/// `df -Pk` (its line), `du -sk`, then the two inotify limits
fn parse_facts(text: &str) -> Option<HostFacts> {
    let mut lines = text.lines().filter(|l| !l.trim().is_empty());
    let free_kb: u64 = lines.next()?.split_whitespace().nth(3)?.parse().ok()?;
    let cache_kb: u64 = lines.next()?.split_whitespace().next()?.parse().ok()?;
    let watches: u32 = lines.next()?.trim().parse().ok()?;
    let instances: u32 = lines.next()?.trim().parse().ok()?;
    Some(HostFacts {
        disk_free_mb: (free_kb / 1024) as u32,
        cache_mb: (cache_kb / 1024) as u32,
        inotify_watches: watches,
        inotify_instances: instances,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn containers_are_told_apart_by_their_labels() {
        let labels = |pairs: &[(&str, &str)]| pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        let owned = vec!["k8s".to_string()];
        assert_eq!(owner(&labels(&[(CLUSTER_LABEL, "k8s")]), &owned), Owner::Cluster { cluster: "k8s".into() });
        // Another kind cluster on the machine is not ckpro's
        assert_eq!(owner(&labels(&[(CLUSTER_LABEL, "dev")]), &owned), Owner::Other { cluster: Some("dev".into()) });
        // A proof's cluster: not the app's to manage, but ckpro's
        assert_eq!(
            owner(&labels(&[(CLUSTER_LABEL, "k8s-v641f"), (PROJECT_LABEL, "ckpro")]), &owned),
            Owner::Cluster { cluster: "k8s-v641f".into() }
        );
        assert_eq!(
            owner(&labels(&[(PROJECT_LABEL, "ckpro"), (SERVICE_LABEL, "ckpro-mirror")]), &owned),
            Owner::Service { service: "ckpro-mirror".into() }
        );
        assert_eq!(owner(&labels(&[(PROJECT_LABEL, "shop"), (SERVICE_LABEL, "db")]), &owned), Owner::Other { cluster: None });
    }

    #[test]
    fn the_machines_facts_are_read_from_its_tools() {
        let text = "overlay 296475260 24062452 257324076 9% /var/lib/registry\n1458688\t/var/lib/registry\n1048576\n8192\n";
        let facts = parse_facts(text).unwrap();
        assert_eq!((facts.disk_free_mb, facts.cache_mb), (251_293, 1424));
        assert_eq!((facts.inotify_watches, facts.inotify_instances), (1_048_576, 8192));
        assert!(parse_facts("df: not found").is_none());
    }

    #[test]
    fn the_machines_memory_is_read_from_its_kernel() {
        let text = "MemTotal:       15844352 kB\nMemFree:         1539072 kB\nMemAvailable:    7371776 kB\nBuffers:          123 kB\n";
        assert_eq!(parse_memory(text), Some(MachineMemory { total_mb: 15_473, available_mb: 7199 }));
        // A kernel too old to say what is available: not guessed
        assert_eq!(parse_memory("MemTotal:       15844352 kB\nMemFree:         1539072 kB\n"), None);
    }
}
