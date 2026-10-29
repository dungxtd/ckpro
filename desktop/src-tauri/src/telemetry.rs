//! The core's errors to PostHog, beside the interface's own analytics: what
//! is logged as a warning or an error, failed activities and panics, as
//! `$exception` events of the same person and session. The interface says
//! where to send them and whether to (`configure`, from Settings > About);
//! until then, and when turned off, nothing leaves. A panic that ends the
//! app is kept in the data directory and sent at the next start.

use crate::sync::MutexExt;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;

/// Where to send, as the interface set it; none: nothing is sent
#[derive(Clone)]
struct Target {
    key: String,
    host: String,
    distinct_id: String,
    session_id: Option<String>,
}

struct Telemetry {
    target: Mutex<Option<Target>>,
    /// Each error once per run (a loop failing every second sends one)
    sent: Mutex<HashSet<String>>,
    queue: tokio::sync::mpsc::UnboundedSender<Value>,
}

static TELEMETRY: OnceLock<Telemetry> = OnceLock::new();

/// Most distinct errors sent in one run
const MAX_SENT: usize = 200;

fn telemetry() -> &'static Telemetry {
    TELEMETRY.get_or_init(|| {
        let (queue, mut events) = tokio::sync::mpsc::unbounded_channel::<Value>();
        tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::new();
            while let Some(event) = events.recv().await {
                let Some(target) = TELEMETRY.get().and_then(|t| t.target.locked().clone()) else { continue };
                let mut event = event;
                event["api_key"] = json!(target.key);
                event["distinct_id"] = json!(target.distinct_id);
                if let Some(session) = &target.session_id {
                    event["properties"]["$session_id"] = json!(session);
                }
                let url = format!("{}/i/v0/e/", target.host.trim_end_matches('/'));
                let body = serde_json::to_vec(&event).unwrap_or_default();
                let sent = client.post(url).header("content-type", "application/json").body(body).send().await;
                // A panic that did not end the app went out: not again next start
                if sent.is_ok_and(|r| r.status().is_success())
                    && event["properties"]["source"] == "panic"
                    && let Some(dir) = CRASH_DIR.get()
                {
                    let _ = std::fs::remove_file(crash_file(dir));
                }
            }
        });
        Telemetry { target: Mutex::default(), sent: Mutex::default(), queue }
    })
}

/// Send to `key` at `host` as the interface's person (on), or stop (off)
pub fn configure(on: bool, key: String, host: String, distinct_id: String, session_id: Option<String>) {
    let t = telemetry();
    *t.target.locked() = on.then_some(Target { key, host, distinct_id, session_id });
    if on {
        send_crash();
    }
}

/// One error, once per run; nothing while off
fn capture(kind: &str, message: &str, level: &str, source: &str) {
    let Some(t) = TELEMETRY.get() else { return };
    if t.target.locked().is_none() {
        return;
    }
    {
        let mut sent = t.sent.locked();
        if sent.len() >= MAX_SENT || !sent.insert(format!("{source}\n{message}")) {
            return;
        }
    }
    let _ = t.queue.send(exception(kind, message, level, source));
}

fn exception(kind: &str, message: &str, level: &str, source: &str) -> Value {
    json!({
        "event": "$exception",
        "properties": {
            "$exception_list": [{
                "type": kind,
                "value": message,
                "mechanism": { "handled": kind != "panic", "synthetic": true },
            }],
            "$exception_level": level,
            "runtime": "rust",
            "source": source,
            "app_version": env!("CARGO_PKG_VERSION"),
        },
    })
}

/// An activity that failed (preparing, grading, a cluster): not cancelled ones
pub fn activity_failed(title: &str, error: &str) {
    capture("ActivityFailed", &format!("{title}: {error}"), "error", "activity");
}

/// Warnings and errors the core logs, as exceptions. Not the guard's notes
/// (what happened outside the app, the candidate's own commands among them)
/// nor the libraries' own (the sending itself goes through one)
pub struct Layer;

impl<S: Subscriber> tracing_subscriber::Layer<S> for Layer {
    fn on_event(&self, event: &Event<'_>, _: Context<'_, S>) {
        let meta = event.metadata();
        let level = *meta.level();
        if level > Level::WARN || !meta.target().starts_with("ckdry") {
            return;
        }
        let mut text = Text::default();
        event.record(&mut text);
        let level = if level == Level::ERROR { "error" } else { "warning" };
        capture("Logged", &text.0, level, meta.target());
    }
}

/// An event's message and fields, as one line
#[derive(Default)]
struct Text(String);

impl Visit for Text {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if !self.0.is_empty() {
            self.0.push_str(", ");
        }
        if field.name() == "message" {
            self.0.insert_str(0, &format!("{value:?}"));
        } else {
            self.0.push_str(&format!("{}={value:?}", field.name()));
        }
    }
}

/// A panic: sent now when it does not end the app (a task's), and kept on
/// disk for the next start when it does
pub fn watch_panics(data_dir: std::path::PathBuf) {
    let _ = CRASH_DIR.set(data_dir.clone());
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info.location().map(|l| format!(" at {}:{}", l.file(), l.line())).unwrap_or_default();
        let what = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let message = format!("{what}{place}");
        let _ = std::fs::write(crash_file(&data_dir), &message);
        capture("panic", &message, "fatal", "panic");
        previous(info);
    }));
}

/// The data directory, where a panic is kept for the next start
static CRASH_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

fn crash_file(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("last-crash.txt")
}

/// The panic an earlier run ended with, once sending is on
fn send_crash() {
    let Some(dir) = CRASH_DIR.get() else { return };
    let file = crash_file(dir);
    if let Ok(message) = std::fs::read_to_string(&file) {
        let _ = std::fs::remove_file(&file);
        capture("panic", &message, "fatal", "panic (earlier run)");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_exception_says_what_and_where() {
        let e = exception("Logged", "saving exam history: disk full", "warning", "ckdry_lib::lab::exam");
        assert_eq!(e["event"], "$exception");
        assert_eq!(e["properties"]["$exception_list"][0]["value"], "saving exam history: disk full");
        assert_eq!(e["properties"]["$exception_list"][0]["mechanism"]["handled"], true);
        assert_eq!(e["properties"]["runtime"], "rust");
    }

    /// A failed activity reaches PostHog's capture endpoint once, as the
    /// interface's person, and nothing is sent while off
    #[tokio::test]
    async fn errors_go_to_posthog_once_and_only_when_on() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let host = format!("http://{}", listener.local_addr().unwrap());
        activity_failed("Off", "not sent");
        configure(true, "phc_test".into(), host, "person-1".into(), Some("session-1".into()));
        activity_failed("Grading CKA", "docker is down");
        activity_failed("Grading CKA", "docker is down");
        let (mut socket, _) = tokio::time::timeout(std::time::Duration::from_secs(10), listener.accept()).await.unwrap().unwrap();
        let mut request = vec![0; 8192];
        let n = socket.read(&mut request).await.unwrap();
        let _ = socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}").await;
        let request = String::from_utf8_lossy(&request[..n]).to_string();
        assert!(request.starts_with("POST /i/v0/e/"), "{request}");
        for part in ["phc_test", "person-1", "session-1", "$exception", "Grading CKA: docker is down"] {
            assert!(request.contains(part), "{part} in {request}");
        }
        assert!(!request.contains("not sent"));
        // The same error again was not sent a second time
        assert!(tokio::time::timeout(std::time::Duration::from_millis(500), listener.accept()).await.is_err());
        configure(false, String::new(), String::new(), String::new(), None);
    }
}
