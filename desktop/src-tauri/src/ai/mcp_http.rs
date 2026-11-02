//! The MCP server the assistant's agent sessions reach: their tools, served
//! by the app itself over HTTP (Streamable HTTP, JSON replies). Only the
//! app's loopback, and only with this run's token. The path says whose:
//! `/mcp/<question>` a practice question's session, `/studio/<conversation>`
//! a Create conversation (`studio::tools`).

use super::mcp::Server;
use crate::studio::tools::Tools as Studio;
use crate::error::{AppError, AppResult};
use crate::store::Store;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::{Method, Request, Response, StatusCode};
use std::sync::Arc;

/// Largest request body taken (a JSON-RPC message)
const MAX_BODY: usize = 1024 * 1024;

pub struct McpHttp {
    port: u16,
    token: String,
}

/// What a request reaches: the store (a question's tools), the Create
/// conversations' tools, and the token it must carry
type Context = Arc<(Arc<Store>, Option<Arc<Studio>>, String)>;

impl McpHttp {
    /// Listen on a free loopback port until the app quits
    pub async fn start(store: Arc<Store>, studio: Option<Arc<Studio>>) -> AppResult<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| AppError::io("starting the MCP server", e))?;
        let port = listener.local_addr().map_err(|e| AppError::io("starting the MCP server", e))?.port();
        let token: String = (0..32).map(|_| format!("{:02x}", rand::random::<u8>())).collect();
        let context: Context = Arc::new((store, studio, token.clone()));
        tokio::spawn(async move {
            // A few sessions at a time; a client that never sends its request
            // does not hold a connection for long
            let slots = Arc::new(tokio::sync::Semaphore::new(MAX_CONNECTIONS));
            loop {
                let (stream, _) = match listener.accept().await {
                    Ok(accepted) => accepted,
                    Err(e) => {
                        // Out of file descriptors, say: wait instead of spinning
                        tracing::warn!(error = %e, "accepting an MCP connection");
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        continue;
                    }
                };
                let Ok(slot) = slots.clone().acquire_owned().await else { break };
                let context = context.clone();
                tokio::spawn(async move {
                    let _slot = slot;
                    let service = hyper::service::service_fn(move |request| handle(context.clone(), request));
                    let io = hyper_util::rt::TokioIo::new(stream);
                    let _ = hyper::server::conn::http1::Builder::new()
                        .timer(hyper_util::rt::TokioTimer::new())
                        .header_read_timeout(std::time::Duration::from_secs(10))
                        .serve_connection(io, service)
                        .await;
                });
            }
        });
        tracing::info!(port, "MCP server for agent sessions");
        Ok(Self { port, token })
    }

    /// The `mcpServers` entry that gives a Create conversation its tools
    pub fn server_for_studio(&self, session: i32) -> serde_json::Value {
        serde_json::json!({
            "type": "http",
            "name": "cktry",
            "url": format!("http://127.0.0.1:{}/studio/{session}", self.port),
            "headers": [{ "name": "Authorization", "value": format!("Bearer {}", self.token) }],
        })
    }

    /// The `mcpServers` entry that gives an agent session the tools for
    /// `question`
    pub fn server_for(&self, question: &str) -> serde_json::Value {
        serde_json::json!({
            "type": "http",
            "name": "cktry",
            "url": format!("http://127.0.0.1:{}/mcp/{}", self.port, hex(question)),
            "headers": [{ "name": "Authorization", "value": format!("Bearer {}", self.token) }],
        })
    }
}

/// Connections served at once
const MAX_CONNECTIONS: usize = 16;


async fn handle(context: Context, request: Request<Incoming>) -> Result<Response<Full<Bytes>>, std::convert::Infallible> {
    let (store, studio, token) = &*context;
    let reply = |status: StatusCode, body: &str| {
        let mut response = Response::new(Full::new(Bytes::from(body.to_string())));
        *response.status_mut() = status;
        response
    };
    let authorized = request
        .headers()
        .get(hyper::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.strip_prefix("Bearer ").is_some_and(|t| constant_eq(t, token)));
    if !authorized {
        return Ok(reply(StatusCode::UNAUTHORIZED, ""));
    }
    let path = request.uri().path();
    let whose = if let Some(question) = path.strip_prefix("/mcp/").and_then(unhex) {
        Whose::Question(question)
    } else if let Some((session, studio)) = path.strip_prefix("/studio/").and_then(|s| s.parse().ok()).zip(studio.clone()) {
        Whose::Studio(session, studio)
    } else {
        return Ok(reply(StatusCode::NOT_FOUND, ""));
    };
    // JSON replies only: no server-sent stream to open
    if request.method() != Method::POST {
        return Ok(reply(StatusCode::METHOD_NOT_ALLOWED, ""));
    }
    let Ok(body) = Limited::new(request.into_body(), MAX_BODY).collect().await else {
        return Ok(reply(StatusCode::PAYLOAD_TOO_LARGE, ""));
    };
    let Ok(message) = serde_json::from_slice::<serde_json::Value>(&body.to_bytes()) else {
        return Ok(reply(StatusCode::BAD_REQUEST, ""));
    };
    let answer = match whose {
        Whose::Question(question) => Server::new(store.clone(), question).handle(&message).await,
        Whose::Studio(session, studio) => studio.handle(session, &message).await,
    };
    Ok(match answer {
        Some(answer) => {
            let mut response = reply(StatusCode::OK, &answer.to_string());
            response.headers_mut().insert(hyper::header::CONTENT_TYPE, hyper::header::HeaderValue::from_static("application/json"));
            response
        }
        // A notification or a response: accepted, nothing to say
        None => reply(StatusCode::ACCEPTED, ""),
    })
}

/// Whose tools a request is for
enum Whose {
    Question(String),
    Studio(i32, Arc<Studio>),
}

fn hex(text: &str) -> String {
    text.bytes().map(|b| format!("{b:02x}")).collect()
}

fn unhex(hex: &str) -> Option<String> {
    if hex.len() % 2 != 0 {
        return None;
    }
    let bytes: Option<Vec<u8>> = (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok()).collect();
    String::from_utf8(bytes?).ok()
}

/// Equal strings, compared in time that does not depend on where they differ
fn constant_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Over real HTTP (curl): the tools answer with this run's token only
    #[tokio::test]
    async fn the_tools_answer_this_runs_token_only() {
        let server = McpHttp::start(Arc::new(Store::in_memory().unwrap()), None).await.unwrap();
        let entry = server.server_for("core/cka-001/q01-namespace-and-pod-creation");
        let url = entry["url"].as_str().unwrap().to_string();
        let token = entry["headers"][0]["value"].as_str().unwrap().to_string();
        for (auth, expect) in [(token.as_str(), "run_command"), ("Bearer nope", "401")] {
            let out = tokio::process::Command::new("curl")
                .args(["-s", "-w", "%{http_code}", "-H", &format!("Authorization: {auth}"), "-H", "Content-Type: application/json"])
                .args(["-d", r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#, &url])
                .output()
                .await
                .unwrap();
            let text = String::from_utf8_lossy(&out.stdout);
            assert!(text.contains(expect), "{text}");
        }
    }

    #[test]
    fn question_ids_travel_in_the_path() {
        let id = "core/cka-001/q01-namespace-and-pod-creation";
        assert_eq!(unhex(&hex(id)).as_deref(), Some(id));
        assert_eq!(unhex("zz"), None);
        assert_eq!(unhex("abc"), None);
        assert!(constant_eq("token", "token") && !constant_eq("token", "tokem") && !constant_eq("a", "ab"));
    }
}
