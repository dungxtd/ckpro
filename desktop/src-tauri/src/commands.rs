//! Tauri commands: thin wrappers over the runtime, cluster, lab and terminal
//! modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::kind::Kind;
use crate::error::AppResult;
use crate::lab::script::ScriptResult;
use crate::terminal::{TerminalEvent, Terminals};
use tauri::State;
use tauri::ipc::Channel;

/// Docker engine name and version, or why it is unreachable.
#[tauri::command]
#[specta::specta]
pub async fn docker_status() -> AppResult<String> {
    let docker = crate::runtime::docker::connect().await?;
    let version = docker.version().await?;
    Ok(format!(
        "{} {}",
        version.platform.map(|p| p.name).unwrap_or_default(),
        version.version.unwrap_or_default()
    ))
}

/// Create a cluster, streaming kind's output lines to `log`.
#[tauri::command]
#[specta::specta]
pub async fn create_cluster(
    kind: State<'_, Kind>,
    name: String,
    workers: u8,
    log: Channel<String>,
) -> AppResult<()> {
    kind.create(&name, workers, &|line| {
        let _ = log.send(line);
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(kind: State<'_, Kind>, name: String, log: Channel<String>) -> AppResult<()> {
    kind.delete(&name, &|line| {
        let _ = log.send(line);
    })
    .await
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
