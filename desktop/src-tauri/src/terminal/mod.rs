//! Interactive shells in exam containers: a `docker exec` with a TTY whose
//! output goes to the terminal's own IPC channel (not a global event).

use crate::error::{AppError, AppResult};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::pin::Pin;
use tauri::ipc::Channel;
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

struct Session {
    exec_id: String,
    input: Pin<Box<dyn AsyncWrite + Send>>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    /// base64, so multi-byte characters split across chunks survive
    Output { data: String },
    Exit,
}

impl Terminals {
    pub async fn open(
        &self,
        container: &str,
        env: Vec<String>,
        events: Channel<TerminalEvent>,
    ) -> AppResult<String> {
        let docker = crate::runtime::docker::connect().await?;
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
            .map_err(|e| match e {
                bollard::errors::Error::DockerResponseServerError { status_code: 404, .. } => {
                    AppError::not_found(format!("{container} is not running"))
                }
                e => AppError::docker(e),
            })?;
        let StartExecResults::Attached { mut output, input } =
            docker.start_exec(&exec.id, None).await?
        else {
            return Err(AppError::docker("shell started detached"));
        };

        let id = exec.id.clone();
        self.0.lock().await.insert(id.clone(), Session { exec_id: exec.id, input });
        tokio::spawn(async move {
            while let Some(Ok(chunk)) = output.next().await {
                let data = B64.encode(chunk.into_bytes());
                if events.send(TerminalEvent::Output { data }).is_err() {
                    break;
                }
            }
            let _ = events.send(TerminalEvent::Exit);
        });
        Ok(id)
    }

    pub async fn write(&self, id: &str, data: &str) -> AppResult<()> {
        let mut sessions = self.0.lock().await;
        let session = sessions.get_mut(id).ok_or_else(|| AppError::not_found("terminal closed"))?;
        session.input.write_all(data.as_bytes()).await.map_err(|e| AppError::io("terminal", e))?;
        session.input.flush().await.map_err(|e| AppError::io("terminal", e))
    }

    pub async fn resize(&self, id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let Some(exec_id) = self.0.lock().await.get(id).map(|s| s.exec_id.clone()) else {
            return Ok(());
        };
        let docker = crate::runtime::docker::connect().await?;
        docker.resize_exec(&exec_id, ResizeExecOptions { width: cols, height: rows }).await?;
        Ok(())
    }

    pub async fn close(&self, id: &str) {
        if let Some(mut session) = self.0.lock().await.remove(id) {
            // bash exits on EOF
            let _ = session.input.shutdown().await;
        }
    }

    /// Ends every shell (app exit).
    pub async fn close_all(&self) {
        for (_, mut session) in self.0.lock().await.drain() {
            let _ = session.input.shutdown().await;
        }
    }
}
