//! Bring owned clusters back to a usable state: on startup (after Docker, the
//! machine or the app restarted) and when the user asks for a repair. Quitting
//! the app stops them, so an idle exam costs no memory or CPU.

use crate::cluster::kind::Kind;
use crate::error::AppResult;
use bollard::Docker;
use bollard::query_parameters::ListContainersOptions;
use std::collections::HashMap;

/// Forget clusters whose nodes are gone, start the ones that are stopped,
/// and the cache and jumphost they work with.
pub async fn on_startup(docker: &Docker, kind: &Kind) {
    for name in [super::infra::MIRROR, super::jumphost::APP_NAME, super::desktop::NAME] {
        if let Err(e) = super::infra::start_existing(docker, name).await {
            tracing::warn!(container = %name, error = %e, "starting");
        }
    }
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

/// Stop the app's clusters, jumphost and cache when it quits; `on_startup`
/// starts them again. Handed to a detached `docker stop` so quitting is
/// instant (verify runs from the CLI are not touched).
pub fn on_exit(kind: &Kind) {
    let clusters = kind.owned_clusters();
    let script = format!(
        "{{ for c in \"$@\"; do docker ps -q --filter label=io.x-k8s.kind.cluster=$c; done; \
         echo {mirror}; echo {jumphost}; echo {desktop}; }} | xargs docker stop -t 5 >/dev/null 2>&1",
        mirror = super::infra::MIRROR,
        jumphost = super::jumphost::APP_NAME,
        desktop = super::desktop::NAME,
    );
    let spawned = std::process::Command::new("sh")
        .args(["-c", &script, "sh"])
        .args(&clusters)
        .env("PATH", super::docker::cli_path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    if let Err(e) = spawned {
        tracing::warn!(error = %e, "stopping clusters on exit");
    }
}
