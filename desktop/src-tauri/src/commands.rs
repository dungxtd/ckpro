//! Tauri commands: thin wrappers over the runtime, cluster, lab and terminal
//! modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::{kind::Kind, lifecycle};
use crate::runtime::infra::{self, Infra};
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
pub fn preflight(env: State<'_, Arc<Env>>, name: String, workers: u8) -> Vec<Check> {
    preflight::check(&env.snapshot(), &name, workers)
}

/// Create a cluster, streaming kind's output lines to `log`. Cancelling
/// (`cancel_cluster`) stops kind and removes whatever it had created.
#[tauri::command]
#[specta::specta]
pub async fn create_cluster(
    kind: State<'_, Arc<Kind>>,
    infra: State<'_, Arc<Infra>>,
    jobs: State<'_, Jobs>,
    env: State<'_, Arc<Env>>,
    name: String,
    workers: u8,
    log: Channel<String>,
) -> AppResult<()> {
    let state = env.snapshot();
    if !matches!(state.docker, DockerState::Up { .. }) {
        return Err(AppError::DockerUnavailable { message: "Docker is not running".into() });
    }
    // kind would fail late with "node(s) already exist"; say why up front
    if let Some(check) = preflight::check(&state, &name, workers).into_iter().find(|c| c.name == "Name" && !c.ok) {
        return Err(AppError::invalid(check.detail));
    }
    let token = jobs.begin(&name)?;
    let send = |line: String| {
        let _ = log.send(line);
    };
    let result = lifecycle::create(&kind, &infra, &name, workers, &send, &token).await;
    jobs.end(&name);
    env.request_resync();
    result
}

#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(
    kind: State<'_, Arc<Kind>>,
    infra: State<'_, Arc<Infra>>,
    jobs: State<'_, Jobs>,
    name: String,
    log: Channel<String>,
) -> AppResult<()> {
    jobs.begin(&name)?;
    let send = |line: String| {
        let _ = log.send(line);
    };
    let result = lifecycle::delete(&kind, &infra, &name, &send).await;
    jobs.end(&name);
    result
}

/// Cancel the operation running on a cluster; false when there is none.
#[tauri::command]
#[specta::specta]
pub fn cancel_cluster(jobs: State<'_, Jobs>, name: String) -> bool {
    jobs.cancel(&name)
}

/// Manage an existing kind cluster created outside ckdry.
#[tauri::command]
#[specta::specta]
pub async fn adopt_cluster(
    kind: State<'_, Arc<Kind>>,
    infra: State<'_, Arc<Infra>>,
    env: State<'_, Arc<Env>>,
    name: String,
) -> AppResult<()> {
    lifecycle::adopt(&kind, &infra, &name, &|line| tracing::info!("{line}")).await?;
    env.request_resync();
    Ok(())
}

/// Start a cluster's stopped nodes.
#[tauri::command]
#[specta::specta]
pub async fn repair_cluster(name: String) -> AppResult<()> {
    let docker = crate::runtime::docker::connect().await?;
    crate::runtime::reconcile::repair(&docker, &name).await
}

/// Run a lab script on the jumphost.
#[tauri::command]
#[specta::specta]
pub async fn run_script(path: String) -> AppResult<ScriptResult> {
    crate::lab::script::run(&path).await
}

/// Shell on the jumphost (no `container`) or directly on a cluster node.
#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    terminals: State<'_, Terminals>,
    container: Option<String>,
    events: Channel<TerminalEvent>,
) -> AppResult<String> {
    let container = container.unwrap_or_else(|| infra::JUMPHOST.into());
    terminals.open(&container, vec!["TERM=xterm-256color".into()], events).await
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
