//! `ckdry mcp`: ckdry's question bank and practice attempt as Model Context
//! Protocol tools, for Claude Code and other agents (`claude mcp add ckdry --
//! ckdry mcp`). JSON-RPC 2.0 over stdio, one message per line, tools only.
//!
//! Read-only, like the in-app coach, and under the same rule: while an
//! exam-mode attempt runs, every tool refuses (the real exam has no
//! assistant). It reads what the app keeps (its database and "My
//! questions"); checking work runs the question's checks on the attempt's
//! cluster, which changes nothing.

use crate::error::{AppError, AppResult};
use crate::lab::checks;
use crate::lab::exam;
use crate::lab::load::LoadedPack;
use crate::lab::model::Question;
use crate::lab::render;
use crate::store::Store;
use super::policy::COMMAND_MAX_SECS;
use serde_json::{Value, json};
use std::fmt::Write as _;
use std::io::{BufRead, Write};
use std::path::PathBuf;

/// Protocol versions this server speaks, newest first
const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];

pub struct Server {
    bank: std::sync::Arc<LoadedPack>,
    store: std::sync::Arc<Store>,
    data_dir: PathBuf,
    /// The assistant's agent session for this question (`ckdry mcp --agent`):
    /// its tools run commands for it, on the task's host
    agent: Option<String>,
}

/// Output a command returns to the model (its end, where errors are)
const OUTPUT_MAX_BYTES: usize = 16 * 1024;

/// Serve on stdin/stdout until stdin closes; `agent`: the question of the
/// assistant's agent session
pub fn serve(bank: LoadedPack, store: Store, data_dir: PathBuf, agent: Option<String>) -> AppResult<()> {
    // Its checks exec in the app's containers: tell the app's guard they are ckdry's
    crate::runtime::guard::share_own_execs();
    let server = Server::new(std::sync::Arc::new(bank), std::sync::Arc::new(store), data_dir, agent);
    let runtime = tokio::runtime::Runtime::new().map_err(|e| AppError::io("starting the MCP server", e))?;
    let stdout = std::io::stdout();
    for line in std::io::stdin().lock().lines() {
        let line = line.map_err(|e| AppError::io("reading stdin", e))?;
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(message) => runtime.block_on(server.handle(&message)),
            Err(e) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": e.to_string() } })),
        };
        if let Some(reply) = reply {
            let mut out = stdout.lock();
            writeln!(out, "{reply}").and_then(|()| out.flush()).map_err(|e| AppError::io("writing stdout", e))?;
        }
    }
    Ok(())
}

impl Server {
    /// `agent`: the question of an assistant agent session (its tools)
    pub fn new(bank: std::sync::Arc<LoadedPack>, store: std::sync::Arc<Store>, data_dir: PathBuf, agent: Option<String>) -> Self {
        Self { bank, store, data_dir, agent }
    }

    /// The reply to a message; none for notifications
    pub async fn handle(&self, message: &Value) -> Option<Value> {
        let id = message.get("id")?.clone();
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        let result = match message["method"].as_str().unwrap_or_default() {
            "initialize" => Ok(self.initialize(&params)),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": if self.agent.is_some() { agent_tools() } else { tools() } })),
            "tools/call" => Ok(self.call(&params).await),
            method => Err(json!({ "code": -32601, "message": format!("{method} is not supported") })),
        };
        Some(match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
        })
    }

    fn initialize(&self, params: &Value) -> Value {
        let asked = params["protocolVersion"].as_str().unwrap_or_default();
        let version = PROTOCOL_VERSIONS.iter().find(|v| **v == asked).unwrap_or(&PROTOCOL_VERSIONS[0]);
        json!({
            "protocolVersion": version,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "ckdry", "title": "ckdry", "version": env!("CARGO_PKG_VERSION") },
            "instructions": "ckdry is a Kubernetes certification (CKA, CKAD, CKS) practice app. Use these tools \
to read its exams and questions, see the practice attempt in progress and check the candidate's work. \
Coach: explain and point to kubernetes.io docs; do not solve the task for them unless asked.",
        })
    }

    /// A tool's result: its text, or the reason it failed as a tool error
    async fn call(&self, params: &Value) -> Value {
        let args = &params["arguments"];
        let text = |key: &str| args[key].as_str().map(str::to_string);
        let result = match params["name"].as_str().unwrap_or_default() {
            "list_exams" => self.list_exams(),
            "list_questions" => self.list_questions(text("certification"), text("domain")),
            "get_question" => self.get_question(&text("id").unwrap_or_default(), args["solution"].as_bool().unwrap_or(false)),
            "current_question" => self.current_question(),
            "check_my_work" => self.check_my_work(text("question_id").or_else(|| self.agent.clone())).await,
            "study_stats" => self.study_stats(),
            "lint_question" => self.lint_question(&text("yaml").unwrap_or_default()),
            "run_command" => self.run_command(&text("command").unwrap_or_default(), args["timeout_seconds"].as_u64()).await,
            name => Err(AppError::invalid(format!("no tool named {name}"))),
        };
        match result {
            Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
            Err(e) => json!({ "content": [{ "type": "text", "text": e.to_string() }], "isError": true }),
        }
    }

    /// The running attempt, if any; an error while it is in exam mode
    fn attempt(&self) -> AppResult<Option<(exam::Attempt, Vec<(String, Question)>)>> {
        if exam::exam_mode_active(&self.store) {
            return Err(AppError::invalid(
                "An exam-mode attempt is running in ckdry: the assistant is off until it ends, as in the real exam.",
            ));
        }
        Ok(exam::saved_running(&self.store))
    }

    fn list_exams(&self) -> AppResult<String> {
        self.attempt()?;
        let exams: Vec<Value> = exam::draw::catalog(&self.bank, &self.store.footprint().unwrap_or_default())
            .into_iter()
            .map(|e| {
                json!({
                    "id": e.id, "title": e.title, "certification": e.certification, "questions": e.questions,
                    "minutes": e.duration_minutes, "pass_score": e.pass_score, "memory_gb": f64::from(e.memory_mb) / 1024.0,
                })
            })
            .collect();
        Ok(pretty(&exams))
    }

    fn list_questions(&self, certification: Option<String>, domain: Option<String>) -> AppResult<String> {
        self.attempt()?;
        let questions: Vec<Value> = self
            .bank
            .questions
            .iter()
            .filter(|(_, q)| {
                let q = &q.value;
                certification.as_ref().is_none_or(|c| q.certifications.contains_key(c))
                    && domain.as_ref().is_none_or(|d| q.certifications.values().any(|v| v == d))
            })
            .map(|(id, q)| {
                let q = &q.value;
                json!({ "id": id, "title": q.title, "domains": q.certifications, "difficulty": q.difficulty, "tags": q.tags })
            })
            .collect();
        Ok(pretty(&questions))
    }

    fn get_question(&self, id: &str, solution: bool) -> AppResult<String> {
        self.attempt()?;
        let q = &self.bank.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?.value;
        let rendered = render::render(q, &render::pick(q, true), &q.cluster);
        Ok(describe(id, &rendered, solution))
    }

    fn current_question(&self) -> AppResult<String> {
        let (attempt, questions) = self.attempt()?.ok_or_else(|| AppError::not_found("no practice attempt is running in ckdry"))?;
        let current = self.store.progress(&attempt.id).map(|p| p.current as usize).unwrap_or(0);
        let (id, question) = questions.get(current).or(questions.first()).ok_or_else(|| AppError::not_found("the attempt has no questions"))?;
        let mut text = format!("Practice attempt: {} — question {} of {}\n\n", attempt.title, current + 1, questions.len());
        text.push_str(&describe(id, question, false));
        text.push_str("\n## Other questions\n");
        for (i, (id, q)) in questions.iter().enumerate() {
            let _ = writeln!(text, "{}. {} ({id})", i + 1, q.title);
        }
        Ok(text)
    }

    async fn check_my_work(&self, question_id: Option<String>) -> AppResult<String> {
        let (attempt, questions) = self.attempt()?.ok_or_else(|| AppError::not_found("no practice attempt is running in ckdry"))?;
        let current = self.store.progress(&attempt.id).map(|p| p.current as usize).unwrap_or(0);
        let (id, question) = match &question_id {
            Some(wanted) => questions.iter().find(|(id, _)| id == wanted),
            None => questions.get(current),
        }
        .ok_or_else(|| AppError::not_found("no such question in the attempt"))?;
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
    /// ckdry (the agent asks before each tool use)
    async fn run_command(&self, command: &str, timeout: Option<u64>) -> AppResult<String> {
        let question_id = self.agent.as_deref().ok_or_else(|| AppError::invalid("commands run only in the assistant's agent sessions"))?;
        let (_, questions) = self.attempt()?.ok_or_else(|| AppError::not_found("no practice attempt is running in ckdry"))?;
        let (_, question) = questions.iter().find(|(id, _)| id == question_id).ok_or_else(|| AppError::not_found("the question is not in the attempt"))?;
        let command = command.trim();
        if command.is_empty() {
            return Err(AppError::invalid("no command given"));
        }
        if let Some(reason) = refused(command) {
            return Err(AppError::invalid(format!("Not run: {reason}. Do it another way, or ask the candidate to.")));
        }
        let settings = self.store.agent_settings().unwrap_or_default().normalized();
        if let Some(entry) = settings.never_runs(command) {
            return Err(AppError::invalid(format!("Not run: the candidate never lets the assistant run commands with \"{entry}\". Ask them to run it.")));
        }
        let (docker, host) = task_host().await?;
        let secs = timeout.map_or(settings.command_timeout, |t| t.clamp(1, u64::from(COMMAND_MAX_SECS)) as u32);
        let (exit, output) = checks::run_script_tail(&docker, host, &question.cluster, command, secs, Some(OUTPUT_MAX_BYTES)).await?;
        Ok(format!("{}\n[exit code {exit}]", tail(&output, OUTPUT_MAX_BYTES)))
    }

    fn study_stats(&self) -> AppResult<String> {
        self.attempt()?;
        let history = self.store.history().unwrap_or_default();
        Ok(pretty(&exam::insights::study_stats(&self.bank, &history)))
    }

    fn lint_question(&self, yaml: &str) -> AppResult<String> {
        self.attempt()?;
        let errors = super::generate::lint_question(&self.bank, &self.data_dir, yaml);
        Ok(if errors.is_empty() { "No errors: the question is valid. `ckdry lab verify` proves it on a cluster.".into() } else { format!("Errors:\n- {}", errors.join("\n- ")) })
    }
}

/// The task host (the jumphost), running
async fn task_host() -> AppResult<(bollard::Docker, &'static str)> {
    let docker = crate::runtime::docker::connect().await?;
    let host = crate::runtime::jumphost::APP_NAME;
    let running = docker.inspect_container(host, None).await.ok().and_then(|c| c.state?.running).unwrap_or(false);
    if !running {
        return Err(AppError::invalid("The attempt's cluster is not running: open ckdry to resume the attempt, then try again."));
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
        return Some("ckdry's containers are not part of the task");
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
fn describe(id: &str, q: &Question, solution: bool) -> String {
    let mut text = format!("# {} ({id})\n\nCluster: {}", q.title, q.cluster);
    if let Some(ns) = &q.namespace {
        let _ = write!(text, " · namespace: {ns}");
    }
    let _ = write!(text, " · difficulty: {:?}\n\n{}\n", q.difficulty, q.statement.trim());
    if !q.references.is_empty() {
        let _ = write!(text, "\n## Documentation\n- {}\n", q.references.join("\n- "));
    }
    if solution {
        let _ = write!(text, "\n## Solution\n{}\n\n```bash\n{}\n```\n", q.solution.explain.trim(), q.solution.run.trim());
    }
    text
}

fn pretty(value: &impl serde::Serialize) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}

fn tools() -> Value {
    let none = json!({ "type": "object", "properties": {} });
    let read_only = json!({ "readOnlyHint": true });
    json!([
        { "name": "list_exams", "description": "The practice exams: id, certification, questions, minutes, pass score.", "inputSchema": none, "annotations": read_only },
        {
            "name": "list_questions",
            "description": "Questions in the bank (core and the user's own), optionally for one certification (cka, ckad, cks) or curriculum domain.",
            "inputSchema": { "type": "object", "properties": {
                "certification": { "type": "string" }, "domain": { "type": "string" } } },
            "annotations": read_only,
        },
        {
            "name": "get_question",
            "description": "A question's task as the candidate reads it, with its documentation; its reference solution only if `solution` is true.",
            "inputSchema": { "type": "object", "properties": {
                "id": { "type": "string" }, "solution": { "type": "boolean" } }, "required": ["id"] },
            "annotations": read_only,
        },
        { "name": "current_question", "description": "The question the candidate is on in the practice attempt running in ckdry.", "inputSchema": none, "annotations": read_only },
        {
            "name": "check_my_work",
            "description": "Run a question's checks on the practice attempt's cluster (the current question by default): which pass, and why the others fail. Changes nothing.",
            "inputSchema": { "type": "object", "properties": { "question_id": { "type": "string" } } },
            "annotations": read_only,
        },
        { "name": "study_stats", "description": "The candidate's results so far, per certification and curriculum domain.", "inputSchema": none, "annotations": read_only },
        {
            "name": "lint_question",
            "description": "Validate a question written in ckdry's YAML format (as `ckdry lab lint` does): its errors, or none.",
            "inputSchema": { "type": "object", "properties": { "yaml": { "type": "string" } }, "required": ["yaml"] },
            "annotations": read_only,
        },
    ])
}

/// What an agent session gets: commands on the task host, and the checks
fn agent_tools() -> Value {
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

    fn server() -> Server {
        let root = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packs/core"));
        let bank = crate::lab::load::load(&root).0.unwrap();
        Server::new(std::sync::Arc::new(bank), std::sync::Arc::new(Store::in_memory().unwrap()), std::env::temp_dir().join("ckdry-mcp-test"), None)
    }

    async fn call(server: &Server, name: &str, arguments: Value) -> (String, bool) {
        let reply = server
            .handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": name, "arguments": arguments } }))
            .await
            .unwrap();
        let result = &reply["result"];
        (result["content"][0]["text"].as_str().unwrap_or_default().to_string(), result["isError"] == true)
    }

    #[test]
    fn commands_that_break_the_environment_are_refused() {
        for bad in ["kind delete cluster --name k8s", "docker rm -f ckdry-jumphost", "sudo reboot", "rm -rf /", "cd /tmp && rm -fr ~", ":(){ :|:& };:"] {
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
    async fn speaks_mcp_and_reads_the_bank() {
        let server = server();
        let init = server.handle(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": "2025-03-26" } })).await.unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
        assert!(server.handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).await.is_none());
        let list = server.handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).await.unwrap();
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 7);

        let (exams, _) = call(&server, "list_exams", json!({})).await;
        assert!(exams.contains("\"certification\": \"cka\""), "{exams}");
        let (questions, _) = call(&server, "list_questions", json!({ "certification": "cka" })).await;
        let id = serde_json::from_str::<Value>(&questions).unwrap()[0]["id"].as_str().unwrap().to_string();
        let (task, _) = call(&server, "get_question", json!({ "id": id })).await;
        assert!(task.starts_with("# ") && !task.contains("## Solution"), "{task}");
        let (with_solution, _) = call(&server, "get_question", json!({ "id": id, "solution": true })).await;
        assert!(with_solution.contains("## Solution"));

        let (none, failed) = call(&server, "current_question", json!({})).await;
        assert!(failed && none.contains("no practice attempt"));
        let (lint, _) = call(&server, "lint_question", json!({ "yaml": "title: x" })).await;
        assert!(lint.starts_with("Errors:"), "{lint}");
        // An exam-mode attempt in the app: every tool refuses
        let running = |mode: &str| json!({
            "state": { "phase": "running", "started_at": 0.0, "ends_at": null, "attempt": {
                "id": "1", "exam_id": "cka-001", "title": "CKA", "certification": "cka", "mode": mode,
                "pass_score": 66, "questions": [], "clusters": ["k8s"] } },
            "questions": [],
        });
        server.store.save_attempt(Some(&running("exam"))).unwrap();
        let (refused, failed) = call(&server, "list_questions", json!({})).await;
        assert!(failed && refused.contains("exam-mode"), "{refused}");
        server.store.save_attempt(Some(&running("practice"))).unwrap();
        let (_, failed) = call(&server, "list_questions", json!({})).await;
        assert!(!failed);
        let unknown = server.handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list" })).await.unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }
}
