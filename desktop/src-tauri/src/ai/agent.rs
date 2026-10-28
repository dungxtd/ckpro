//! Claude as an ACP agent: the Claude Agent adapter
//! (`@agentclientprotocol/claude-agent-acp`) in a container of its own (the
//! `agent` image), so the host needs nothing but Docker. The candidate's
//! Claude login lives in the `ckdry-claude` volume. The coach's system prompt
//! replaces Claude Code's; sessions have no built-in tools, no settings from
//! anywhere and nothing kept on disk beyond the login.

use super::acp::{Connection, Update};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

/// The volume the Claude login is kept in, and where the container sees it
const LOGIN_VOLUME: &str = "ckdry-claude";
const LOGIN_DIR: &str = "/home/node/.claude";
/// The agent's working directory in its container: empty, nothing to read
const WORKDIR: &str = "/home/node/work";

/// A model the agent offers (its `model` config option)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ModelOption {
    /// What `session/set_config_option` takes: an alias (`sonnet`) or an id
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

/// How much of the model's context a session uses (`usage_update`)
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, specta::Type)]
pub struct ContextUsage {
    pub used: u32,
    pub size: u32,
}

/// The agent's own default model (`Default (recommended)`)
pub const DEFAULT: &str = "default";

/// The choices of config option `id` (`model`, `effort`) in a `session/new`
/// or `session/set_config_option` result
fn config_options(result: &serde_json::Value, id: &str) -> Vec<ModelOption> {
    let Some(options) = result["configOptions"].as_array() else { return Vec::new() };
    options
        .iter()
        .find(|o| o["id"] == id)
        .and_then(|o| o["options"].as_array())
        .into_iter()
        .flatten()
        .filter_map(|o| {
            Some(ModelOption {
                value: o["value"].as_str()?.to_string(),
                name: o["name"].as_str().unwrap_or_default().to_string(),
                description: o["description"].as_str().filter(|d| !d.is_empty()).map(str::to_string),
            })
        })
        .collect()
}

pub struct Agent {
    connection: tokio::sync::Mutex<Option<Arc<Connection>>>,
    /// The models the last session offered (they follow the login's plan)
    models: std::sync::Mutex<Vec<ModelOption>>,
    /// Effort levels per model, as sessions reported them (they differ by model)
    efforts: std::sync::Mutex<HashMap<String, Vec<ModelOption>>>,
    /// The image is there (pulled or built once per app run)
    image_ready: std::sync::atomic::AtomicBool,
}

/// What a session reports while it answers
pub enum AgentEvent<'a> {
    Text(&'a str),
    /// A tool call, as it is now (sent again on every change)
    Tool(ToolCall),
    /// The agent asks to use a tool: ACP `session/request_permission`'s
    /// params, and where the chosen outcome goes
    Permission(serde_json::Value, tokio::sync::oneshot::Sender<serde_json::Value>),
}

/// A tool call as ACP's `tool_call` and `tool_call_update` describe it
#[derive(Clone, Debug, Default)]
pub struct ToolCall {
    pub id: String,
    pub title: String,
    /// pending, in_progress, completed, failed
    pub status: String,
    /// The tool's arguments (`rawInput`)
    pub input: serde_json::Value,
    /// Its text output, once there
    pub output: Option<String>,
}

impl ToolCall {
    /// Take what an update says; it may carry any of the fields
    fn update(&mut self, update: &serde_json::Value) {
        if let Some(title) = update["title"].as_str() {
            self.title = title.to_string();
        }
        if let Some(status) = update["status"].as_str() {
            self.status = status.to_string();
        }
        if !update["rawInput"].is_null() {
            self.input = update["rawInput"].clone();
        }
        let text: String = update["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|c| c["content"]["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if !text.is_empty() {
            // The adapter fences tool output as Markdown: keep the text
            let trimmed = text.trim();
            let unfenced = trimmed
                .strip_prefix("```")
                .and_then(|t| t.strip_suffix("```"))
                .map(|t| t.split_once('\n').map_or("", |(_, body)| body).trim_end_matches('\n'));
            self.output = Some(unfenced.unwrap_or(trimmed).to_string());
        }
    }
}

/// One answer: its text and the session's context use after it
pub struct Answer {
    pub text: String,
    pub usage: Option<ContextUsage>,
}

impl Agent {
    pub fn new() -> Self {
        Self { connection: tokio::sync::Mutex::new(None), models: Default::default(), efforts: Default::default(), image_ready: Default::default() }
    }

    /// The running adapter, started (and initialized) when needed
    async fn connection(&self) -> AppResult<Arc<Connection>> {
        let mut slot = self.connection.lock().await;
        if let Some(c) = slot.as_ref().filter(|c| c.alive()) {
            return Ok(c.clone());
        }
        let c = Connection::spawn(self.adapter(&[], false).await?).await?;
        *slot = Some(c.clone());
        Ok(c)
    }

    /// The adapter in its container, with `args` (`--cli ...` runs the
    /// Claude CLI it bundles), stdio attached; in a pseudo-terminal when
    /// `in_terminal` (an interactive login)
    pub(super) async fn adapter(&self, args: &[&str], in_terminal: bool) -> AppResult<Command> {
        let docker_cli = crate::runtime::docker::cli()
            .ok_or_else(|| AppError::assistant("The docker command was not found: install OrbStack or Docker Desktop"))?;
        let image = crate::runtime::infra::AGENT_IMAGE.tag();
        if !self.image_ready.load(std::sync::atomic::Ordering::SeqCst) {
            let docker = crate::runtime::docker::connect().await?;
            crate::runtime::infra::obtain(&docker, &crate::runtime::infra::AGENT_IMAGE, &|line| tracing::info!(target: "agent", "{line}")).await?;
            self.image_ready.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        let mut argv: Vec<std::ffi::OsString> = vec![docker_cli.into(), "run".into(), "--rm".into(), "-i".into()];
        if in_terminal {
            argv.push("-t".into());
        }
        for (key, value) in crate::runtime::docker::compose_labels("agent") {
            argv.extend(["--label".into(), format!("{key}={value}").into()]);
        }
        argv.extend([
            // The app's MCP server, from the container (ai::mcp_http)
            "--add-host".into(),
            "host.docker.internal:host-gateway".into(),
            "-v".into(),
            format!("{LOGIN_VOLUME}:{LOGIN_DIR}").into(),
            image.into(),
        ]);
        argv.extend(args.iter().map(Into::into));
        let mut command = if in_terminal { super::account::in_terminal(&argv) } else { Command::new(&argv[0]) };
        if !in_terminal {
            command.args(&argv[1..]);
        }
        command.env("PATH", crate::runtime::docker::cli_path()).kill_on_drop(true);
        Ok(command)
    }

    /// Stop the adapter: the next request starts it again (on a new login,
    /// whose plan may offer other models)
    pub(super) async fn restart(&self) {
        self.connection.lock().await.take();
        self.models.lock().unwrap_or_else(|p| p.into_inner()).clear();
        self.efforts.lock().unwrap_or_else(|p| p.into_inner()).clear();
    }

    /// A new conversation with `system` as its instructions, on `model`
    pub async fn new_session(&self, system: &str, model: &str) -> AppResult<String> {
        self.new_session_with(system, model, json!([])).await
    }

    /// A new conversation that may use these MCP servers' tools (Claude
    /// Code's own tools stay off: what it can do is only what they offer)
    pub async fn new_session_with(&self, system: &str, model: &str, mcp_servers: serde_json::Value) -> AppResult<String> {
        let c = self.connection().await?;
        let result = c
            .request(
                "session/new",
                json!({
                    "cwd": WORKDIR,
                    "mcpServers": mcp_servers,
                    "systemPrompt": { "mode": "override", "content": [{ "type": "text", "text": system }] },
                    "_meta": { "claudeCode": { "options": {
                        "tools": [],
                        "strictMcpConfig": true,
                        "settingSources": [],
                        "persistSession": false,
                    } } },
                }),
            )
            .await?;
        let session = result["sessionId"].as_str().ok_or_else(|| AppError::assistant("the agent gave no session"))?.to_string();
        let models = config_options(&result, "model");
        self.note_efforts(DEFAULT, &result);
        // A model this login does not offer (an alias of another plan): the
        // agent's default
        let offered = models.is_empty() || models.iter().any(|m| m.value == model);
        if !models.is_empty() {
            *self.models.lock().unwrap_or_else(|p| p.into_inner()) = models;
        }
        if offered && model != DEFAULT {
            self.set_model(&session, model).await?;
        } else if !offered {
            tracing::info!(model, "not offered on this login: the agent's default");
        }
        Ok(session)
    }

    /// The models the agent offers on this login, asking it once if no
    /// session has said yet
    pub async fn models(&self) -> AppResult<Vec<ModelOption>> {
        let known = self.models.lock().unwrap_or_else(|p| p.into_inner()).clone();
        if !known.is_empty() {
            return Ok(known);
        }
        let session = self.new_session("", DEFAULT).await?;
        self.close(&session).await;
        Ok(self.models.lock().unwrap_or_else(|p| p.into_inner()).clone())
    }

    pub async fn set_model(&self, session: &str, model: &str) -> AppResult<()> {
        let known = self.models.lock().unwrap_or_else(|p| p.into_inner()).iter().any(|m| m.value == model);
        if !known && model != DEFAULT {
            return Err(AppError::invalid(format!("unknown model {model}")));
        }
        let c = self.connection().await?;
        let result = c
            .request("session/set_config_option", json!({ "sessionId": session, "configId": "model", "value": model }))
            .await?;
        self.note_efforts(model, &result);
        Ok(())
    }

    /// The effort levels `model` takes (none if it has no effort setting),
    /// asking the agent once
    pub async fn efforts(&self, model: &str) -> AppResult<Vec<ModelOption>> {
        if let Some(known) = self.efforts.lock().unwrap_or_else(|p| p.into_inner()).get(model) {
            return Ok(known.clone());
        }
        let session = self.new_session("", model).await?;
        self.close(&session).await;
        Ok(self.efforts.lock().unwrap_or_else(|p| p.into_inner()).get(model).cloned().unwrap_or_default())
    }

    /// Set the session's effort; a level its model does not take is left at
    /// the model's default
    pub async fn set_effort(&self, session: &str, model: &str, effort: &str) -> AppResult<()> {
        let offered = self.efforts.lock().unwrap_or_else(|p| p.into_inner()).get(model).is_some_and(|e| e.iter().any(|o| o.value == effort));
        if !offered {
            return Ok(());
        }
        let c = self.connection().await?;
        c.request("session/set_config_option", json!({ "sessionId": session, "configId": "effort", "value": effort })).await?;
        Ok(())
    }

    fn note_efforts(&self, model: &str, result: &serde_json::Value) {
        if result["configOptions"].is_array() {
            self.efforts.lock().unwrap_or_else(|p| p.into_inner()).insert(model.to_string(), config_options(result, "effort"));
        }
    }

    /// Send `text` in the session; the answer streams to `on_text`. Stops
    /// (ACP `session/cancel`) when `cancel` fires. Tools are refused.
    pub async fn prompt(
        &self,
        session: &str,
        text: &str,
        cancel: &CancellationToken,
        on_text: &(dyn Fn(&str) + Sync),
    ) -> AppResult<Answer> {
        self.prompt_with(session, text, cancel, &|event| {
            if let AgentEvent::Text(t) = event {
                on_text(t);
            }
        })
        .await
    }

    /// `prompt`, with the session's tool calls and permission requests too:
    /// a permission is answered on its sender (dropped: cancelled)
    pub async fn prompt_with(
        &self,
        session: &str,
        text: &str,
        cancel: &CancellationToken,
        on_event: &(dyn Fn(AgentEvent) + Sync),
    ) -> AppResult<Answer> {
        let on_text = |t: &str| on_event(AgentEvent::Text(t));
        let mut tools: HashMap<String, ToolCall> = HashMap::new();
        let mut on_update = |update: &serde_json::Value| {
            let Some(id) = update["toolCallId"].as_str() else { return };
            let call = tools.entry(id.to_string()).or_insert_with(|| ToolCall { id: id.to_string(), ..Default::default() });
            call.update(update);
            on_event(AgentEvent::Tool(call.clone()));
        };
        let c = self.connection().await?;
        let mut updates = c.subscribe(session);
        let request = c.request("session/prompt", json!({ "sessionId": session, "prompt": [{ "type": "text", "text": text }] }));
        tokio::pin!(request);
        let mut answer = String::new();
        let mut usage = None;
        let mut cancelling = false;
        let result = loop {
            tokio::select! {
                result = &mut request => break result,
                Some(update) = updates.recv() => match update {
                    Update::Permission(params, reply) => on_event(AgentEvent::Permission(params, reply)),
                    Update::Session(update) => match update["sessionUpdate"].as_str() {
                    Some("tool_call" | "tool_call_update") => on_update(&update),
                    Some("agent_message_chunk") => {
                        if let Some(t) = update["content"]["text"].as_str() {
                            answer.push_str(t);
                            on_text(t);
                        }
                    }
                    Some("usage_update") => {
                        usage = Some(ContextUsage {
                            used: update["used"].as_u64().unwrap_or(0) as u32,
                            size: update["size"].as_u64().unwrap_or(0) as u32,
                        });
                    }
                    _ => {}
                    },
                },
                () = cancel.cancelled(), if !cancelling => {
                    cancelling = true;
                    let _ = c.notify("session/cancel", json!({ "sessionId": session })).await;
                }
            }
        };
        // Updates that arrived with the reply
        while let Ok(update) = updates.try_recv() {
            let Update::Session(update) = update else { continue };
            match update["sessionUpdate"].as_str() {
                Some("agent_message_chunk") => {
                    if let Some(t) = update["content"]["text"].as_str() {
                        answer.push_str(t);
                        on_text(t);
                    }
                }
                Some("tool_call" | "tool_call_update") => on_update(&update),
                _ => {}
            }
        }
        c.unsubscribe(session);
        match result?["stopReason"].as_str() {
            Some("cancelled") => Err(AppError::Cancelled { message: "stopped".into() }),
            Some("refusal") => Err(AppError::assistant("the model declined to answer")),
            _ => Ok(Answer { text: answer, usage }),
        }
    }

    /// Forget a conversation
    pub async fn close(&self, session: &str) {
        if let Ok(c) = self.connection().await {
            let _ = c.request("session/close", json!({ "sessionId": session })).await;
        }
    }

    /// One question in a conversation of its own (study plans, generation)
    pub async fn ask_once(
        &self,
        system: &str,
        text: &str,
        model: &str,
        cancel: &CancellationToken,
        on_text: &(dyn Fn(&str) + Sync),
    ) -> AppResult<String> {
        let session = self.new_session(system, model).await?;
        let answer = self.prompt(&session, text, cancel, on_text).await;
        self.close(&session).await;
        Ok(answer?.text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real adapter with ckdry's agent tools (needs Node, a Claude login
    /// and `cargo build`): it asks before running a command, runs it once
    /// allowed, and reports the call
    #[tokio::test]
    #[ignore]
    async fn agent_asks_then_runs_ckdry_tools() {
        let agent = Agent::new();
        let ckdry = concat!(env!("CARGO_MANIFEST_DIR"), "/target/debug/ckdry");
        let tools = json!([{ "name": "ckdry", "command": ckdry, "args": ["mcp", "--agent", "core/none"], "env": [] }]);
        let session = agent.new_session_with("You run what the user asks with your tools, then say what happened in one sentence.", "haiku", tools).await.unwrap();
        let asked = std::sync::Mutex::new(Vec::new());
        let calls = std::sync::Mutex::new(Vec::new());
        let answer = agent
            .prompt_with(&session, "Use the run_command tool to run `kubectl get nodes`.", &CancellationToken::new(), &|event| match event {
                AgentEvent::Permission(params, reply) => {
                    let option = params["options"].as_array().unwrap().iter().find(|o| o["kind"] == "allow_once").unwrap()["optionId"].clone();
                    asked.lock().unwrap().push(params["toolCall"]["rawInput"]["command"].as_str().unwrap_or_default().to_string());
                    let _ = reply.send(json!({ "outcome": { "outcome": "selected", "optionId": option } }));
                }
                AgentEvent::Tool(call) => calls.lock().unwrap().push(call),
                AgentEvent::Text(_) => {}
            })
            .await
            .unwrap();
        let asked = asked.into_inner().unwrap();
        let calls = calls.into_inner().unwrap();
        println!("asked: {asked:?}");
        for c in &calls {
            println!("tool {} {} {:?} -> {:?}", c.status, c.title, c.input, c.output);
        }
        println!("answer: {}", answer.text);
        assert!(!asked.is_empty() && asked.iter().all(|c| c == "kubectl get nodes"), "{asked:?}");
        // It ran: no attempt runs for this question, so the tool says why
        let done = calls.iter().rev().find(|c| matches!(c.status.as_str(), "completed" | "failed")).expect("a finished call");
        let output = done.output.as_deref().unwrap_or_default();
        assert!(output.contains("attempt") && !output.contains("```"), "{done:?}");
    }

    #[test]
    fn models_come_from_the_session() {
        let result = json!({ "configOptions": [
            { "id": "mode", "options": [{ "value": "plan", "name": "Plan" }] },
            { "id": "model", "currentValue": "default", "options": [
                { "value": "default", "name": "Default (recommended)", "description": "Opus 5.5" },
                { "value": "sonnet", "name": "Sonnet 5.5", "description": "" } ] } ] });
        let models = config_options(&result, "model");
        assert_eq!(models.iter().map(|m| m.value.as_str()).collect::<Vec<_>>(), ["default", "sonnet"]);
        assert_eq!((models[0].description.as_deref(), models[1].description.as_deref()), (Some("Opus 5.5"), None));
        assert!(config_options(&json!({}), "model").is_empty());
    }

    /// The real adapter (needs Node and a Claude login): a session without
    /// tools answers, streams, keeps the conversation, reports context use,
    /// and stops on cancel
    #[tokio::test]
    #[ignore]
    async fn claude_over_acp() {
        let agent = Agent::new();
        let session = agent.new_session("You are a terse Kubernetes coach. One sentence per answer.", "haiku").await.unwrap();
        // The models this login offers, as the agent lists them
        let models = agent.models().await.unwrap();
        println!("models: {:?}", models.iter().map(|m| &m.name).collect::<Vec<_>>());
        assert!(models.iter().any(|m| m.value == "sonnet") && models.iter().all(|m| !m.name.is_empty()));
        // Effort levels follow the model
        let efforts = agent.efforts("sonnet").await.unwrap();
        println!("sonnet efforts: {:?}", efforts.iter().map(|e| &e.value).collect::<Vec<_>>());
        assert!(efforts.iter().any(|e| e.value == "high"));
        agent.set_effort(&session, "haiku", "low").await.unwrap();
        let chunks = std::sync::atomic::AtomicUsize::new(0);
        let first = agent
            .prompt(&session, "My favourite namespace is blue-team. What does a Pending PVC with WaitForFirstConsumer mean?", &CancellationToken::new(), &|_| {
                chunks.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })
            .await
            .unwrap();
        println!("answer: {}", first.text);
        assert!(first.text.len() > 20 && chunks.into_inner() > 1);
        let usage = first.usage.expect("context use");
        assert!(usage.used > 0 && usage.size > usage.used, "{usage:?}");
        // The session remembers the conversation
        let second = agent.prompt(&session, "Which namespace did I say I like?", &CancellationToken::new(), &|_| {}).await.unwrap();
        println!("memory: {}", second.text);
        assert!(second.text.contains("blue-team"));
        // No tools: it cannot look around the machine
        let tools = agent.prompt(&session, "List the files in your working directory.", &CancellationToken::new(), &|_| {}).await.unwrap();
        println!("tools: {}", tools.text);
        // Stop mid-answer
        let cancel = CancellationToken::new();
        let stopper = cancel.clone();
        let stopped = agent
            .prompt(&session, "Explain every Kubernetes storage concept in detail, at length.", &cancel, &move |_| stopper.cancel())
            .await;
        assert!(matches!(stopped, Err(AppError::Cancelled { .. })), "{:?}", stopped.err());
        agent.close(&session).await;
    }
}
