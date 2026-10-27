//! Checks before creating a cluster, so the user learns up front what is
//! missing instead of from a failed kind run.

use super::model::{ContainerStatus, DockerState, EnvState, NodeRole};
use serde::Serialize;

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

/// Memory an exam needs: its clusters (control plane and workers each), the
/// desktop, the task host and mirror, and headroom
pub fn exam_memory_mb(topology: &std::collections::BTreeMap<String, u8>) -> u32 {
    topology.values().map(|workers| CONTROL_PLANE_MB + WORKER_MB * u32::from(*workers)).sum::<u32>()
        + DESKTOP_MB
        + SUPPORT_MB
        + HEADROOM_MB
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

/// Whether an exam needing `needed_mb` fits in what Docker has left: the
/// reason when it does not, before anything is created. Its own `clusters`,
/// if they run, are replaced by it: not counted
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
            "This exam needs ~{:.1} GB of memory; Docker has {:.1} GB free ({:.1} GB in all, ~{:.1} GB used by running clusters). Raise the memory limit in OrbStack or Docker Desktop, or delete a cluster.",
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

#[derive(Serialize, specta::Type)]
pub struct Check {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

pub fn check(state: &EnvState, name: &str, workers: u8) -> Vec<Check> {
    let DockerState::Up { cpus, memory_mb, .. } = state.docker else {
        return vec![Check {
            name: "Docker".into(),
            ok: false,
            detail: "Docker is not running. Start OrbStack or Docker Desktop.".into(),
        }];
    };

    let in_use = in_use_mb(state, &[]);
    let needed = CONTROL_PLANE_MB + WORKER_MB * u32::from(workers) + HEADROOM_MB;
    let free = memory_mb.saturating_sub(in_use);

    let taken = if state.clusters.iter().any(|c| c.name == name) {
        Some(format!("ckdry already has a cluster named '{name}'. Pick another name or delete it."))
    } else if state.foreign_clusters.iter().any(|c| c == name) {
        Some(format!(
            "a kind cluster named '{name}' already exists outside ckdry. Adopt it, delete it, or pick another name."
        ))
    } else {
        None
    };

    vec![
        Check { name: "Docker".into(), ok: true, detail: "running".into() },
        Check {
            name: "Name".into(),
            ok: taken.is_none(),
            detail: taken.unwrap_or_else(|| format!("'{name}' is free")),
        },
        Check {
            name: "Memory".into(),
            ok: free >= needed,
            detail: format!(
                "needs ~{needed} MB, {free} MB available to Docker ({memory_mb} MB total, ~{in_use} MB used by running clusters). Raise the memory limit in OrbStack / Docker Desktop or delete a cluster."
            ),
        },
        Check {
            name: "CPU".into(),
            ok: cpus >= 2,
            detail: format!("{cpus} CPUs available to Docker, at least 2 needed"),
        },
    ]
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
        assert!(exam_fits(&docker(8192, 4), exam_memory_mb(&one), &[]).is_ok());
        let small = exam_fits(&docker(3072, 4), exam_memory_mb(&one), &[]).unwrap_err();
        assert!(small.contains("needs ~3.7 GB") && small.contains("3.0 GB free"), "{small}");
        assert!(exam_fits(&docker(8192, 1), 1000, &[]).unwrap_err().contains("2 CPUs"));
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
