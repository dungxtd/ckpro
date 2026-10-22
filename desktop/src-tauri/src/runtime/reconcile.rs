//! Bring owned clusters back to a usable state: on startup (after Docker or
//! the machine restarted) and when the user asks for a repair.

use crate::cluster::kind::Kind;
use crate::error::AppResult;
use bollard::Docker;
use bollard::query_parameters::ListContainersOptions;
use std::collections::HashMap;

/// Forget clusters whose nodes are gone, start the ones that are stopped.
pub async fn on_startup(docker: &Docker, kind: &Kind) {
    for name in kind.owned_clusters() {
        match nodes(docker, &name).await {
            Ok(nodes) if nodes.is_empty() => {
                tracing::info!(cluster = %name, "forgetting cluster without nodes");
                kind.forget(&name);
            }
            Ok(_) => {
                if let Err(e) = repair(docker, &name).await {
                    tracing::warn!(cluster = %name, error = %e, "starting cluster");
                }
            }
            Err(e) => tracing::warn!(cluster = %name, error = %e, "inspecting cluster"),
        }
    }
}

/// Start stopped nodes, control plane first (kind re-points the nodes at
/// their new IPs when they boot).
pub async fn repair(docker: &Docker, cluster: &str) -> AppResult<()> {
    let mut nodes = nodes(docker, cluster).await?;
    nodes.sort_by_key(|(_, role, _)| role != "control-plane");
    for (name, _, state) in nodes {
        if state != "running" {
            tracing::info!(node = %name, "starting node");
            docker.start_container(&name, None::<bollard::query_parameters::StartContainerOptions>).await?;
        }
    }
    Ok(())
}

/// (container name, kind role, container state) of a cluster's nodes.
async fn nodes(docker: &Docker, cluster: &str) -> AppResult<Vec<(String, String, String)>> {
    let containers = docker
        .list_containers(Some(ListContainersOptions {
            all: true,
            filters: Some(HashMap::from([(
                "label".to_string(),
                vec![format!("io.x-k8s.kind.cluster={cluster}")],
            )])),
            ..Default::default()
        }))
        .await?;
    Ok(containers
        .into_iter()
        .map(|c| {
            let labels = c.labels.unwrap_or_default();
            (
                c.names.and_then(|n| n.first().cloned()).unwrap_or_default().trim_start_matches('/').to_string(),
                labels.get("io.x-k8s.kind.role").cloned().unwrap_or_default(),
                c.state.map(|s| s.to_string()).unwrap_or_default(),
            )
        })
        .collect())
}
