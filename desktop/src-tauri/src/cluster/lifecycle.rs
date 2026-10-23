//! Cluster operations end to end: shared infrastructure, kind and add-ons.
//! Callers then refresh the jumphost(s) that should reach the cluster.

use super::{access, kind::Kind};
use crate::error::{AppError, AppResult};
use crate::runtime::{docker, infra::Infra};
use tokio_util::sync::CancellationToken;

type Log<'a> = &'a (dyn Fn(String) + Sync);

/// Create a cluster ready for an exam. Cancelling stops kind and removes
/// whatever it had created.
pub async fn create(
    kind: &Kind,
    infra: &Infra,
    name: &str,
    workers: u8,
    log: Log<'_>,
    cancel: &CancellationToken,
) -> AppResult<()> {
    let docker = docker::connect().await?;
    infra.ensure(&docker, log).await?;
    let registry_config = infra.certs_dir();
    let created = tokio::select! {
        result = kind.create(name, workers, &registry_config, log) => result,
        _ = cancel.cancelled() => {
            log("Cancelled, removing the partial cluster…".into());
            let _ = kind.delete(name, log).await;
            Err(AppError::Cancelled { message: format!("creating '{name}' was cancelled") })
        }
    };
    created?;
    log("Installing metrics-server".into());
    access::install_addons(&docker, name).await
}

pub async fn delete(kind: &Kind, name: &str, log: Log<'_>) -> AppResult<()> {
    kind.delete(name, log).await
}

pub async fn adopt(kind: &Kind, infra: &Infra, name: &str, log: Log<'_>) -> AppResult<()> {
    infra.ensure(&docker::connect().await?, log).await?;
    kind.adopt(name).await
}
