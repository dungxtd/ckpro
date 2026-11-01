//! Checks before creating a cluster, so the user learns up front what is
//! missing instead of from a failed kind run.

use super::model::{ContainerStatus, DockerState, EnvState, NodeRole};
use serde::{Deserialize, Serialize};

/// Rough memory use of kind nodes, measured on kubeadm v1.35 nodes (a
/// control plane ~545 MB, a worker ~150 MB idle: room left for the tasks' pods)
const CONTROL_PLANE_MB: u32 = 700;
const WORKER_MB: u32 = 300;
/// Left for the engine, the app and the exam workloads
const HEADROOM_MB: u32 = 1024;
/// The exam desktop with Firefox and VSCodium open (1.05 GB measured)
const DESKTOP_MB: u32 = 1100;
/// The task host and the registry mirror (~5 and ~50 MB measured)
const SUPPORT_MB: u32 = 100;

/// What the same takes idle, as measured: below it the exam cannot run
const CONTROL_PLANE_IDLE_MB: u32 = 550;
const WORKER_IDLE_MB: u32 = 150;
const DESKTOP_IDLE_MB: u32 = 1050;
const SUPPORT_IDLE_MB: u32 = 50;

/// Memory an exam runs comfortably in: its clusters (control plane and
/// workers each), the desktop, the task host and mirror, and headroom
pub fn exam_memory_mb(topology: &std::collections::BTreeMap<String, u8>) -> u32 {
    topology.values().map(|workers| CONTROL_PLANE_MB + WORKER_MB * u32::from(*workers)).sum::<u32>()
        + DESKTOP_MB
        + SUPPORT_MB
        + HEADROOM_MB
}

/// Memory an exam cannot run without: the same, idle and without headroom,
/// or what its nodes took when last graded on this machine if more. Between
/// the two it runs, slower (Docker swaps, pods start late)
pub fn exam_minimum_mb(topology: &std::collections::BTreeMap<String, u8>, measured: &Footprint) -> u32 {
    let control_plane = CONTROL_PLANE_IDLE_MB.max(measured.control_plane_mb);
    let worker = WORKER_IDLE_MB.max(measured.worker_mb);
    topology.values().map(|workers| control_plane + worker * u32::from(*workers)).sum::<u32>()
        + DESKTOP_IDLE_MB
        + SUPPORT_IDLE_MB
}

/// Memory a kind node took on this machine, per role (MB; 0: not measured)
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Footprint {
    pub control_plane_mb: u32,
    pub worker_mb: u32,
}

impl Footprint {
    /// The largest node of each role among `clusters`, at grading (the tasks'
    /// pods still run). One sample per node, without waiting for a CPU reading
    pub async fn measure(docker: &bollard::Docker, clusters: &[String]) -> Option<Self> {
        let nodes = crate::cluster::kind::node_containers(docker, None).await.ok()?;
        let samples = nodes.iter().filter(|n| clusters.contains(&n.cluster) && n.state == "running").map(|n| async move {
            let options = bollard::query_parameters::StatsOptions { stream: false, one_shot: true };
            let stats = futures_util::StreamExt::next(&mut docker.stats(&n.name, Some(options))).await?.ok()?;
            Some((n.control_plane, used_mb(&stats.memory_stats?)))
        });
        let mut footprint = Self::default();
        for (control_plane, mb) in futures_util::future::join_all(samples).await.into_iter().flatten() {
            let role = if control_plane { &mut footprint.control_plane_mb } else { &mut footprint.worker_mb };
            *role = (*role).max(mb);
        }
        (footprint != Self::default()).then_some(footprint)
    }

    /// Averaged with the earlier measurement, so one heavy or light attempt
    /// moves it only halfway
    pub fn blend(self, new: Self) -> Self {
        let mix = |old: u32, new: u32| if old == 0 || new == 0 { old.max(new) } else { (old + new) / 2 };
        Self { control_plane_mb: mix(self.control_plane_mb, new.control_plane_mb), worker_mb: mix(self.worker_mb, new.worker_mb) }
    }
}

/// Memory in use, without the page cache the kernel gives back under pressure
fn used_mb(memory: &bollard::models::ContainerMemoryStats) -> u32 {
    let cache = memory.stats.as_ref().and_then(|s| s.get("inactive_file").or_else(|| s.get("cache"))).copied().unwrap_or(0);
    (memory.usage.unwrap_or(0).saturating_sub(cache) / (1024 * 1024)) as u32
}

/// Memory the running clusters take now (estimated per node), but `except`
fn in_use_mb(state: &EnvState, except: &[String]) -> u32 {
    state
        .clusters
        .iter()
        .filter(|c| !except.contains(&c.name))
        .flat_map(|c| &c.nodes)
        .filter(|n| n.container == ContainerStatus::Running)
        .map(|n| if n.role == NodeRole::ControlPlane { CONTROL_PLANE_MB } else { WORKER_MB })
        .sum()
}

/// Whether an exam needing at least `needed_mb` (`exam_minimum_mb`) fits in
/// what Docker has left: the reason when it does not, before anything is
/// created. Its own `clusters`, if they run, are replaced by it: not counted
pub fn exam_fits(state: &EnvState, needed_mb: u32, clusters: &[String]) -> Result<(), String> {
    let DockerState::Up { cpus, memory_mb, .. } = state.docker else {
        return Err("Docker is not running. Start OrbStack or Docker Desktop.".into());
    };
    if cpus < 2 {
        return Err(format!("This exam needs at least 2 CPUs for Docker; it has {cpus}."));
    }
    let in_use = in_use_mb(state, clusters);
    let free = memory_mb.saturating_sub(in_use);
    if free < needed_mb {
        return Err(format!(
            "This exam needs at least {:.1} GB of memory; Docker has {:.1} GB free ({:.1} GB in all, ~{:.1} GB used by running clusters). Raise the memory limit in OrbStack or Docker Desktop, or delete a cluster.",
            gb(needed_mb),
            gb(free),
            gb(memory_mb),
            gb(in_use)
        ));
    }
    Ok(())
}

fn gb(mb: u32) -> f64 {
    f64::from(mb) / 1024.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::model::{ClusterState, NodeState, Readiness};

    fn docker(memory_mb: u32, cpus: u32) -> EnvState {
        EnvState { docker: DockerState::Up { engine: String::new(), version: String::new(), cpus, memory_mb }, ..Default::default() }
    }

    #[test]
    fn an_exam_needs_its_clusters_the_desktop_and_headroom() {
        let one = std::collections::BTreeMap::from([("k8s".to_string(), 3u8)]);
        assert_eq!(exam_memory_mb(&one), 700 + 3 * 300 + 1100 + 100 + 1024);
        // It runs below that, slower, down to the idle footprint
        let idle = Footprint::default();
        assert_eq!(exam_minimum_mb(&one, &idle), 550 + 3 * 150 + 1050 + 50);
        assert!(exam_fits(&docker(3072, 4), exam_minimum_mb(&one, &idle), &[]).is_ok());
        let small = exam_fits(&docker(2048, 4), exam_minimum_mb(&one, &idle), &[]).unwrap_err();
        assert!(small.contains("at least 2.1 GB") && small.contains("2.0 GB free"), "{small}");
        assert!(exam_fits(&docker(8192, 1), 1000, &[]).unwrap_err().contains("2 CPUs"));
    }

    #[test]
    fn the_minimum_follows_what_nodes_took_here() {
        let one = std::collections::BTreeMap::from([("k8s".to_string(), 2u8)]);
        // Heavier than idle raises it; lighter never lowers it below idle
        let heavy = Footprint { control_plane_mb: 800, worker_mb: 400 };
        assert_eq!(exam_minimum_mb(&one, &heavy), 800 + 2 * 400 + 1050 + 50);
        let light = Footprint { control_plane_mb: 300, worker_mb: 100 };
        assert_eq!(exam_minimum_mb(&one, &light), exam_minimum_mb(&one, &Footprint::default()));
        // A new measurement moves the old one halfway; the first is taken as is
        assert_eq!(Footprint::default().blend(heavy), heavy);
        assert_eq!(heavy.blend(light), Footprint { control_plane_mb: 550, worker_mb: 250 });
    }

    #[test]
    fn running_clusters_count_unless_the_exam_replaces_them() {
        let mut state = docker(4096, 4);
        let node = |name: &str, role| NodeState { name: name.into(), role, container: ContainerStatus::Running, ready: Readiness::Unknown };
        state.clusters = vec![ClusterState {
            name: "k8s".into(),
            nodes: vec![node("k8s-control-plane", NodeRole::ControlPlane), node("k8s-worker", NodeRole::Worker)],
        }];
        // 4096 - 1000 in use = 3096 free: a 3324 MB exam does not fit...
        assert!(exam_fits(&state, 3324, &[]).is_err());
        // ...unless it replaces that cluster
        assert!(exam_fits(&state, 3324, &["k8s".to_string()]).is_ok());
    }
}
