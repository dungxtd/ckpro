//! The practice coach: help with the current question, the way a tutor would.
//! It reads the question as the candidate sees it, their last "Check my work",
//! the documentation the exam allows and, when checks fail, a read-only look
//! at the cluster; the reference answer only once the candidate opened it.
//! Never during an exam-mode attempt (`Exams::coach_subject` refuses).

pub mod account;
mod acp;
pub mod agent;
pub mod generate;
pub mod mcp;
pub mod mcp_http;
pub mod policy;

use crate::error::{AppError, AppResult};
use crate::lab::checks::{self, CheckResult};
use crate::lab::exam::{CoachSubject, Exams, StudySubject};
use crate::runtime::docker;
use crate::store::{CoachMessage, Role, Store};
use agent::{Agent, ContextUsage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// The coach's default model when the agent offers it (quick answers); the
/// candidate picks among what the agent lists (`Coach::models`)
pub const DEFAULT_MODEL: &str = "sonnet";
/// Writing a question that has to pass on a cluster needs the most capable one
const GENERATOR_MODEL: &str = "opus";
/// Names a session from its first question: the quick model, and how
const TITLE_MODEL: &str = "haiku";
const TITLE_SYSTEM: &str = "You name a conversation about an exam task from its first message, like \
a chat app's sidebar. Reply with the title only: 2 to 6 words, plain text, no quotes, no trailing \
period, in the language of the message. Name the topic (\"PVC stuck in Pending\"); when the message \
says little (\"hint?\"), name it after the task (\"Hint: Dynamic PVC\").";

/// What a cluster snapshot may add to the prompt
const SNAPSHOT_CHARS: usize = 6_000;
/// Earlier turns a new session is given (the oldest are left out)
const HISTORY_CHARS: usize = 12_000;
/// Study plans are kept like conversations, under this "attempt"
const STUDY_PLANS: &str = "study-plan";

/// The coach's answer as it is written
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoachEvent {
    Text { text: String },
    /// A command the agent runs (Agent profile), as it goes
    Tool { id: String, command: String, status: String },
    /// The agent asks to run a command: the candidate picks an option
    /// (`coach_permit`)
    Permission { id: u32, command: String, options: Vec<PermissionOption> },
}

/// One way to answer a permission request (ACP's options: allow once,
/// allow always, reject once…)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct PermissionOption {
    pub id: String,
    pub name: String,
    pub kind: String,
}

/// Ask: the coach reads and answers. Agent: it may also run commands on the
/// task's host, each approved by the candidate (practice only)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Profile {
    Ask,
    Agent,
}

/// Whether the coach can run here
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachStatus {
    pub ready: bool,
    /// What to install when it cannot
    pub problem: Option<String>,
}

/// The model to answer with, and its effort (`default`: the model's own)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ModelChoice {
    pub model: String,
    pub effort: String,
    pub profile: Profile,
}

/// The models the coach can use
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachModels {
    pub options: Vec<agent::ModelOption>,
    /// Picked until the candidate picks another
    pub default: String,
}

/// What goes with a question besides the task (the panel's context chips)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachContext {
    /// The last "Check my work"
    pub checks: bool,
    /// A read-only look at the task's namespace, taken now
    pub cluster: bool,
}

/// An answer and how much of the model's context the conversation uses
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachReply {
    pub text: String,
    pub usage: Option<ContextUsage>,
    /// The session's name, when this first question gave it one
    pub title: Option<String>,
}

/// A coach session of the attempt: one per question asked about (the
/// panel's history)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachSession {
    pub question_id: String,
    /// Its own name, else its first question
    pub title: String,
    pub messages: u32,
}

/// A question's coach session: its own name (if renamed) and its messages
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachHistory {
    pub title: Option<String>,
    pub messages: Vec<CoachMessage>,
}

/// A model's title made fit for the session list: one line, no quotes or
/// markup, at most 60 characters; none if nothing is left
fn session_title(raw: &str) -> Option<String> {
    let line = raw.lines().map(str::trim).find(|l| !l.is_empty())?;
    let line = line.trim_start_matches(['#', '*', '-', ' ']).trim_start_matches("Title:").trim();
    let line = line.trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | '*' | '“' | '”')).trim_end_matches('.').trim();
    if line.is_empty() {
        return None;
    }
    let mut title: String = line.chars().take(60).collect();
    if line.chars().count() > 60 {
        title = format!("{}…", title.trim_end());
    }
    Some(title)
}

/// The practice coach: one ACP session per question's conversation, one
/// answer at a time (a new one stops the one being written)
pub struct Coach {
    agent: Agent,
    running: Mutex<Option<CancellationToken>>,
    /// The ACP sessions behind open coach sessions: (attempt, question) →
    /// (ACP session, model, effort, profile)
    open: tokio::sync::Mutex<HashMap<(String, String), (String, String, String, Profile)>>,
    /// Claude Code is turned on (Settings > AI): off, nothing asks it
    enabled: std::sync::atomic::AtomicBool,
    /// The tools agent sessions get, once their server listens
    tools: std::sync::OnceLock<mcp_http::McpHttp>,
    /// Permission requests waiting for the candidate, by id
    permissions: Mutex<HashMap<u32, tokio::sync::oneshot::Sender<serde_json::Value>>>,
    /// The Claude login being run, if any
    signing_in: tokio::sync::Mutex<Option<account::SigningIn>>,
}

impl Coach {
    pub fn new() -> Self {
        Self {
            agent: Agent::new(),
            running: Mutex::new(None),
            open: Default::default(),
            permissions: Default::default(),
            tools: Default::default(),
            enabled: std::sync::atomic::AtomicBool::new(true),
            signing_in: Default::default(),
        }
    }

    /// The models to pick from, as the agent lists them on this login, and
    /// the coach's default among them
    pub async fn models(&self) -> AppResult<CoachModels> {
        let options = self.agent.models().await?;
        let default = if options.iter().any(|m| m.value == DEFAULT_MODEL) { DEFAULT_MODEL } else { agent::DEFAULT };
        Ok(CoachModels { options, default: default.to_string() })
    }

    /// The effort levels `model` takes (none when it has no effort setting)
    pub async fn efforts(&self, model: &str) -> AppResult<Vec<agent::ModelOption>> {
        self.agent.efforts(model).await
    }

    /// Serve agent sessions these tools (the app's MCP server)
    pub fn serve_tools(&self, server: mcp_http::McpHttp) {
        let _ = self.tools.set(server);
    }

    /// Refuse when Claude Code is turned off in Settings
    fn require_enabled(&self) -> AppResult<()> {
        if self.enabled.load(std::sync::atomic::Ordering::SeqCst) {
            Ok(())
        } else {
            Err(AppError::assistant("Claude Code is turned off in Settings > AI"))
        }
    }

    /// Keep a permission request for the candidate; its id
    fn next_permission(&self, reply: tokio::sync::oneshot::Sender<serde_json::Value>) -> u32 {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
        let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.permissions.lock().unwrap_or_else(|p| p.into_inner()).insert(id, reply);
        id
    }

    /// The candidate's answer to a permission request: one of its options,
    /// or none to cancel
    pub fn permit(&self, id: u32, option: Option<String>) -> AppResult<()> {
        let reply = self
            .permissions
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id)
            .ok_or_else(|| AppError::not_found("that request was already answered or stopped"))?;
        let outcome = match option {
            Some(option) => serde_json::json!({ "outcome": { "outcome": "selected", "optionId": option } }),
            None => serde_json::json!({ "outcome": { "outcome": "cancelled" } }),
        };
        let _ = reply.send(outcome);
        Ok(())
    }

    /// Who the assistant answers as
    pub async fn account(&self) -> AppResult<account::Account> {
        account::account(&self.agent).await
    }

    /// Sign in to Claude; the login's output streams to `on_event`. A new
    /// login stops one still running
    pub async fn sign_in(&self, method: account::SignInMethod, on_event: impl Fn(account::SignInEvent)) -> AppResult<()> {
        if let Some(earlier) = self.signing_in.lock().await.take() {
            earlier.cancel();
        }
        let result = account::sign_in(
            &self.agent,
            method,
            |login| {
                // The slot was just emptied and only this call fills it
                if let Ok(mut slot) = self.signing_in.try_lock() {
                    *slot = Some(login);
                }
            },
            on_event,
        )
        .await;
        self.signing_in.lock().await.take();
        // The conversations were opened on the earlier login's adapter
        self.open.lock().await.clear();
        result
    }

    /// A line typed into the running login (the code the browser shows)
    pub async fn sign_in_input(&self, line: &str) -> AppResult<()> {
        match self.signing_in.lock().await.as_mut() {
            Some(login) => login.input(line).await,
            None => Err(AppError::invalid("no sign-in is running")),
        }
    }

    pub async fn sign_in_cancel(&self) {
        if let Some(login) = self.signing_in.lock().await.take() {
            login.cancel();
        }
    }

    pub async fn sign_out(&self) -> AppResult<()> {
        self.cancel();
        let result = account::sign_out(&self.agent).await;
        self.open.lock().await.clear();
        result
    }

    pub fn status(&self) -> CoachStatus {
        match self.agent.ready() {
            true => CoachStatus { ready: true, problem: None },
            false => CoachStatus {
                ready: false,
                problem: Some("Install Claude Code and Node.js, or set the Claude CLI's path in Settings > AI".into()),
            },
        }
    }

    /// Take the assistant settings; another CLI restarts the adapter
    pub async fn configure(&self, settings: &policy::AgentSettings) {
        let on = settings.enabled.contains(&policy::Provider::Claude);
        self.enabled.store(on, std::sync::atomic::Ordering::SeqCst);
        if self.agent.configure(settings) {
            self.agent.restart().await;
            self.open.lock().await.clear();
        }
    }

    /// What this Mac offers the assistant (Settings)
    pub async fn runtime(&self) -> agent::RuntimeInfo {
        self.agent.info().await
    }


    pub fn history(exams: &Exams, store: &Store, question_id: &str) -> AppResult<CoachHistory> {
        let subject = exams.coach_subject(question_id, false)?;
        Ok(CoachHistory {
            title: store.coach_session_title(&subject.attempt_id, question_id)?,
            messages: store.coach_messages(&subject.attempt_id, question_id)?,
        })
    }

    /// The attempt's coach sessions, one per question asked about
    pub fn sessions(exams: &Exams, store: &Store) -> AppResult<Vec<CoachSession>> {
        let Some(attempt) = exams.coach_attempt() else { return Ok(Vec::new()) };
        Ok(store
            .coach_sessions(&attempt)?
            .into_iter()
            .map(|(question_id, title, messages)| CoachSession { question_id, title, messages })
            .collect())
    }

    /// Name a question's coach session; empty: back to its first question
    pub fn rename(exams: &Exams, store: &Store, question_id: &str, title: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        store.rename_coach_session(&subject.attempt_id, question_id, title)
    }

    /// Answer `text` about the question in its conversation; the answer
    /// streams to `on_event` and is kept with the question once complete.
    #[allow(clippy::too_many_arguments)]
    pub async fn ask(
        &self,
        exams: &Exams,
        store: &Store,
        question_id: &str,
        text: &str,
        checks: &[CheckResult],
        solution_opened: bool,
        model: &str,
        effort: &str,
        profile: Profile,
        context: CoachContext,
        on_event: impl Fn(CoachEvent) + Sync,
    ) -> AppResult<CoachReply> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AppError::invalid("ask the coach something"));
        }
        self.require_enabled()?;
        let subject = exams.coach_subject(question_id, solution_opened)?;
        // Commands only while practising: never in review (the environment
        // is graded) and never in an exam (coach_subject refuses it anyway)
        let profile = if subject.review { Profile::Ask } else { profile };
        let cancel = self.start();
        // What the candidate shares with Claude (Settings > AI > Privacy)
        let shared = store.agent_settings().unwrap_or_default();
        let checks = if context.checks && shared.share_checks { checks } else { &[] };
        let snapshot = if context.cluster && shared.share_cluster { snapshot(&subject).await } else { None };
        let key = (subject.attempt_id.clone(), question_id.to_string());
        let opened = match self.open.lock().await.get(&key).cloned() {
            // Another profile is another session (other tools); the history goes along
            Some((session, .., open_profile)) if open_profile != profile => {
                self.agent.close(&session).await;
                None
            }
            opened => opened,
        };
        let (session, prompt) = match opened {
            Some((session, current, current_effort, _)) => {
                if current != model {
                    self.agent.set_model(&session, model).await?;
                }
                if current != model || current_effort != effort {
                    self.agent.set_effort(&session, model, effort).await?;
                }
                (session, followup(checks, snapshot.as_deref(), text))
            }
            // A new session (or the app restarted): the task, and what was said before
            None => {
                let session = match profile {
                    Profile::Ask => self.agent.new_session(&system(&subject), model).await?,
                    Profile::Agent => {
                        let system = format!("{}\n{AGENT}", system(&subject));
                        let tools = self.tools.get().ok_or_else(|| AppError::assistant("the agent's tools are not ready yet; try again"))?;
                        self.agent.new_session_with(&system, model, serde_json::json!([tools.server_for(question_id)])).await?
                    }
                };
                self.agent.set_effort(&session, model, effort).await?;
                let history = store.coach_messages(&subject.attempt_id, question_id)?;
                (session, prompt(&subject, checks, snapshot.as_deref(), &history, text))
            }
        };
        self.open.lock().await.insert(key.clone(), (session.clone(), model.to_string(), effort.to_string(), profile));
        // The first question names the session, while
        // the answer is written: a quick model, nothing waits longer for it
        let settings = store.agent_settings().unwrap_or_default();
        let first = settings.auto_titles
            && store.coach_messages(&subject.attempt_id, question_id)?.is_empty()
            && store.coach_session_title(&subject.attempt_id, question_id)?.is_none();
        let naming = async {
            if !first {
                return None;
            }
            let about = format!("Task: {}\n\nFirst message: {text}", subject.view.title);
            let title = self.agent.ask_once(TITLE_SYSTEM, &about, TITLE_MODEL, &cancel, &|_| {}).await;
            title.ok().and_then(|t| session_title(&t))
        };
        // The answer as kept: its text with the commands run, in order
        let transcript = Mutex::new(String::new());
        let ran = std::sync::atomic::AtomicBool::new(false);
        let text_out = |t: &str| {
            transcript.lock().unwrap_or_else(|p| p.into_inner()).push_str(t);
            on_event(CoachEvent::Text { text: t.to_string() });
        };
        let stream = |event: agent::AgentEvent| match event {
            agent::AgentEvent::Text(t) => text_out(t),
            agent::AgentEvent::Tool(call) => {
                let command = call.input["command"].as_str().unwrap_or(&call.title).to_string();
                on_event(CoachEvent::Tool { id: call.id.clone(), command: command.clone(), status: call.status.clone() });
                if matches!(call.status.as_str(), "completed" | "failed") {
                    ran.store(true, std::sync::atomic::Ordering::SeqCst);
                    let output = call.output.as_deref().unwrap_or("").trim_end();
                    text_out(&format!("\n\n```console\n$ {command}\n{output}\n```\n\n"));
                }
            }
            agent::AgentEvent::Permission(params, reply) => {
                let command = params["toolCall"]["rawInput"]["command"]
                    .as_str()
                    .or(params["toolCall"]["title"].as_str())
                    .unwrap_or("a tool")
                    .to_string();
                // What the candidate lets run unasked (Settings > Assistant)
                let once = params["options"].as_array().into_iter().flatten().find(|o| o["kind"] == "allow_once");
                if let Some(once) = once.filter(|_| settings.runs_unasked(&command)) {
                    let _ = reply.send(serde_json::json!({ "outcome": { "outcome": "selected", "optionId": once["optionId"] } }));
                    return;
                }
                let id = self.next_permission(reply);
                let options = params["options"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|o| PermissionOption {
                        id: o["optionId"].as_str().unwrap_or_default().to_string(),
                        name: o["name"].as_str().unwrap_or_default().to_string(),
                        kind: o["kind"].as_str().unwrap_or_default().to_string(),
                    })
                    .collect();
                on_event(CoachEvent::Permission { id, command, options });
            }
        };
        let (answer, title) = tokio::join!(self.agent.prompt_with(&session, &prompt, &cancel, &stream), naming);
        // Requests left unanswered (stopped, failed) are cancelled with it
        self.permissions.lock().unwrap_or_else(|p| p.into_inner()).clear();
        if ran.load(std::sync::atomic::Ordering::SeqCst) {
            store.mark_assisted(&subject.attempt_id, question_id)?;
        }
        let answer = match answer {
            Ok(a) => a,
            Err(e) => {
                // A session the agent lost is started again next time
                if !matches!(e, AppError::Cancelled { .. }) {
                    self.open.lock().await.remove(&key);
                }
                return Err(e);
            }
        };
        let kept = transcript.into_inner().unwrap_or_else(|p| p.into_inner());
        store.add_coach_messages(
            &subject.attempt_id,
            question_id,
            &[
                CoachMessage { role: Role::User, text: text.to_string() },
                CoachMessage { role: Role::Assistant, text: kept.clone() },
            ],
        )?;
        // Unless the candidate named it meanwhile
        let title = match title {
            Some(t) if store.coach_session_title(&subject.attempt_id, question_id)?.is_none() => {
                store.rename_coach_session(&subject.attempt_id, question_id, &t)?;
                Some(t)
            }
            _ => None,
        };
        Ok(CoachReply { text: kept, usage: answer.usage, title })
    }

    /// Start the question's session over (the panel's New Session)
    pub async fn clear(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        if let Some((session, ..)) = self.open.lock().await.remove(&(subject.attempt_id.clone(), question_id.to_string())) {
            self.agent.close(&session).await;
        }
        store.clear_coach_messages(&subject.attempt_id, question_id)
    }

    /// A study plan for a certification from the history; it streams to
    /// `on_event` and is kept as the latest plan
    pub async fn study_plan(
        &self,
        exams: &Exams,
        store: &Store,
        certification: &str,
        on_event: impl Fn(CoachEvent) + Sync,
    ) -> AppResult<String> {
        self.require_enabled()?;
        let subject = exams.study_subject(certification)?;
        let cancel = self.start();
        let answer = self
            .agent
            .ask_once(&study_system(&subject), &study_prompt(&subject), DEFAULT_MODEL, &cancel, &|t| {
                on_event(CoachEvent::Text { text: t.to_string() })
            })
            .await?;
        store.add_coach_messages(STUDY_PLANS, certification, &[CoachMessage { role: Role::Assistant, text: answer.clone() }])?;
        Ok(answer)
    }

    /// The latest study plan written for a certification
    pub fn last_study_plan(store: &Store, certification: &str) -> AppResult<Option<String>> {
        Ok(store.coach_messages(STUDY_PLANS, certification)?.pop().map(|m| m.text))
    }

    /// Generate a question and prove it; stopped by `cancel` while the model writes
    pub async fn generate(
        &self,
        exams: &Exams,
        infra: &crate::runtime::infra::Infra,
        activities: &std::sync::Arc<crate::runtime::activity::Activities>,
        data_dir: &std::path::Path,
        request: &generate::GenerateRequest,
    ) -> AppResult<generate::Generated> {
        if exams.exam_in_progress() {
            return Err(AppError::invalid("the coach is not available during an exam"));
        }
        self.require_enabled()?;
        let bank = exams.bank();
        let cancel = self.start();
        let generated = generate::generate(&self.agent, GENERATOR_MODEL, &bank, infra, activities, data_dir, request, &cancel).await?;
        // The catalog shows it from now on
        match crate::lab::load::load(&bank.root).0 {
            Some(core) => exams.replace_pack(crate::lab::mine::merged(core, data_dir)),
            None => tracing::warn!("could not reload the bundled pack: the new question shows after a restart"),
        }
        Ok(generated)
    }

    /// A new answer stops the one being written
    fn start(&self) -> CancellationToken {
        let cancel = CancellationToken::new();
        if let Some(previous) = self.running.lock().unwrap_or_else(|p| p.into_inner()).replace(cancel.clone()) {
            previous.cancel();
        }
        cancel
    }

    pub fn cancel(&self) {
        if let Some(token) = self.running.lock().unwrap_or_else(|p| p.into_inner()).take() {
            token.cancel();
        }
    }
}

/// A later turn: what changed (the last check, the cluster now) and the question
fn followup(checks: &[CheckResult], snapshot: Option<&str>, text: &str) -> String {
    let mut p = String::new();
    if !checks.is_empty() {
        let _ = writeln!(p, "# Their last \"Check my work\"");
        for c in checks {
            let mark = if c.passed { "PASS" } else { "FAIL" };
            let detail = if c.detail.is_empty() { String::new() } else { format!(" ({})", c.detail) };
            let _ = writeln!(p, "- {mark} {}{detail}", c.name);
        }
        p.push('\n');
    }
    if let Some(snapshot) = snapshot {
        let _ = writeln!(p, "# Cluster snapshot (read-only, just taken)\n```\n{snapshot}\n```\n");
    }
    if p.is_empty() {
        text.to_string()
    } else {
        format!("{p}# The candidate asks\n{text}")
    }
}

fn system(subject: &CoachSubject) -> String {
    let mut s = String::from(if subject.review { REVIEW } else { PRACTICE });
    let _ = write!(
        s,
        "\nExam: {} (Kubernetes {}).\nAllowed documentation:\n",
        subject.certification, subject.kubernetes
    );
    for url in &subject.docs {
        let _ = writeln!(s, "- {url}");
    }
    s
}

/// How the coach helps while the candidate practises
const PRACTICE: &str = concat!(
        "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
The candidate is practising one exam task on a real cluster and asks you for help.\n\n\
How to help:\n\
- Teach, do not solve. Give the smallest help that unblocks them: a nudge, the concept, \
or where to look. Give the full commands only if they ask for the solution, or if the \
reference answer is included below (they already opened it).\n\
- They work in a terminal on the exam desktop: `ssh <host>` first, then kubectl. Commands go \
in ```bash blocks, manifests in ```yaml blocks; they copy them with one click.\n\
- Documentation: the exam only allows the sites listed below. Link only pages under them \
(kubernetes.io/docs/... paths you are sure exist). When pointing to docs, also give the \
keywords to type in the kubernetes.io search box, as `Search: <keywords>`: finding the \
page fast is the skill the exam tests.\n\
- When checks fail, explain what the failing check means and what in the cluster snapshot \
shows the cause.\n\
- Be brief: short paragraphs and lists, Markdown. No preamble.\n",
);

/// What the Agent profile adds: it may run commands, with the candidate's say
const AGENT: &str = "Agent mode: you can run commands on the task's host with the `run_command` \
tool (kubectl already points at the task's cluster; nodes are reached with `ssh <node>`), and run \
the task's checks with `check_my_work`. The candidate approves each command and watches it run, so:\n\
- Say in one line what you will run and why, then run it. One step at a time.\n\
- Look before you change: get, describe, logs, events. Change the cluster only when the candidate \
asked you to fix or solve it.\n\
- After changing anything, verify (`check_my_work`, or a get). Explain what each step did, so they \
can do it themselves next time.\n\
- Never touch ckdry itself (docker, kind) or other tasks' namespaces.\n";

/// How the coach helps once the attempt has its result
const REVIEW: &str = "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
The candidate finished an exam and reviews one task with you; the exam is over, so explain fully.\n\n\
How to help:\n\
- Start with what went wrong: each failing check, and what it means. If the cluster snapshot \
is included, point at what in it shows the cause.\n\
- Then the fastest way to solve it on the exam: the steps and the commands (```bash blocks, \
manifests in ```yaml blocks), using the reference answer below.\n\
- Then where it is in the documentation the exam allows (links only under the sites listed \
below, pages you are sure exist) and the keywords to type in the kubernetes.io search box, \
as `Search: <keywords>`.\n\
- End with one takeaway to remember for the exam.\n\
- Be brief: short paragraphs and lists, Markdown. No preamble.\n";

/// A study plan from the candidate's results, against the curriculum
const STUDY: &str = "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
From the candidate's results per curriculum domain, write a short study plan.\n\n\
- Rank the domains to work on by weight in the exam times how much they are missing; say why \
in one line each.\n\
- For each, name 2-3 concrete skills to drill (kubectl commands, objects, troubleshooting \
steps), the documentation pages (links only under the sites listed below, pages you are sure \
exist) and the keywords to type in the kubernetes.io search box, as `Search: <keywords>`.\n\
- Point to practice questions and exams from the lists given, by title.\n\
- End with a plan for the next sessions (what to do, in order) and when to take a full exam \
again. Markdown, brief, no preamble.\n";

fn study_system(subject: &StudySubject) -> String {
    let mut s = String::from(STUDY);
    let _ = write!(s, "\nExam: {} (Kubernetes {}).\nAllowed documentation:\n", subject.stats.title, subject.kubernetes);
    for url in &subject.docs {
        let _ = writeln!(s, "- {url}");
    }
    s
}

fn study_prompt(subject: &StudySubject) -> String {
    let st = &subject.stats;
    let mut p = String::new();
    let scores: Vec<String> = st.scores.iter().map(|s| format!("{s:.0}%")).collect();
    let _ = writeln!(p, "# Results\n{} attempt(s), scores oldest to newest: {}\n", st.scores.len(), scores.join(", "));
    let _ = writeln!(p, "| Domain | Exam weight | Score | Questions answered |\n|---|---|---|---|");
    for d in &st.domains {
        let score = if d.max_points == 0 { "not tested yet".to_string() } else { format!("{:.0}%", f64::from(d.points) * 100.0 / f64::from(d.max_points)) };
        let _ = writeln!(p, "| {} | {}% | {score} | {} |", d.domain, d.weight, d.questions);
    }
    let _ = writeln!(p, "\n# Practice questions in ckdry, by domain");
    for (domain, titles) in &subject.practice {
        let _ = writeln!(p, "- {domain}: {}", titles.join("; "));
    }
    let _ = writeln!(p, "\n# Practice exams in ckdry\n{}", subject.exams.join("; "));
    p
}

fn prompt(
    subject: &CoachSubject,
    checks: &[CheckResult],
    snapshot: Option<&str>,
    history: &[CoachMessage],
    text: &str,
) -> String {
    let q = &subject.view;
    let mut p = String::new();
    let _ = writeln!(p, "# The task\n\n## {}", q.title);
    let _ = writeln!(p, "Solve on: `ssh {}`", q.host);
    if let Some(ns) = &q.namespace {
        let _ = writeln!(p, "Namespace: `{ns}`");
    }
    if let Some(domain) = &subject.domain {
        let _ = writeln!(p, "Curriculum domain: {domain}");
    }
    let _ = writeln!(p, "Weight: {}%\n\n{}\n", q.weight, q.statement.trim());
    if !q.references.is_empty() {
        let _ = writeln!(p, "Task references: {}\n", q.references.join(", "));
    }
    if !q.hints.is_empty() {
        let _ = writeln!(p, "The task's own hints (the candidate may not have opened them):");
        for hint in &q.hints {
            let _ = writeln!(p, "- {hint}");
        }
        p.push('\n');
    }
    if !checks.is_empty() {
        let _ = writeln!(p, "# Their last \"Check my work\"");
        for c in checks {
            let mark = if c.passed { "PASS" } else { "FAIL" };
            let detail = if c.detail.is_empty() { String::new() } else { format!(" ({})", c.detail) };
            let _ = writeln!(p, "- {mark} {}{detail}", c.name);
        }
        p.push('\n');
    }
    if let Some(snapshot) = snapshot {
        let _ = writeln!(p, "# Cluster snapshot (read-only, just taken)\n```\n{snapshot}\n```\n");
    }
    if let Some(solution) = &subject.solution {
        let _ = writeln!(
            p,
            "# Reference answer (the candidate opened it)\n{}\n```bash\n{}\n```\n",
            solution.explain.trim(),
            solution.run.trim()
        );
    }
    let earlier = recent(history, HISTORY_CHARS);
    if !earlier.is_empty() {
        let _ = writeln!(p, "# The conversation so far");
        if earlier.len() < history.len() {
            let _ = writeln!(p, "(earlier messages left out)");
        }
        for m in earlier {
            let who = match m.role {
                Role::User => "Candidate",
                Role::Assistant => "Coach",
            };
            let _ = writeln!(p, "**{who}:** {}\n", m.text.trim());
        }
    }
    let _ = write!(p, "# The candidate asks\n{text}");
    p
}

/// The latest messages that fit in `budget` characters
fn recent(history: &[CoachMessage], budget: usize) -> &[CoachMessage] {
    let mut used = 0;
    let mut start = history.len();
    while start > 0 && used + history[start - 1].text.len() <= budget {
        used += history[start - 1].text.len();
        start -= 1;
    }
    &history[start..]
}

/// What is in the task's namespace (or the cluster) and its recent events,
/// from the jumphost with the task's cluster. Read-only commands only.
async fn snapshot(subject: &CoachSubject) -> Option<String> {
    let script = match &subject.view.namespace {
        Some(ns) => format!(
            "ns={ns}\n\
kubectl get all,pvc,configmap,secret,ingress,networkpolicy,serviceaccount,role,rolebinding -n \"$ns\" -o wide 2>&1 | head -80\n\
echo; echo '# events'; kubectl get events -n \"$ns\" --sort-by=.lastTimestamp 2>&1 | tail -15",
            ns = shell_word(ns)
        ),
        None => "kubectl get nodes -o wide 2>&1\necho; kubectl get pods -A 2>&1 | head -60".to_string(),
    };
    let docker = docker::connect().await.ok()?;
    let (_, output) = checks::run_script(&docker, &subject.jumphost, &subject.cluster, &script, 20).await.ok()?;
    Some(truncate(&output, SNAPSHOT_CHARS))
}

/// A namespace name as one shell word (they are DNS labels; anything else is dropped)
fn shell_word(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.').collect()
}

fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n... (truncated: {} more characters not shown)", &text[..end], text.len() - end)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real quick model names sessions (needs Node and a Claude login)
    #[tokio::test]
    #[ignore]
    async fn names_a_session_from_its_first_question() {
        let agent = Agent::new();
        for question in [
            "Why does my PVC stay Pending even though the StorageClass exists?",
            "tại sao kubectl drain node01 bị treo mãi không xong?",
            "hint pls",
        ] {
            let about = format!("Task: Dynamic PVC and Pod\n\nFirst message: {question}");
            let raw = agent.ask_once(TITLE_SYSTEM, &about, TITLE_MODEL, &CancellationToken::new(), &|_| {}).await.unwrap();
            let title = session_title(&raw).unwrap();
            println!("{question} -> {title}");
            assert!(title.split_whitespace().count() <= 8 && !title.contains('"'), "{title}");
        }
    }

    #[test]
    fn titles_are_one_clean_line() {
        assert_eq!(session_title("\"PVC stuck in Pending.\"\n").as_deref(), Some("PVC stuck in Pending"));
        assert_eq!(session_title("\n**Title:** Node drain blocked\nmore").as_deref(), Some("Node drain blocked"));
        assert_eq!(session_title("  \n "), None);
        let long = session_title(&"word ".repeat(30)).unwrap();
        assert!(long.ends_with('…') && long.chars().count() <= 61, "{long}");
    }
    use crate::lab::exam::QuestionView;
    use crate::lab::model::Solution;

    fn subject(solution: Option<Solution>) -> CoachSubject {
        CoachSubject {
            attempt_id: "a".into(),
            certification: "Certified Kubernetes Administrator".into(),
            kubernetes: "1.35".into(),
            domain: Some("storage".into()),
            docs: vec!["https://kubernetes.io/docs/".into()],
            review: false,
            solution,
            cluster: "k8s".into(),
            jumphost: "j".into(),
            view: QuestionView {
                id: "q1".into(),
                title: "PVC and Pod".into(),
                cluster: "k8s".into(),
                host: "k8s".into(),
                namespace: Some("storage-task".into()),
                tags: vec![],
                weight: 5.0,
                statement: "Create a PVC named `data-pvc`.".into(),
                hints: vec!["storageClassName".into()],
                references: vec![],
            },
        }
    }

    #[test]
    fn the_prompt_has_the_task_checks_and_conversation_but_no_unopened_solution() {
        let hidden = subject(None);
        let checks = [CheckResult { name: "PVC bound".into(), weight: 2, passed: false, detail: "Pending".into() }];
        let history = [
            CoachMessage { role: Role::User, text: "hint?".into() },
            CoachMessage { role: Role::Assistant, text: "Look at the class.".into() },
        ];
        let p = prompt(&hidden, &checks, Some("pvc/data-pvc Pending"), &history, "why?");
        for part in ["`ssh k8s`", "`storage-task`", "data-pvc", "FAIL PVC bound (Pending)", "pvc/data-pvc Pending", "**Coach:** Look at the class.", "why?"] {
            assert!(p.contains(part), "missing {part}:\n{p}");
        }
        assert!(!p.contains("Reference answer"));
        let opened = subject(Some(Solution { explain: "Use standard.".into(), run: "kubectl apply -f pvc.yaml".into() }));
        assert!(prompt(&opened, &[], None, &[], "show me").contains("kubectl apply -f pvc.yaml"));
        assert!(system(&hidden).contains("- https://kubernetes.io/docs/") && system(&hidden).contains("Teach, do not solve"));
        let review = CoachSubject { review: true, ..subject(None) };
        assert!(system(&review).contains("the exam is over"));
    }

    /// The real model through Claude Code, on a canned task: it streams and
    /// answers the way the coach should (needs `claude`, signed in)
    #[tokio::test]
    #[ignore]
    async fn claude_coaches_a_failing_check() {
        let subject = subject(None);
        let checks = [CheckResult { name: "PVC data-pvc is Bound".into(), weight: 2, passed: false, detail: "phase is Pending".into() }];
        let snapshot = "NAME                             STATUS    VOLUME   CAPACITY   STORAGECLASS\npersistentvolumeclaim/data-pvc   Pending                       standrad\n# events\nWarning ProvisioningFailed persistentvolumeclaim/data-pvc storageclass.storage.k8s.io \"standrad\" not found";
        let prompt = prompt(&subject, &checks, Some(snapshot), &[], "Why do my checks fail? Point me to the cause, not the full solution.");
        let chunks = std::sync::atomic::AtomicUsize::new(0);
        let agent = Agent::new();
        let answer = agent
            .ask_once(&system(&subject), &prompt, DEFAULT_MODEL, &CancellationToken::new(), &|_| {
                chunks.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })
            .await
            .unwrap();
        println!("--- {} chunks ---\n{answer}", chunks.into_inner());
        assert!(answer.to_lowercase().contains("standrad") || answer.to_lowercase().contains("storageclass"));
    }

    #[test]
    fn the_study_plan_prompt_has_the_scores_per_domain_and_what_to_practise() {
        use crate::lab::exam::{StudyStats, insights::DomainStat};
        let subject = StudySubject {
            stats: StudyStats {
                certification: "cka".into(),
                title: "Certified Kubernetes Administrator".into(),
                scores: vec![48.0, 61.0],
                domains: vec![
                    DomainStat { domain: "troubleshooting".into(), weight: 30, points: 3, max_points: 10, questions: 2 },
                    DomainStat { domain: "storage".into(), weight: 10, points: 0, max_points: 0, questions: 0 },
                ],
            },
            kubernetes: "1.35".into(),
            docs: vec!["https://kubernetes.io/docs/".into()],
            practice: [("storage".to_string(), vec!["PVC and Pod".to_string()])].into(),
            exams: vec!["CKA Practice Exam 1".into()],
        };
        let p = study_prompt(&subject);
        for part in ["48%, 61%", "| troubleshooting | 30% | 30% | 2 |", "| storage | 10% | not tested yet | 0 |", "- storage: PVC and Pod", "CKA Practice Exam 1"] {
            assert!(p.contains(part), "missing {part}:\n{p}");
        }
        assert!(study_system(&subject).contains("- https://kubernetes.io/docs/"));
    }

    /// The real model writes a study plan from canned results (needs `claude`)
    #[tokio::test]
    #[ignore]
    async fn claude_writes_a_study_plan() {
        use crate::lab::exam::{StudyStats, insights::DomainStat};
        let d = |domain: &str, weight, points, max_points, questions| DomainStat { domain: domain.into(), weight, points, max_points, questions };
        let subject = StudySubject {
            stats: StudyStats {
                certification: "cka".into(),
                title: "Certified Kubernetes Administrator".into(),
                scores: vec![48.0, 61.0],
                domains: vec![d("troubleshooting", 30, 3, 10, 2), d("cluster-architecture", 25, 9, 12, 3), d("services-networking", 20, 5, 10, 2), d("storage", 10, 0, 0, 0)],
            },
            kubernetes: "1.35".into(),
            docs: vec!["https://kubernetes.io/docs/".into(), "https://helm.sh/docs/".into()],
            practice: [("troubleshooting".to_string(), vec!["Fix a crashing Deployment".to_string()]), ("storage".to_string(), vec!["PVC and Pod".to_string()])].into(),
            exams: vec!["CKA Practice Exam 1".into()],
        };
        let agent = Agent::new();
        let plan = agent.ask_once(&study_system(&subject), &study_prompt(&subject), DEFAULT_MODEL, &CancellationToken::new(), &|_| {}).await.unwrap();
        println!("{plan}");
        assert!(plan.to_lowercase().contains("troubleshooting"));
    }

    #[test]
    fn a_later_turn_sends_only_what_changed() {
        assert_eq!(followup(&[], None, "why?"), "why?");
        let checks = [CheckResult { name: "PVC bound".into(), weight: 2, passed: true, detail: String::new() }];
        let p = followup(&checks, Some("pvc Bound"), "and now?");
        assert!(p.contains("- PASS PVC bound") && p.contains("pvc Bound") && p.ends_with("# The candidate asks\nand now?"), "{p}");
    }

    #[test]
    fn long_history_and_snapshots_are_cut_and_say_so() {
        let msg = |n: usize| CoachMessage { role: Role::User, text: "x".repeat(n) };
        let history = [msg(10), msg(10), msg(10)];
        assert_eq!(recent(&history, 25).len(), 2);
        assert!(truncate(&"y".repeat(50), 20).ends_with("(truncated: 30 more characters not shown)"));
        assert_eq!(shell_word("storage-task; rm -rf /"), "storage-taskrm-rf");
    }
}
