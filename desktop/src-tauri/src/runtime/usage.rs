//! What every running container takes, for the Environment page's memory
//! map: cktry's cluster nodes, its own services, and whatever else runs in
//! the same Docker. One sample per container (no streaming), only while the
//! page is open.

use super::model::{ContainerUse, Owner};
use crate::cluster::kind::CLUSTER_LABEL;
use bollard::Docker;
use bollard::query_parameters::{ListContainersOptions, StatsOptions};
use futures_util::StreamExt;

/// The compose label naming a container's service (`compose_labels`)
const SERVICE_LABEL: &str = "com.docker.compose.service";
const PROJECT_LABEL: &str = "com.docker.compose.project";

/// The running containers and their memory now, largest first. `owned`:
/// cktry's clusters (other kind clusters count as other apps)
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
        // nodes the kind shim labels as cktry's
        let cktrys = labels.get(PROJECT_LABEL).is_some_and(|p| p == super::docker::COMPOSE_PROJECT);
        return if owned.contains(cluster) || cktrys {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn containers_are_told_apart_by_their_labels() {
        let labels = |pairs: &[(&str, &str)]| pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        let owned = vec!["k8s".to_string()];
        assert_eq!(owner(&labels(&[(CLUSTER_LABEL, "k8s")]), &owned), Owner::Cluster { cluster: "k8s".into() });
        // Another kind cluster on the machine is not cktry's
        assert_eq!(owner(&labels(&[(CLUSTER_LABEL, "dev")]), &owned), Owner::Other { cluster: Some("dev".into()) });
        // A proof's cluster: not the app's to manage, but cktry's
        assert_eq!(
            owner(&labels(&[(CLUSTER_LABEL, "k8s-v641f"), (PROJECT_LABEL, "cktry")]), &owned),
            Owner::Cluster { cluster: "k8s-v641f".into() }
        );
        assert_eq!(
            owner(&labels(&[(PROJECT_LABEL, "cktry"), (SERVICE_LABEL, "cktry-mirror")]), &owned),
            Owner::Service { service: "cktry-mirror".into() }
        );
        assert_eq!(owner(&labels(&[(PROJECT_LABEL, "shop"), (SERVICE_LABEL, "db")]), &owned), Owner::Other { cluster: None });
    }
}
