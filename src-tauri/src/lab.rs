//! Runs CK-X lab scripts (setup / validation) against an exam cluster, by
//! piping the script into `bash -s` on the cluster's control-plane node.

use bollard::exec::{CreateExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;

#[derive(Serialize)]
pub struct ScriptResult {
    pub exit_code: i64,
    pub output: String,
}

pub async fn run_script(cluster: &str, script_path: &str) -> Result<ScriptResult, String> {
    let script = std::fs::read(script_path).map_err(|e| format!("reading {script_path}: {e}"))?;
    let container = format!("{cluster}-control-plane");
    let docker = crate::docker::connect().await?;
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
        .map_err(|e| format!("running script on {container}: {e}"))?;
    let StartExecResults::Attached { mut output, mut input } =
        docker.start_exec(&exec.id, None).await.map_err(|e| e.to_string())?
    else {
        return Err("script started detached".into());
    };

    input.write_all(&script).await.map_err(|e| e.to_string())?;
    input.shutdown().await.map_err(|e| e.to_string())?;

    let mut text = String::new();
    while let Some(chunk) = output.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        text.push_str(&String::from_utf8_lossy(&chunk.into_bytes()));
    }
    let exit_code = docker
        .inspect_exec(&exec.id)
        .await
        .map_err(|e| e.to_string())?
        .exit_code
        .unwrap_or(-1);
    Ok(ScriptResult { exit_code, output: text })
}
