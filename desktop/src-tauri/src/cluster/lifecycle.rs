//! Cluster operations end to end: shared infrastructure, kind and add-ons.
//! Callers then refresh the jumphost(s) that should reach the cluster.

use super::{access, kind::Kind};
use crate::error::{AppError, AppResult};
use crate::runtime::{docker, infra::Infra};
use tokio_util::sync::CancellationToken;

type Log<'a> = &'a (dyn Fn(String) + Sync);

/// Create a cluster ready for an exam. Cancelling stops it at any step
/// (images, kind, add-ons) and removes whatever kind had created.
pub async fn create(kind: &Kind, infra: &Infra, name: &str, workers: u8, log: Log<'_>, cancel: &CancellationToken) -> AppResult<()> {
    let cancelled = || AppError::Cancelled { message: format!("creating '{name}' was cancelled") };
    let docker = docker::connect().await?;
    tokio::select! {
        result = infra.ensure(&docker, log) => result?,
        _ = cancel.cancelled() => return Err(cancelled()),
    }
    let registry_config = infra.certs_dir();
    let made = tokio::select! {
        result = async {
            kind.create(name, workers, &registry_config, log).await?;
            log("Installing metrics-server".into());
            access::install_addons(&docker, name).await
        } => result,
        _ = cancel.cancelled() => Err(cancelled()),
    };
    if matches!(made, Err(AppError::Cancelled { .. })) {
        log("Cancelled, removing the partial cluster…".into());
        if let Err(e) = kind.delete(name, log).await {
            log(format!("Could not remove the partial cluster: {e}"));
        }
    }
    made
}

pub async fn delete(kind: &Kind, name: &str, log: Log<'_>) -> AppResult<()> {
    kind.delete(name, log).await
}

/// Remove a cluster as the candidate asks (Environment): marked as being
/// removed meanwhile (`jobs`), shown as an activity, then the task host
/// forgets it
pub async fn remove(
    kind: &Kind,
    jumphost: &crate::runtime::jumphost::Jumphost,
    jobs: &super::jobs::Jobs,
    activities: &std::sync::Arc<crate::runtime::activity::Activities>,
    name: &str,
) -> AppResult<()> {
    let _job = jobs.begin(name, crate::runtime::model::ClusterJob::Removing)?;
    let op =
        activities.begin(format!("Removing cluster {name}"), vec![format!("Removing cluster {name}"), "Updating the task host".into()]);
    let send = |line: String| op.log(line);
    let result = async {
        delete(kind, name, &send).await?;
        op.step(1, None);
        jumphost.refresh_access(&docker::connect().await?, kind, &crate::runtime::jumphost::app_placement(kind)).await.map(drop)
    }
    .await;
    op.end(result)
}
