//! The MCP server the assistant's agent sessions reach from their container
//! (`host.docker.internal`): the tools of `ckdry mcp --agent`, served by the
//! app itself over HTTP (Streamable HTTP, JSON replies). Only the app's
//! loopback, and only with this run's token; the session's question is in
//! the path.

use super::mcp::Server;
use crate::error::{AppError, AppResult};
use crate::lab::load::LoadedPack;
use crate::store::Store;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::{Method, Request, Response, StatusCode};
use std::path::PathBuf;
use std::sync::Arc;

/// Largest request body taken (a JSON-RPC message)
const MAX_BODY: usize = 1024 * 1024;

pub struct McpHttp {
    port: u16,
    token: String,
}

impl McpHttp {
    /// Listen on a free loopback port until the app quits; `bank` gives the
    /// question bank as it is now (the candidate's questions change it)
    pub async fn start(bank: impl Fn() -> Arc<LoadedPack> + Send + Sync + 'static, store: Arc<Store>, data_dir: PathBuf) -> AppResult<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| AppError::io("starting the MCP server", e))?;
        let port = listener.local_addr().map_err(|e| AppError::io("starting the MCP server", e))?.port();
        let token: String = (0..32).map(|_| format!("{:02x}", rand::random::<u8>())).collect();
        let context: Context = Arc::new((Box::new(bank), store, data_dir, token.clone()));
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else { continue };
                let context = context.clone();
                tokio::spawn(async move {
                    let service = hyper::service::service_fn(move |request| handle(context.clone(), request));
                    let io = hyper_util::rt::TokioIo::new(stream);
                    let _ = hyper::server::conn::http1::Builder::new().serve_connection(io, service).await;
                });
            }
        });
        tracing::info!(port, "MCP server for agent sessions");
        Ok(Self { port, token })
    }

    /// The `mcpServers` entry that gives an agent session the tools for
    /// `question`, reached from a container (`host.docker.internal`) or from
    /// the Mac itself
    pub fn server_for(&self, question: &str, from_container: bool) -> serde_json::Value {
        let host = if from_container { "host.docker.internal" } else { "127.0.0.1" };
        serde_json::json!({
            "type": "http",
            "name": "ckdry",
            "url": format!("http://{host}:{}/mcp/{}", self.port, hex(question)),
            "headers": [{ "name": "Authorization", "value": format!("Bearer {}", self.token) }],
        })
    }
}

type Context = Arc<(Box<dyn Fn() -> Arc<LoadedPack> + Send + Sync>, Arc<Store>, PathBuf, String)>;

async fn handle(context: Context, request: Request<Incoming>) -> Result<Response<Full<Bytes>>, std::convert::Infallible> {
    let (bank, store, data_dir, token) = &*context;
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
    let Some(question) = request.uri().path().strip_prefix("/mcp/").and_then(unhex) else {
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
    let server = Server::new(bank(), store.clone(), data_dir.clone(), Some(question));
    Ok(match server.handle(&message).await {
        Some(answer) => {
            let mut response = reply(StatusCode::OK, &answer.to_string());
            response.headers_mut().insert(hyper::header::CONTENT_TYPE, hyper::header::HeaderValue::from_static("application/json"));
            response
        }
        // A notification or a response: accepted, nothing to say
        None => reply(StatusCode::ACCEPTED, ""),
    })
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

    /// From the agent's container (needs Docker and the agent image): the
    /// tools answer with this run's token only
    #[tokio::test]
    #[ignore]
    async fn agent_container_reaches_the_tools() {
        let root = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packs/core"));
        let bank = Arc::new(crate::lab::load::load(&root).0.unwrap());
        let server = McpHttp::start(move || bank.clone(), Arc::new(Store::in_memory().unwrap()), std::env::temp_dir(), ).await.unwrap();
        let entry = server.server_for("core/cka-001/q01-namespace-and-pod-creation", true);
        let call = |auth: &str| {
            format!(
                "fetch({url:?}, {{ method: 'POST', headers: {{ 'Content-Type': 'application/json', Authorization: {auth:?} }}, body: JSON.stringify({{ jsonrpc: '2.0', id: 1, method: 'tools/list' }}) }}).then(async r => console.log(r.status, await r.text()))",
                url = entry["url"].as_str().unwrap(),
            )
        };
        let token = entry["headers"][0]["value"].as_str().unwrap().to_string();
        for (auth, expect) in [(token.as_str(), "run_command"), ("Bearer nope", "401")] {
            let out = tokio::process::Command::new(crate::runtime::docker::cli().unwrap())
                .args(["run", "--rm", "--add-host", "host.docker.internal:host-gateway", "--entrypoint", "node"])
                .arg(crate::runtime::infra::AGENT_IMAGE.tag())
                .args(["-e", &call(auth)])
                .output()
                .await
                .unwrap();
            let text = String::from_utf8_lossy(&out.stdout);
            println!("{text}");
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
