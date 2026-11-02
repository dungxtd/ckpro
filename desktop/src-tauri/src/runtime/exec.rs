//! Run a command in a container (no TTY), optionally feeding it stdin, and
//! collect its output and exit code.

use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::exec::{CreateExecOptions, StartExecResults};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

pub struct Output {
    pub exit_code: i64,
    pub text: String,
}

/// `s` as one word for the shell, whatever it holds
pub fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub async fn run(
    docker: &Docker,
    container: &str,
    cmd: &[&str],
    env: &[&str],
    stdin: Option<&[u8]>,
) -> AppResult<Output> {
    run_tail(docker, container, cmd, env, stdin, None).await
}

/// `run`, keeping at most the last `max` bytes of output when set: a long
/// command's output is read as it comes, never held whole
pub async fn run_tail(
    docker: &Docker,
    container: &str,
    cmd: &[&str],
    env: &[&str],
    stdin: Option<&[u8]>,
    max: Option<usize>,
) -> AppResult<Output> {
    let exec = docker
        .create_exec(
            container,
            CreateExecOptions {
                attach_stdin: Some(stdin.is_some()),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                env: Some(env.to_vec()),
                cmd: Some(cmd.to_vec()),
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
    // cktry's own: the guard does not report it as outside access
    super::guard::own_exec(&exec.id);
    let StartExecResults::Attached { mut output, mut input } = docker.start_exec(&exec.id, None).await?
    else {
        return Err(AppError::docker("exec started detached"));
    };
    if let Some(stdin) = stdin {
        input.write_all(stdin).await.map_err(|e| AppError::io("writing stdin", e))?;
        input.shutdown().await.map_err(|e| AppError::io("writing stdin", e))?;
    }
    let mut bytes = std::collections::VecDeque::new();
    while let Some(chunk) = output.next().await {
        bytes.extend(chunk?.into_bytes());
        if let Some(max) = max {
            let over = bytes.len().saturating_sub(max);
            bytes.drain(..over);
        }
    }
    let text = String::from_utf8_lossy(bytes.make_contiguous()).into_owned();
    let exit_code = docker.inspect_exec(&exec.id).await?.exit_code.unwrap_or(-1);
    Ok(Output { exit_code, text })
}
