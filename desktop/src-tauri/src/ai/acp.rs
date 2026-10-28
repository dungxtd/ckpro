//! A minimal Agent Client Protocol (ACP v1) client:
//! JSON-RPC 2.0, one message per line, over the agent's stdin/stdout. ckdry
//! offers no file system or terminal (commands run through its own MCP tool,
//! on the task host), and answers the agent's other requests with "method not
//! found". Session updates and permission requests go to whoever follows that
//! session; a permission nobody is asked about is cancelled.

use crate::error::{AppError, AppResult};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot};
use std::time::Duration;

pub const PROTOCOL_VERSION: u64 = 1;
/// How long the adapter may take to answer `initialize`: npx may fetch it first
const INITIALIZE_TIMEOUT: Duration = Duration::from_secs(90);
/// How long any other request may go unanswered (a prompt sets its own)
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// ACP's `authRequired` error: the agent has no login to work with
const AUTH_REQUIRED: i64 = -32000;

type Pending = Mutex<HashMap<u64, oneshot::Sender<Result<Value, Value>>>>;
type Subscribers = Mutex<HashMap<String, mpsc::UnboundedSender<Update>>>;

/// What the agent sends about a session: an update, or a permission to ask
/// the candidate (answered on the sender with the chosen outcome)
pub enum Update {
    Session(Value),
    Permission(Value, oneshot::Sender<Value>),
}

pub struct Connection {
    stdin: tokio::sync::Mutex<ChildStdin>,
    next_id: AtomicU64,
    pending: Arc<Pending>,
    subscribers: Arc<Subscribers>,
    /// Gone once the agent exits
    alive: Arc<std::sync::atomic::AtomicBool>,
    _child: Mutex<Child>,
    /// The adapter's process group: npx, node and the Claude CLI under it
    group: Option<u32>,
}

impl Drop for Connection {
    /// `kill_on_drop` reaches only npx; the adapter and the CLI it started
    /// are in the same group, and go with it
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(group) = self.group.and_then(|g| i32::try_from(g).ok()) {
            // SAFETY: a plain signal to a group this connection started
            unsafe {
                libc::killpg(group, libc::SIGKILL);
            }
        }
    }
}

/// Takes a request's entry out of `pending` however the request ends (a
/// timeout, a failed write, the caller giving up)
struct PendingEntry<'a>(&'a Pending, u64);

impl Drop for PendingEntry<'_> {
    fn drop(&mut self) {
        self.0.lock().unwrap_or_else(|p| p.into_inner()).remove(&self.1);
    }
}

impl Connection {
    /// Start the agent (`command`) and initialize the connection (no client
    /// capabilities).
    pub async fn spawn(mut command: Command) -> AppResult<Arc<Self>> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // A group of its own, so the whole adapter can be stopped
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command.spawn().map_err(|e| AppError::assistant(format!("starting the agent: {e}")))?;
        let group = if cfg!(unix) { child.id() } else { None };
        let stdin = child.stdin.take().expect("piped");
        let stdout = child.stdout.take().expect("piped");
        let stderr = child.stderr.take().expect("piped");
        let pending: Arc<Pending> = Arc::default();
        let subscribers: Arc<Subscribers> = Arc::default();
        let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let (replies_tx, mut replies_rx) = mpsc::unbounded_channel::<Value>();

        // The agent's messages: replies, its requests, session updates
        {
            let (pending, subscribers, alive) = (pending.clone(), subscribers.clone(), alive.clone());
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
                    match (message.get("id"), message.get("method").and_then(Value::as_str)) {
                        // A reply to one of ours
                        (Some(id), None) => {
                            if let Some(tx) = id.as_u64().and_then(|id| pending.lock().unwrap_or_else(|p| p.into_inner()).remove(&id)) {
                                let _ = tx.send(match message.get("error") {
                                    Some(error) => Err(error.clone()),
                                    None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                                });
                            }
                        }
                        // A request from the agent. A permission goes to whoever
                        // follows the session (the candidate decides; cancelled
                        // when nobody does); anything else is not supported
                        (Some(id), Some(method)) => {
                            let cancelled = || json!({ "outcome": { "outcome": "cancelled" } });
                            if method == "session/request_permission" {
                                let params = message.get("params").cloned().unwrap_or(Value::Null);
                                let session = params.get("sessionId").and_then(Value::as_str).unwrap_or_default().to_string();
                                let (tx, rx) = oneshot::channel();
                                let asked = subscribers
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .get(&session)
                                    .is_some_and(|s| s.send(Update::Permission(params, tx)).is_ok());
                                let (id, replies_tx) = (id.clone(), replies_tx.clone());
                                tokio::spawn(async move {
                                    let outcome = if asked { rx.await.unwrap_or_else(|_| cancelled()) } else { cancelled() };
                                    let _ = replies_tx.send(json!({ "jsonrpc": "2.0", "id": id, "result": outcome }));
                                });
                            } else {
                                let _ = replies_tx.send(
                                    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("{method} is not supported") } }),
                                );
                            }
                        }
                        // A notification: session updates go to the session's subscriber
                        (None, Some("session/update")) => {
                            let params = message.get("params").cloned().unwrap_or(Value::Null);
                            if let Some(session) = params.get("sessionId").and_then(Value::as_str) {
                                if let Some(tx) = subscribers.lock().unwrap_or_else(|p| p.into_inner()).get(session) {
                                    let _ = tx.send(Update::Session(params.get("update").cloned().unwrap_or(Value::Null)));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                // The agent is gone: nothing more will be answered
                alive.store(false, Ordering::SeqCst);
                for (_, tx) in pending.lock().unwrap_or_else(|p| p.into_inner()).drain() {
                    let _ = tx.send(Err(json!({ "code": -32000, "message": "the agent stopped" })));
                }
                subscribers.lock().unwrap_or_else(|p| p.into_inner()).clear();
            });
        }
        // Its log, for diagnosis
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!(target: "acp", "{line}");
            }
        });

        let connection = Arc::new(Self {
            stdin: tokio::sync::Mutex::new(stdin),
            next_id: AtomicU64::new(0),
            pending,
            subscribers,
            alive,
            _child: Mutex::new(child),
            group,
        });
        // Replies to the agent's requests share stdin with ours
        {
            let connection = Arc::downgrade(&connection);
            tokio::spawn(async move {
                while let Some(reply) = replies_rx.recv().await {
                    let Some(connection) = connection.upgrade() else { break };
                    let _ = connection.write(&reply).await;
                }
            });
        }
        connection
            .request_within(
                INITIALIZE_TIMEOUT,
                "initialize",
                json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    // Read-only: no file system, no terminal
                    "clientCapabilities": {},
                    "clientInfo": { "name": "ckdry", "title": "ckdry", "version": env!("CARGO_PKG_VERSION") },
                }),
            )
            .await?;
        Ok(connection)
    }

    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    async fn write(&self, message: &Value) -> AppResult<()> {
        let mut line = serde_json::to_string(message).unwrap_or_default();
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await.map_err(|e| AppError::assistant(format!("writing to the agent: {e}")))?;
        stdin.flush().await.map_err(|e| AppError::assistant(format!("writing to the agent: {e}")))
    }

    /// A request, and its result (an agent error becomes `AppError::Assistant`)
    pub async fn request(&self, method: &str, params: Value) -> AppResult<Value> {
        self.request_within(REQUEST_TIMEOUT, method, params).await
    }

    /// `request`, failing when the agent has not answered within `timeout`
    pub async fn request_within(&self, timeout: Duration, method: &str, params: Value) -> AppResult<Value> {
        if !self.alive() {
            return Err(AppError::assistant("the agent stopped"));
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap_or_else(|p| p.into_inner()).insert(id, tx);
        let _entry = PendingEntry(&self.pending, id);
        self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })).await?;
        let reply = tokio::time::timeout(timeout, rx)
            .await
            .map_err(|_| AppError::assistant(format!("the agent did not answer {method} within {}s", timeout.as_secs())))?;
        match reply {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => {
                let message = error.get("message").and_then(Value::as_str).unwrap_or("the agent returned an error").to_string();
                Err(if error.get("code").and_then(Value::as_i64) == Some(AUTH_REQUIRED) {
                    AppError::SignInRequired { message }
                } else {
                    AppError::assistant(message)
                })
            }
            Err(_) => Err(AppError::assistant("the agent stopped")),
        }
    }

    pub async fn notify(&self, method: &str, params: Value) -> AppResult<()> {
        self.write(&json!({ "jsonrpc": "2.0", "method": method, "params": params })).await
    }

    /// The updates of a session and its permission requests, until `unsubscribe`
    pub fn subscribe(&self, session: &str) -> mpsc::UnboundedReceiver<Update> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.subscribers.lock().unwrap_or_else(|p| p.into_inner()).insert(session.to_string(), tx);
        rx
    }

    pub fn unsubscribe(&self, session: &str) {
        self.subscribers.lock().unwrap_or_else(|p| p.into_inner()).remove(session);
    }
}
