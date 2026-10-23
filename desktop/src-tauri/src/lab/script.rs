//! Runs lab scripts (setup / validation) from the jumphost, where the
//! candidate works: kubectl there has every exam cluster as a context.

use crate::error::{AppError, AppResult};
use crate::runtime::exec;
use serde::Serialize;

#[derive(Serialize, specta::Type)]
pub struct ScriptResult {
    pub exit_code: i32,
    pub output: String,
}

pub async fn run(jumphost: &str, script_path: &str) -> AppResult<ScriptResult> {
    let script = std::fs::read_to_string(script_path)
        .map_err(|_| AppError::not_found(format!("script not found: {script_path}")))?;
    let docker = crate::runtime::docker::connect().await?;
    // An argument, not stdin: `ssh` in the script would read the rest of it
    let out = exec::run(&docker, jumphost, &["bash", "-c", &script], &[], None).await?;
    Ok(ScriptResult { exit_code: out.exit_code as i32, output: out.text })
}
