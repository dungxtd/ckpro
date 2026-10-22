//! Runs CK-X lab scripts (setup / validation) against an exam cluster, by
//! piping the script into `bash -s` on the cluster's control-plane node.

use crate::error::{AppError, AppResult};
use bollard::exec::{CreateExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;

#[derive(Serialize, specta::Type)]
pub struct ScriptResult {
    pub exit_code: i32,
    pub output: String,
}

pub async fn run(cluster: &str, script_path: &str) -> AppResult<ScriptResult> {
    let script = std::fs::read(script_path)
        .map_err(|_| AppError::not_found(format!("script not found: {script_path}")))?;
    let container = format!("{cluster}-control-plane");
    let docker = crate::runtime::docker::connect().await?;
    let exec = docker
        .create_exec(
            &container,
            CreateExecOptions {
                attach_stdin: Some(true),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                env: Some(vec!["KUBECONFIG=/etc/kubernetes/admin.conf"]),
                cmd: Some(vec!["bash", "-s"]),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| match e {
            bollard::errors::Error::DockerResponseServerError { status_code: 404, .. } => {
                AppError::not_found(format!("cluster '{cluster}' is not running"))
            }
            e => AppError::docker(e),
        })?;
    let StartExecResults::Attached { mut output, mut input } =
        docker.start_exec(&exec.id, None).await?
    else {
        return Err(AppError::docker("script started detached"));
    };

    input.write_all(&script).await.map_err(|e| AppError::io("sending script", e))?;
    input.shutdown().await.map_err(|e| AppError::io("sending script", e))?;

    let mut text = String::new();
    while let Some(chunk) = output.next().await {
        text.push_str(&String::from_utf8_lossy(&chunk?.into_bytes()));
    }
    let exit_code = docker.inspect_exec(&exec.id).await?.exit_code.unwrap_or(-1);
    Ok(ScriptResult { exit_code: exit_code as i32, output: text })
}
