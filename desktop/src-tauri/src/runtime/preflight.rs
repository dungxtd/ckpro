//! Checks before creating a cluster, so the user learns up front what is
//! missing instead of from a failed kind run.

use super::model::{ContainerStatus, DockerState, EnvState, NodeRole};
use serde::Serialize;

/// Rough memory use of kind nodes, measured on kubeadm v1.35 nodes
const CONTROL_PLANE_MB: u32 = 700;
const WORKER_MB: u32 = 300;
/// Left for the engine, the app and the exam workloads
const HEADROOM_MB: u32 = 1024;

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

    let in_use: u32 = state
        .clusters
        .iter()
        .flat_map(|c| &c.nodes)
        .filter(|n| n.container == ContainerStatus::Running)
        .map(|n| if n.role == NodeRole::ControlPlane { CONTROL_PLANE_MB } else { WORKER_MB })
        .sum();
    let needed = CONTROL_PLANE_MB + WORKER_MB * u32::from(workers) + HEADROOM_MB;
    let free = memory_mb.saturating_sub(in_use);

    let taken = if state.clusters.iter().any(|c| c.name == name) {
        Some(format!("ckiu already has a cluster named '{name}'. Pick another name or delete it."))
    } else if state.foreign_clusters.iter().any(|c| c == name) {
        Some(format!(
            "a kind cluster named '{name}' already exists outside ckiu. Adopt it, delete it, or pick another name."
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
