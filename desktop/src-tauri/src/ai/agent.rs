//! Claude as an ACP agent, the way Zed runs it: the Claude Agent adapter
//! (`@agentclientprotocol/claude-agent-acp`, through npx) on the candidate's
//! own Claude login. Ask only: the coach's system prompt replaces Claude
//! Code's, and its sessions have no built-in tools, no MCP servers, no
//! settings from the machine and nothing kept on disk.

use super::acp::Connection;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

/// The adapter, pinned: a new release is tested before it is used
pub const ADAPTER: &str = "@agentclientprotocol/claude-agent-acp@0.97.0";

/// A model the agent offers (its `model` config option), as Zed lists them
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

/// Where the assistant's runtime is, when the candidate set it (Settings);
/// unset, it is found on the machine
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct RuntimePaths {
    /// npx, which runs the ACP adapter
    pub npx: Option<String>,
    /// A Claude Code CLI to use instead of the one the adapter bundles
    /// (`CLAUDE_CODE_EXECUTABLE`)
    pub claude: Option<String>,
}

/// Where npx is: an app started from the Dock or Finder does not get the
/// shell's PATH, so the usual Node install locations are tried too
pub fn detect_npx() -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let from_path = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).map(|dir| dir.join("npx")).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut nvm: Vec<PathBuf> = std::fs::read_dir(home.join(".nvm/versions/node"))
        .map(|d| d.flatten().map(|e| e.path().join("bin/npx")).collect())
        .unwrap_or_default();
    nvm.sort();
    from_path
        .into_iter()
        .chain([
            PathBuf::from("/opt/homebrew/bin/npx"),
            PathBuf::from("/usr/local/bin/npx"),
            home.join(".volta/bin/npx"),
            home.join(".local/bin/npx"),
        ])
        .chain(nvm.into_iter().rev())
        .find(|p| p.is_file())
}

/// An installed Claude Code CLI (`claude`), where installers put it
pub fn detect_claude() -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).map(|dir| dir.join("claude")).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .chain([
            home.join(".claude/local/claude"),
            home.join(".local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
            PathBuf::from("/usr/local/bin/claude"),
        ])
        .find(|p| p.is_file())
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
    /// An empty directory the agent works in: there is nothing to read there
    workdir: PathBuf,
    connection: tokio::sync::Mutex<Option<Arc<Connection>>>,
    /// The models the last session offered (they follow the login's plan)
    models: std::sync::Mutex<Vec<ModelOption>>,
    /// Effort levels per model, as sessions reported them (they differ by model)
    efforts: std::sync::Mutex<HashMap<String, Vec<ModelOption>>>,
    /// npx and Claude Code as set in Settings
    paths: std::sync::RwLock<RuntimePaths>,
}

/// One answer: its text and the session's context use after it
pub struct Answer {
    pub text: String,
    pub usage: Option<ContextUsage>,
}

impl Agent {
    pub fn new(data_dir: &Path) -> Self {
        Self { workdir: data_dir.join("agent"), connection: tokio::sync::Mutex::new(None), models: Default::default(), efforts: Default::default(), paths: Default::default() }
    }

    /// The running adapter, started (and initialized) when needed
    async fn connection(&self) -> AppResult<Arc<Connection>> {
        let mut slot = self.connection.lock().await;
        if let Some(c) = slot.as_ref().filter(|c| c.alive()) {
            return Ok(c.clone());
        }
        let c = Connection::spawn(self.adapter(&[], false)?).await?;
        *slot = Some(c.clone());
        Ok(c)
    }

    /// Use these paths from now on (the next adapter start)
    pub fn set_paths(&self, paths: RuntimePaths) {
        *self.paths.write().unwrap_or_else(|p| p.into_inner()) = paths;
    }

    /// npx as set in Settings, else as found on the machine
    pub fn npx(&self) -> Option<PathBuf> {
        let set = self.paths.read().unwrap_or_else(|p| p.into_inner()).npx.clone();
        set.map(PathBuf::from).filter(|p| p.is_file()).or_else(detect_npx)
    }

    /// The adapter with `args` (`--cli ...` runs the Claude CLI it bundles,
    /// or the one set in Settings), in a pseudo-terminal when `in_terminal`
    /// (an interactive login)
    pub(super) fn adapter(&self, args: &[&str], in_terminal: bool) -> AppResult<Command> {
        let npx = self.npx().ok_or_else(|| {
            AppError::assistant("Node.js is not installed: the assistant runs Claude through npx (nodejs.org)")
        })?;
        std::fs::create_dir_all(&self.workdir).map_err(|e| AppError::io("creating the agent directory", e))?;
        let mut argv: Vec<std::ffi::OsString> = vec![npx.clone().into(), "-y".into(), ADAPTER.into()];
        argv.extend(args.iter().map(Into::into));
        let mut command = if in_terminal { super::account::in_terminal(&argv) } else { Command::new(&argv[0]) };
        if !in_terminal {
            command.args(&argv[1..]);
        }
        // npx and the adapter are Node scripts: node must be on their PATH
        let path = std::env::join_paths(
            npx.parent().map(Path::to_path_buf).into_iter().chain(std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect::<Vec<_>>()).unwrap_or_default()),
        )
        .unwrap_or_default();
        command
            .current_dir(&self.workdir)
            // The candidate's Claude login, not an API key that happens to be set
            .env_remove("ANTHROPIC_API_KEY")
            .env_remove("ANTHROPIC_AUTH_TOKEN")
            .env("PATH", path)
            .kill_on_drop(true);
        match self.paths.read().unwrap_or_else(|p| p.into_inner()).claude.as_deref() {
            Some(claude) => command.env("CLAUDE_CODE_EXECUTABLE", claude),
            None => command.env_remove("CLAUDE_CODE_EXECUTABLE"),
        };
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
        let c = self.connection().await?;
        let result = c
            .request(
                "session/new",
                json!({
                    "cwd": self.workdir,
                    "mcpServers": [],
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
    /// (ACP `session/cancel`) when `cancel` fires.
    pub async fn prompt(
        &self,
        session: &str,
        text: &str,
        cancel: &CancellationToken,
        on_text: &(dyn Fn(&str) + Sync),
    ) -> AppResult<Answer> {
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
                Some(update) = updates.recv() => match update["sessionUpdate"].as_str() {
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
                () = cancel.cancelled(), if !cancelling => {
                    cancelling = true;
                    let _ = c.notify("session/cancel", json!({ "sessionId": session })).await;
                }
            }
        };
        // Updates that arrived with the reply
        while let Ok(update) = updates.try_recv() {
            if update["sessionUpdate"] == "agent_message_chunk" {
                if let Some(t) = update["content"]["text"].as_str() {
                    answer.push_str(t);
                    on_text(t);
                }
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
        let dir = std::env::temp_dir().join(format!("ckdry-acp-{}", std::process::id()));
        let agent = Agent::new(&dir);
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
        let _ = std::fs::remove_dir_all(&dir);
    }
}
