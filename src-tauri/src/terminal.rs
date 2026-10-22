//! Interactive shells in exam containers: a `docker exec` with a TTY, bytes
//! streamed to xterm.js through `terminal-output` events.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::pin::Pin;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

struct Session {
    exec_id: String,
    input: Pin<Box<dyn AsyncWrite + Send>>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);

#[derive(Clone, Serialize)]
struct TerminalOutput {
    id: String,
    /// base64, so multi-byte characters split across chunks survive
    data: String,
}

pub async fn open(
    app: AppHandle,
    terminals: &Terminals,
    container: &str,
    env: Vec<String>,
) -> Result<String, String> {
    let docker = crate::docker::connect().await?;
    let exec = docker
        .create_exec(
            container,
            CreateExecOptions {
                attach_stdin: Some(true),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                tty: Some(true),
                env: Some(env.iter().map(String::as_str).collect()),
                cmd: Some(vec!["bash", "-l"]),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| format!("opening a shell in {container}: {e}"))?;
    let StartExecResults::Attached { mut output, input } =
        docker.start_exec(&exec.id, None).await.map_err(|e| e.to_string())?
    else {
        return Err("shell started detached".into());
    };

    let id = exec.id.clone();
    terminals.0.lock().await.insert(id.clone(), Session { exec_id: exec.id, input });

    let event_id = id.clone();
    tokio::spawn(async move {
        while let Some(Ok(chunk)) = output.next().await {
            let _ = app.emit(
                "terminal-output",
                TerminalOutput { id: event_id.clone(), data: B64.encode(chunk.into_bytes()) },
            );
        }
        let _ = app.emit("terminal-exit", event_id);
    });
    Ok(id)
}

pub async fn write(terminals: &Terminals, id: &str, data: &str) -> Result<(), String> {
    let mut sessions = terminals.0.lock().await;
    let session = sessions.get_mut(id).ok_or("terminal closed")?;
    session.input.write_all(data.as_bytes()).await.map_err(|e| e.to_string())?;
    session.input.flush().await.map_err(|e| e.to_string())
}

pub async fn resize(terminals: &Terminals, id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let exec_id = match terminals.0.lock().await.get(id) {
        Some(session) => session.exec_id.clone(),
        None => return Ok(()),
    };
    let docker = crate::docker::connect().await?;
    docker
        .resize_exec(&exec_id, ResizeExecOptions { width: cols, height: rows })
        .await
        .map_err(|e| e.to_string())
}

pub async fn close(terminals: &Terminals, id: &str) {
    if let Some(mut session) = terminals.0.lock().await.remove(id) {
        // Ends the shell: bash exits on EOF
        let _ = session.input.shutdown().await;
    }
}
