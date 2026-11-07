//! The tools of the assistant's agent sessions (Agent, practice only), as
//! Model Context Protocol: run a command on the task's host, run the task's
//! checks. One server per session's question; `mcp_http` serves them over
//! HTTP to the agent.
//!
//! Under the assistant's rule: nothing answers while an exam-mode attempt
//! runs (the real exam has no assistant).

use crate::error::{AppError, AppResult};
use crate::lab::checks;
use crate::lab::exam;
use crate::lab::model::Question;
use crate::store::Store;
use super::policy::COMMAND_MAX_SECS;
use serde_json::{Value, json};
use std::fmt::Write as _;

/// Protocol versions this server speaks, newest first
const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];

/// Output a command returns to the model (its end, where errors are)
const OUTPUT_MAX_BYTES: usize = 16 * 1024;

pub struct Server {
    store: std::sync::Arc<Store>,
    /// The session's question, in the practice attempt
    question: String,
}

impl Server {
    pub fn new(store: std::sync::Arc<Store>, question: String) -> Self {
        Self { store, question }
    }

    /// The reply to a message; none for notifications
    pub async fn handle(&self, message: &Value) -> Option<Value> {
        answer(message, tools(), |name, args| async move {
            match name.as_str() {
                "check_my_work" => self.check_my_work().await,
                "run_command" => self.run_command(args["command"].as_str().unwrap_or_default(), args["timeout_seconds"].as_u64()).await,
                name => Err(AppError::invalid(format!("no tool named {name}"))),
            }
        })
        .await
    }

    /// The session's question in the running practice attempt
    fn question(&self) -> AppResult<(String, Question)> {
        let (attempt, questions) =
            exam::saved_running(&self.store).ok_or_else(|| AppError::not_found("no practice attempt is running in ckpro"))?;
        if attempt.mode == exam::Mode::Exam {
            return Err(AppError::exam_mode());
        }
        questions
            .into_iter()
            .find(|(id, _)| *id == self.question)
            .ok_or_else(|| AppError::not_found("the question is not in the attempt"))
    }

    /// Run the question's checks on its cluster: what passes, why the rest fail
    async fn check_my_work(&self) -> AppResult<String> {
        let (id, question) = self.question()?;
        let (docker, host) = task_host().await?;
        let results = checks::run_checks(
            &docker,
            host,
            question.checks.iter().map(|c| (question.cluster.as_str(), c)),
            |_, _| {},
        )
        .await?;
        let passed = results.iter().filter(|r| r.passed).count();
        let mut text = format!("{} ({id}): {passed} of {} checks pass\n\n", question.title, results.len());
        for r in &results {
            let _ = writeln!(text, "- [{}] {}{}", if r.passed { "x" } else { " " }, r.name, if r.passed || r.detail.is_empty() { String::new() } else { format!(": {}", r.detail) });
        }
        Ok(text)
    }

    /// Run `command` (bash) on the task host for the agent session's question,
    /// as the candidate would after `ssh <host>`. The candidate approved it in
    /// ckpro (the agent asks before each tool use)
    async fn run_command(&self, command: &str, timeout: Option<u64>) -> AppResult<String> {
        let (_, question) = self.question()?;
        let command = command.trim();
        if command.is_empty() {
            return Err(AppError::invalid("no command given"));
        }
        if let Some(reason) = refused(command) {
            return Err(AppError::invalid(format!("Not run: {reason}. Do it another way, or ask the candidate to.")));
        }
        let settings = super::policy::AgentSettings::load(&self.store).unwrap_or_default().normalized();
        if let Some(entry) = settings.never_runs(command) {
            return Err(AppError::invalid(format!("Not run: the candidate never lets the assistant run commands with \"{entry}\". Ask them to run it.")));
        }
        let (docker, host) = task_host().await?;
        let secs = timeout.map_or(settings.command_timeout, |t| t.clamp(1, u64::from(COMMAND_MAX_SECS)) as u32);
        let (exit, output) = checks::run_script_tail(&docker, host, &question.cluster, command, secs, Some(OUTPUT_MAX_BYTES)).await?;
        Ok(format!("{}\n[exit code {exit}]", tail(&output, OUTPUT_MAX_BYTES)))
    }
}

/// The reply to an MCP message (none for notifications), for a server
/// offering `tools` (`tools/list`) and running them with `call` (a tool's
/// name and arguments, to its text or why it failed: a tool error)
pub async fn answer<F, Fut>(message: &Value, tools: Value, call: F) -> Option<Value>
where
    F: FnOnce(String, Value) -> Fut,
    Fut: std::future::Future<Output = AppResult<String>>,
{
    let id = message.get("id")?.clone();
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    let result = match message["method"].as_str().unwrap_or_default() {
        "initialize" => Ok(initialize(&params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools })),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default().to_string();
            Ok(match call(name, params["arguments"].clone()).await {
                Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
                Err(e) => json!({ "content": [{ "type": "text", "text": e.to_string() }], "isError": true }),
            })
        }
        method => Err(json!({ "code": -32601, "message": format!("{method} is not supported") })),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
    })
}

fn initialize(params: &Value) -> Value {
    let asked = params["protocolVersion"].as_str().unwrap_or_default();
    let version = PROTOCOL_VERSIONS.iter().find(|v| **v == asked).unwrap_or(&PROTOCOL_VERSIONS[0]);
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "ckpro", "title": "ckpro", "version": env!("CARGO_PKG_VERSION") },
    })
}

/// The task host (the jumphost), running
async fn task_host() -> AppResult<(bollard::Docker, &'static str)> {
    let docker = crate::runtime::docker::connect().await?;
    let host = crate::runtime::jumphost::APP_NAME;
    let running = docker.inspect_container(host, None).await.ok().and_then(|c| c.state?.running).unwrap_or(false);
    if !running {
        return Err(AppError::invalid("The attempt's cluster is not running: open ckpro to resume the attempt, then try again."));
    }
    Ok((docker, host))
}

/// Why a command is never run for the agent, whatever the candidate
/// approved: it would break the practice environment itself, not the task.
/// Not a security boundary (the candidate owns the machine): a guard
/// against a model's mistakes
fn refused(command: &str) -> Option<&'static str> {
    let lower = command.to_lowercase();
    let words: Vec<&str> = lower.split(|c: char| !(c.is_ascii_alphanumeric() || "-_./*".contains(c))).filter(|w| !w.is_empty()).collect();
    let has = |w: &str| words.contains(&w);
    let follows = |a: &str, b: &str| words.windows(2).any(|p| p[0] == a && p[1] == b);
    if follows("kind", "delete") || follows("kind", "create") {
        return Some("it would remove or replace the exam's cluster");
    }
    if has("docker") || has("podman") {
        return Some("ckpro's containers are not part of the task");
    }
    if ["reboot", "shutdown", "halt", "poweroff"].iter().any(|w| has(w)) || follows("init", "0") {
        return Some("it would take the host down");
    }
    if lower.contains(":(){") || lower.contains(":() {") {
        return Some("it would exhaust the host");
    }
    let wipes = lower.split(['\n', ';', '&', '|']).any(|part| {
        let part: Vec<&str> = part.split_whitespace().collect();
        part.first() == Some(&"rm") && part.iter().any(|a| a.starts_with('-') && a.contains('r')) && part.iter().any(|a| matches!(*a, "/" | "/*" | "~" | "~/"))
    });
    if wipes {
        return Some("it would wipe the host");
    }
    None
}

/// The last `max` bytes of `text`, on a character boundary, marked when cut
fn tail(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut start = text.len() - max;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    format!("[… {} bytes cut]\n{}", start, &text[start..])
}

/// A question as Markdown: what the candidate reads, and the reference
/// answer if `solution`
/// What an agent session gets: commands on the task host, and the checks
fn tools() -> Value {
    json!([
        {
            "name": "run_command",
            "description": "Run a bash command on the task's host (kubectl is set to the task's cluster; nodes are \
reached with `ssh <node>`), as the candidate would. The candidate approves each command. Prefer reading \
(get, describe, logs) and say why before changing anything. Non-interactive only (no `-it`, no editors); \
wait for what you create (`kubectl wait`, `rollout status`).",
            "inputSchema": { "type": "object", "properties": {
                "command": { "type": "string" },
                "timeout_seconds": { "type": "integer", "minimum": 1, "maximum": COMMAND_MAX_SECS } },
                "required": ["command"] },
            "annotations": { "destructiveHint": true, "openWorldHint": false },
        },
        {
            "name": "check_my_work",
            "description": "Run the task's own checks: which pass, and why the others fail. Changes nothing.",
            "inputSchema": { "type": "object", "properties": {} },
            "annotations": { "readOnlyHint": true },
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn call(server: &Server, name: &str) -> (String, bool) {
        let reply = server
            .handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": name, "arguments": {} } }))
            .await
            .unwrap();
        let result = &reply["result"];
        (result["content"][0]["text"].as_str().unwrap_or_default().to_string(), result["isError"] == true)
    }

    #[test]
    fn commands_that_break_the_environment_are_refused() {
        for bad in ["kind delete cluster --name k8s", "docker rm -f ckpro-jumphost", "sudo reboot", "rm -rf /", "cd /tmp && rm -fr ~", ":(){ :|:& };:"] {
            assert!(refused(bad).is_some(), "{bad}");
        }
        for ok in ["kubectl get pods -A", "rm -rf /tmp/work", "ssh node01 'systemctl restart kubelet'", "kubectl rollout restart deploy/web", "echo dockerfile"] {
            assert_eq!(refused(ok), None, "{ok}");
        }
    }

    #[test]
    fn long_output_keeps_its_end() {
        assert_eq!(tail("short", 10), "short");
        let cut = tail(&format!("{}END", "é".repeat(100)), 11);
        assert!(cut.ends_with("END") && cut.starts_with("[…"), "{cut}");
    }

    #[tokio::test]
    async fn speaks_mcp_with_the_agent_tools_only() {
        let server = Server::new(std::sync::Arc::new(Store::in_memory().unwrap()), "q1".into());
        let init = server.handle(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": "2025-03-26" } })).await.unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
        assert!(server.handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).await.is_none());
        let list = server.handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).await.unwrap();
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 2);
        let (_, failed) = call(&server, "get_question").await;
        assert!(failed);
        let (none, failed) = call(&server, "check_my_work").await;
        assert!(failed && none.contains("no practice attempt"), "{none}");
        // An exam-mode attempt in the app: the tools refuse
        let running = |mode: &str| json!({
            "state": { "phase": "running", "started_at": 0.0, "ends_at": null, "attempt": {
                "id": "1", "exam_id": "cka-001", "title": "CKA", "certification": "cka", "mode": mode,
                "pass_score": 66, "questions": [], "clusters": ["k8s"] } },
            "questions": [],
        });
        server.store.save_attempt(Some(&running("exam"))).unwrap();
        let (refused, failed) = call(&server, "run_command").await;
        assert!(failed && refused.contains("exam-mode"), "{refused}");
        server.store.save_attempt(Some(&running("practice"))).unwrap();
        let (absent, _) = call(&server, "check_my_work").await;
        assert!(absent.contains("not in the attempt"), "{absent}");
        let unknown = server.handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list" })).await.unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }
}
