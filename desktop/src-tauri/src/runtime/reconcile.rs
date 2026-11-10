//! Bring owned clusters back to a usable state: on startup (after Docker, the
//! machine or the app restarted) and when the user asks for a repair. Quitting
//! the app stops them, so an idle exam costs no memory or CPU.

use super::activity::Activities;
use crate::cluster::kind::{Kind, node_containers};
use crate::error::AppResult;
use bollard::Docker;
use std::sync::Arc;

/// Forget clusters whose nodes are gone, start the ones that are stopped,
/// and the cache, task host and desktop they work with. Shown as an activity
/// when there is something to start (the app reopened after quitting). The
/// clusters of an attempt being resumed, and its task host and desktop, are
/// left to the resume: started once, in its own activity.
pub async fn on_startup(
    docker: &Docker,
    kind: &Kind,
    activities: &Arc<Activities>,
    jobs: &crate::cluster::jobs::Jobs,
    resuming: &[String],
) {
    let mut stopped_services = Vec::new();
    let services: &[&str] = if resuming.is_empty() {
        &[super::infra::MIRROR, super::jumphost::APP_NAME, super::desktop::NAME]
    } else {
        &[super::infra::MIRROR]
    };
    for &name in services {
        if let Ok(info) = docker.inspect_container(name, None).await
            && !info.state.and_then(|s| s.running).unwrap_or(false)
        {
            stopped_services.push(name);
        }
    }
    let mut stopped_clusters = Vec::new();
    for name in kind.owned_clusters().into_iter().filter(|c| !resuming.contains(c)) {
        match node_containers(docker, Some(&name)).await {
            Ok(nodes) if nodes.is_empty() => {
                tracing::info!(cluster = %name, "forgetting cluster without nodes");
                kind.forget(&name);
            }
            Ok(nodes) if nodes.iter().any(|n| n.state != "running") => stopped_clusters.push(name),
            Ok(_) => {}
            Err(e) => tracing::warn!(cluster = %name, error = %e, "inspecting cluster"),
        }
    }
    if stopped_services.is_empty() && stopped_clusters.is_empty() {
        return;
    }

    let mut steps: Vec<String> = stopped_clusters.iter().map(|c| format!("Starting cluster {c}")).collect();
    if !stopped_services.is_empty() {
        steps.push("Starting the registry cache, task host and desktop".into());
    }
    // Shown starting at once (no Repair offered meanwhile), each until done
    let mut starting: Vec<_> = stopped_clusters
        .iter()
        .map(|c| jobs.begin(c, super::model::ClusterJob::Starting).ok())
        .collect();
    let op = activities.begin("Starting your environment", steps);
    let mut failed = Vec::new();
    for (i, name) in stopped_clusters.iter().enumerate() {
        op.step(i as u32, None);
        // Something else took it on first (a Repair, a Delete)
        let Some(job) = starting[i].take() else { continue };
        let result = repair(docker, name).await;
        drop(job);
        if let Err(e) = result {
            op.log(format!("could not start {name}: {e}"));
            failed.push(name.clone());
        }
    }
    if !stopped_services.is_empty() {
        op.step(stopped_clusters.len() as u32, None);
        for name in stopped_services {
            op.log(format!("starting {name}"));
            if let Err(e) = super::infra::start_existing(docker, name).await {
                op.log(format!("could not start {name}: {e}"));
                failed.push(name.to_string());
            }
        }
    }
    if failed.is_empty() {
        op.done();
    } else {
        op.fail(format!("could not start {}", failed.join(", ")));
    }
}

/// Start stopped nodes, control plane first (kind re-points the nodes at
/// their new IPs when they boot).
pub async fn repair(docker: &Docker, cluster: &str) -> AppResult<()> {
    let mut nodes = node_containers(docker, Some(cluster)).await?;
    nodes.sort_by_key(|n| !n.control_plane);
    for node in nodes {
        if node.state != "running" {
            tracing::info!(node = %node.name, "starting node");
            docker.start_container(&node.name, None::<bollard::query_parameters::StartContainerOptions>).await?;
        }
    }
    Ok(())
}


/// Stop the app's clusters, jumphost and cache when it quits; `on_startup`
/// starts them again. Handed to a detached `docker stop` so quitting is
/// instant (verify runs from the CLI are not touched).
pub fn on_exit(kind: &Kind) {
    let mut containers = super::docker::cluster_containers_now(&kind.owned_clusters(), false);
    containers.extend([super::infra::MIRROR, super::jumphost::APP_NAME, super::desktop::NAME].map(str::to_string));
    super::docker::detached(["stop", "-t", "5"].into_iter().map(str::to_string).chain(containers));
}
