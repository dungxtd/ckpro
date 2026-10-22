//! Tauri commands: thin wrappers over the runtime, cluster, lab and terminal
//! modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::kind::Kind;
use crate::error::{AppError, AppResult};
use crate::lab::script::ScriptResult;
use crate::runtime::model::{DockerState, Env, EnvState};
use crate::runtime::preflight::{self, Check};
use crate::terminal::{TerminalEvent, Terminals};
use std::sync::Arc;
use tauri::State;
use tauri::ipc::Channel;

/// Current environment; later changes arrive as `EnvChanged` events.
#[tauri::command]
#[specta::specta]
pub fn env_state(env: State<'_, Arc<Env>>) -> EnvState {
    env.snapshot()
}

/// What creating a cluster with `workers` workers needs, and whether it is there.
#[tauri::command]
#[specta::specta]
pub fn preflight(env: State<'_, Arc<Env>>, workers: u8) -> Vec<Check> {
    preflight::check(&env.snapshot(), workers)
}

/// Create a cluster, streaming kind's output lines to `log`. Cancelling
/// (`cancel_cluster`) stops kind and removes whatever it had created.
#[tauri::command]
#[specta::specta]
pub async fn create_cluster(
    kind: State<'_, Arc<Kind>>,
    jobs: State<'_, Jobs>,
    env: State<'_, Arc<Env>>,
    name: String,
    workers: u8,
    log: Channel<String>,
) -> AppResult<()> {
    if !matches!(env.snapshot().docker, DockerState::Up { .. }) {
        return Err(AppError::DockerUnavailable { message: "Docker is not running".into() });
    }
    let token = jobs.begin(&name)?;
    let send = |line: String| {
        let _ = log.send(line);
    };
    let result = tokio::select! {
        result = kind.create(&name, workers, &send) => result,
        _ = token.cancelled() => {
            send("Cancelled, removing the partial cluster…".into());
            let _ = kind.delete(&name, &send).await;
            Err(AppError::Cancelled { message: format!("creating '{name}' was cancelled") })
        }
    };
    jobs.end(&name);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(
    kind: State<'_, Arc<Kind>>,
    jobs: State<'_, Jobs>,
    name: String,
    log: Channel<String>,
) -> AppResult<()> {
    jobs.begin(&name)?;
    let result = kind
        .delete(&name, &|line| {
            let _ = log.send(line);
        })
        .await;
    jobs.end(&name);
    result
}

/// Cancel the operation running on a cluster; false when there is none.
#[tauri::command]
#[specta::specta]
pub fn cancel_cluster(jobs: State<'_, Jobs>, name: String) -> bool {
    jobs.cancel(&name)
}

/// Start a cluster's stopped nodes.
#[tauri::command]
#[specta::specta]
pub async fn repair_cluster(name: String) -> AppResult<()> {
    let docker = crate::runtime::docker::connect().await?;
    crate::runtime::reconcile::repair(&docker, &name).await
}

/// Run a lab script on the cluster's control plane.
#[tauri::command]
#[specta::specta]
pub async fn run_script(cluster: String, path: String) -> AppResult<ScriptResult> {
    crate::lab::script::run(&cluster, &path).await
}

/// Shell on a cluster node, with kubectl pointed at the cluster.
#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    terminals: State<'_, Terminals>,
    container: String,
    events: Channel<TerminalEvent>,
) -> AppResult<String> {
    let env = vec!["KUBECONFIG=/etc/kubernetes/admin.conf".into(), "TERM=xterm-256color".into()];
    terminals.open(&container, env, events).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_write(terminals: State<'_, Terminals>, id: String, data: String) -> AppResult<()> {
    terminals.write(&id, &data).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_resize(
    terminals: State<'_, Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    terminals.resize(&id, cols, rows).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_close(terminals: State<'_, Terminals>, id: String) -> AppResult<()> {
    terminals.close(&id).await;
    Ok(())
}
