//! The model, through the candidate's own Claude Code (`claude -p`): their
//! login, no API key in the app. Headless and locked down: no tools, no
//! settings, MCP servers or slash commands from the machine, nothing kept
//! between runs. The answer streams as JSON lines (`--output-format
//! stream-json`): text deltas while it writes, then one `result`.

use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

/// Where `claude` usually is. An app started from the Dock or Finder does not
/// get the shell's PATH, so the usual install locations are tried too.
pub fn binary() -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let from_path = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).map(|dir| dir.join("claude")).collect::<Vec<_>>())
        .unwrap_or_default();
    from_path
        .into_iter()
        .chain([
            home.join(".local/bin/claude"),
            home.join(".claude/local/claude"),
            home.join(".npm-global/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
            PathBuf::from("/usr/local/bin/claude"),
        ])
        .find(|p| p.is_file())
}

/// Ask once; `on_text` gets the answer as it is written. Returns the whole
/// answer.
pub async fn ask(
    system: &str,
    prompt: &str,
    model: &str,
    cancel: &CancellationToken,
    on_text: &(dyn Fn(&str) + Sync),
) -> AppResult<String> {
    let claude = binary().ok_or_else(|| {
        AppError::assistant("Claude Code is not installed: the coach uses the `claude` command (claude.ai/code)")
    })?;
    let mut child = Command::new(&claude)
        .args([
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--no-session-persistence",
            "--disable-slash-commands",
            "--setting-sources",
            "",
            "--tools",
            "",
            "--strict-mcp-config",
            "--model",
            model,
            "--system-prompt",
            system,
        ])
        // The candidate's Claude login, not an API key that happens to be set
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        // No project instructions (CLAUDE.md) from wherever the app started
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::assistant(format!("starting claude: {e}")))?;

    // The prompt on stdin: no length limit, nothing in the process list
    let mut stdin = child.stdin.take().expect("piped");
    stdin.write_all(prompt.as_bytes()).await.map_err(|e| AppError::io("writing to claude", e))?;
    drop(stdin);

    let mut out = BufReader::new(child.stdout.take().expect("piped")).lines();
    let mut err = BufReader::new(child.stderr.take().expect("piped")).lines();
    let mut stderr_tail: Vec<String> = Vec::new();
    let mut written = String::new();
    let mut result: Option<Result<String, String>> = None;
    loop {
        tokio::select! {
            () = cancel.cancelled() => {
                let _ = child.kill().await;
                return Err(AppError::Cancelled { message: "stopped".into() });
            }
            line = out.next_line() => match line {
                Ok(Some(line)) => match event(&line) {
                    Event::Text(text) => {
                        written.push_str(&text);
                        on_text(&text);
                    }
                    Event::Result(r) => result = Some(r),
                    Event::Other => {}
                },
                _ => break,
            },
            Ok(Some(line)) = err.next_line() => {
                stderr_tail.push(line);
                if stderr_tail.len() > 5 {
                    stderr_tail.remove(0);
                }
            }
        }
    }
    let status = child.wait().await.map_err(|e| AppError::assistant(e.to_string()))?;
    match result {
        Some(Ok(text)) => Ok(if text.is_empty() { written } else { text }),
        Some(Err(message)) => Err(AppError::assistant(message)),
        None => Err(AppError::assistant(format!(
            "claude stopped ({status}) without an answer{}",
            if stderr_tail.is_empty() { String::new() } else { format!(": {}", stderr_tail.join(" ")) }
        ))),
    }
}

enum Event {
    Text(String),
    Result(Result<String, String>),
    Other,
}

/// One line of `stream-json`
fn event(line: &str) -> Event {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return Event::Other;
    };
    match v["type"].as_str() {
        Some("stream_event")
            if v["event"]["type"] == "content_block_delta" && v["event"]["delta"]["type"] == "text_delta" =>
        {
            Event::Text(v["event"]["delta"]["text"].as_str().unwrap_or_default().to_string())
        }
        Some("result") => {
            let text = v["result"].as_str().unwrap_or_default().to_string();
            if v["is_error"].as_bool().unwrap_or(false) {
                Event::Result(Err(if text.is_empty() { "the model returned an error".into() } else { text }))
            } else {
                Event::Result(Ok(text))
            }
        }
        _ => Event::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_deltas_and_the_result() {
        let delta = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}"#;
        assert!(matches!(event(delta), Event::Text(t) if t == "Hi"));
        let done = r#"{"type":"result","subtype":"success","is_error":false,"result":"Hi there"}"#;
        assert!(matches!(event(done), Event::Result(Ok(t)) if t == "Hi there"));
        let failed = r#"{"type":"result","is_error":true,"result":"Not logged in"}"#;
        assert!(matches!(event(failed), Event::Result(Err(t)) if t == "Not logged in"));
        assert!(matches!(event(r#"{"type":"system","subtype":"init"}"#), Event::Other));
        assert!(matches!(event("not json"), Event::Other));
    }
}
