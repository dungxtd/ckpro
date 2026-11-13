//! What the agent asks before it runs a command: allowed at once when Tool
//! access says so, else shown to the candidate to answer

use super::{Coach, CoachEvent, policy};
use crate::error::{AppError, AppResult};
use crate::sync::MutexExt;
use serde::{Deserialize, Serialize};

/// One way to answer a permission request (ACP's options: allow once,
/// allow always, reject once…)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct PermissionOption {
    pub id: String,
    pub name: String,
    pub kind: String,
}

/// A permission request waiting for the candidate: the option ids offered,
/// and where the answer goes
pub(super) type Waiting = (Vec<String>, tokio::sync::oneshot::Sender<serde_json::Value>);

impl Coach {
    /// Keep a permission request for the candidate; its id
    fn next_permission(&self, offered: Vec<String>, reply: tokio::sync::oneshot::Sender<serde_json::Value>) -> u32 {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
        let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.permissions.locked().insert(id, (offered, reply));
        id
    }

    /// The candidate's answer to a permission request: one of its options,
    /// or none to cancel
    pub fn permit(&self, id: u32, option: Option<String>) -> AppResult<()> {
        let mut waiting = self.permissions.locked();
        let (offered, reply) =
            waiting.remove(&id).ok_or_else(|| AppError::not_found("that request was already answered or stopped"))?;
        if option.as_ref().is_some_and(|o| !offered.contains(o)) {
            waiting.insert(id, (offered, reply));
            return Err(AppError::invalid("that answer was not offered"));
        }
        drop(waiting);
        let outcome = match option {
            Some(option) => serde_json::json!({ "outcome": { "outcome": "selected", "optionId": option } }),
            None => serde_json::json!({ "outcome": { "outcome": "cancelled" } }),
        };
        let _ = reply.send(outcome);
        Ok(())
    }

    /// The agent asks to run a command: allowed at once when Tool access says
    /// so, else shown to the candidate (its id, to answer with `permit`)
    pub(super) fn ask_permission(
        &self,
        settings: &policy::AgentSettings,
        params: &serde_json::Value,
        reply: tokio::sync::oneshot::Sender<serde_json::Value>,
        on_event: &impl Fn(CoachEvent),
    ) -> Option<u32> {
        let shell = params["toolCall"]["rawInput"]["command"].as_str();
        // The app's check: the question's own checks, which only read (as
        // the candidate's Check my work does), so it runs unasked unless
        // every action waits for Run
        let checking = shell.is_none() && params["toolCall"]["title"].as_str().is_some_and(|t| t.ends_with("check_my_work"));
        let command = shell.or(params["toolCall"]["title"].as_str()).unwrap_or("a tool").to_string();
        // Tool access judges the app's own run_command only: another tool that
        // carries a command (a shell the agent should not have) always asks
        let ours = params["toolCall"]["title"].as_str().is_some_and(|t| t.ends_with("run_command"));
        let unasked = if checking {
            settings.permission != policy::AgentPermission::Confirm
        } else {
            ours && shell.is_some() && settings.runs_unasked(&command)
        };
        let once = params["options"].as_array().into_iter().flatten().find(|o| o["kind"] == "allow_once");
        if let Some(once) = once.filter(|_| unasked) {
            let _ = reply.send(serde_json::json!({ "outcome": { "outcome": "selected", "optionId": once["optionId"] } }));
            return None;
        }
        // Not "always": Tool access in Settings decides what runs unasked,
        // and a later change there must still hold
        let options: Vec<PermissionOption> = params["options"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|o| o["kind"] != "allow_always")
            .map(|o| PermissionOption {
                id: o["optionId"].as_str().unwrap_or_default().to_string(),
                name: o["name"].as_str().unwrap_or_default().to_string(),
                kind: o["kind"].as_str().unwrap_or_default().to_string(),
            })
            .collect();
        let id = self.next_permission(options.iter().map(|o| o.id.clone()).collect(), reply);
        let (command, tool) = if checking { (String::new(), Some("Check your work".to_string())) } else { (command, None) };
        on_event(CoachEvent::Permission { id, command, tool, options });
        Some(id)
    }
}
