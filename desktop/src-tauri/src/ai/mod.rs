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
mod prompt;

use crate::sync::MutexExt;
use crate::error::{AppError, AppResult};
use crate::lab::checks::CheckResult;
use crate::lab::exam::{CoachSubject, Exams};
use crate::store::{CoachMessage, Role, Store};
use agent::{Agent, ContextUsage};
use prompt::{followup, prompt, session_title, snapshot, system, AGENT, TITLE_SYSTEM};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// The coach's default model when the agent offers it (quick answers); the
/// candidate picks among what the agent lists (`Coach::models`)
pub const DEFAULT_MODEL: &str = "sonnet";
/// Writing a question that has to pass on a cluster needs the most capable one
const GENERATOR_MODEL: &str = "opus";
/// Names a session from its first question: the quick model, and how
const TITLE_MODEL: &str = "haiku";


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
    /// Which of the question's sessions (0 is its first)
    pub session: u32,
    /// Its own name, else its first question
    pub title: String,
    pub messages: u32,
}

/// A question's coach session: its own name (if renamed) and its messages
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachHistory {
    pub session: u32,
    pub title: Option<String>,
    pub messages: Vec<CoachMessage>,
}

/// A finished attempt's session, read back in History
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachTranscript {
    pub question_id: String,
    pub session: u32,
    pub title: String,
    pub messages: Vec<CoachMessage>,
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
    /// Permission requests waiting for the candidate, by id: the options
    /// offered, and where the answer goes
    permissions: Mutex<HashMap<u32, Waiting>>,
    /// The Claude login being run, if any
    signing_in: tokio::sync::Mutex<Option<account::SigningIn>>,
    /// Answers and generations under way: the adapter is not stopped meanwhile
    active: std::sync::atomic::AtomicUsize,
    /// Something was asked since the adapter started: it stays up longer
    asked: std::sync::atomic::AtomicBool,
    /// A generated question waiting for the candidate's review: where the
    /// answer goes
    reviewing: Mutex<Option<tokio::sync::oneshot::Sender<bool>>>,
    /// The login as last read, and when: reading it starts the adapter
    account: Mutex<Option<(account::Account, std::time::Instant)>>,
}

/// A permission request waiting for the candidate: the option ids offered,
/// and where the answer goes
type Waiting = (Vec<String>, tokio::sync::oneshot::Sender<serde_json::Value>);

/// How long the agent's adapter runs unused before it is stopped: started
/// only for the models or the login, and once something was asked
const ADAPTER_IDLE: std::time::Duration = std::time::Duration::from_secs(60);
const ADAPTER_IDLE_ASKED: std::time::Duration = std::time::Duration::from_secs(600);

struct Busy<'a>(&'a std::sync::atomic::AtomicUsize);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

/// How long a login read stays good (a sign-out in a terminal shows after it)
const ACCOUNT_FRESH: std::time::Duration = std::time::Duration::from_secs(60);

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
            account: Default::default(),
            reviewing: Default::default(),
            active: Default::default(),
            asked: Default::default(),
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

    /// Who the assistant answers as
    pub async fn account(&self) -> AppResult<account::Account> {
        if let Some((account, read)) = self.account.locked().clone()
            && read.elapsed() < ACCOUNT_FRESH
        {
            return Ok(account);
        }
        let account = account::account(&self.agent).await?;
        *self.account.locked() = Some((account.clone(), std::time::Instant::now()));
        Ok(account)
    }

    /// The login may have changed: read it again next time
    fn forget_account(&self) {
        self.account.locked().take();
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
        self.forget_account();
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
        self.forget_account();
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
        if self.apply(settings) {
            self.agent.restart().await;
            self.open.lock().await.clear();
        }
    }

    /// Take the settings without restarting anything (the app starts, no
    /// adapter runs yet); whether the CLI changed
    pub fn apply(&self, settings: &policy::AgentSettings) -> bool {
        let on = settings.enabled.contains(&policy::Provider::Claude);
        self.enabled.store(on, std::sync::atomic::Ordering::SeqCst);
        let changed = self.agent.configure(settings);
        if changed {
            self.forget_account();
        }
        changed
    }

    /// What this Mac offers the assistant (Settings)
    pub async fn runtime(&self) -> agent::RuntimeInfo {
        self.agent.info().await
    }


    pub fn history(exams: &Exams, store: &Store, question_id: &str) -> AppResult<CoachHistory> {
        let subject = exams.coach_subject(question_id, false)?;
        let (session, messages) = store.coach_messages(&subject.attempt_id, question_id)?;
        Ok(CoachHistory { session: session as u32, title: store.coach_session_title(&subject.attempt_id, question_id)?, messages })
    }

    /// A new session for the question; the earlier ones stay in History
    pub async fn new_session(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.new_coach_session(&subject.attempt_id, question_id).map(|_| ())
    }

    /// Go back to an earlier session of the question
    pub async fn open_session(&self, exams: &Exams, store: &Store, question_id: &str, session: u32) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.open_coach_session(&subject.attempt_id, question_id, i64::from(session))
    }

    /// The agent's conversation for the question ends: the next question
    /// starts one from the session the pane shows
    async fn forget_session(&self, attempt_id: &str, question_id: &str) {
        if let Some((session, ..)) = self.open.lock().await.remove(&(attempt_id.to_string(), question_id.to_string())) {
            self.agent.close(&session).await;
        }
    }

    /// The attempts that have sessions
    pub fn coached_attempts(store: &Store) -> AppResult<Vec<String>> {
        store.coached_attempts()
    }

    /// Every session of a past attempt, to read back (History)
    pub fn transcripts(store: &Store, attempt_id: &str) -> AppResult<Vec<CoachTranscript>> {
        Ok(store
            .coach_transcripts(attempt_id)?
            .into_iter()
            .map(|(question_id, session, title, messages)| CoachTranscript { question_id, session: session as u32, title, messages })
            .collect())
    }

    /// The attempt's coach sessions, one per question asked about
    pub fn sessions(exams: &Exams, store: &Store) -> AppResult<Vec<CoachSession>> {
        let Some(attempt) = exams.coach_attempt() else { return Ok(Vec::new()) };
        Ok(store
            .coach_sessions(&attempt)?
            .into_iter()
            .map(|(question_id, session, title, messages)| CoachSession { question_id, session: session as u32, title, messages })
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
        let _busy = self.busy();
        let subject = exams.coach_subject(question_id, solution_opened)?;
        // Commands only while practising: never in review (the environment
        // is graded) and never in an exam (coach_subject refuses it anyway)
        let profile = if subject.review { Profile::Ask } else { profile };
        let cancel = self.start();
        // What the candidate shares with Claude (Settings > AI > Privacy)
        let shared = policy::AgentSettings::load(store).unwrap_or_default();
        let checks = if context.checks && shared.share_checks { checks } else { &[] };
        let snapshot = if context.cluster && shared.share_cluster { snapshot(&subject).await } else { None };
        let key = (subject.attempt_id.clone(), question_id.to_string());
        let (session, prompt) =
            self.session_for(store, &subject, question_id, profile, model, effort, checks, snapshot.as_deref(), text).await?;
        // The first question names the session, while
        // the answer is written: a quick model, nothing waits longer for it
        let settings = policy::AgentSettings::load(store).unwrap_or_default();
        let first = settings.auto_titles
            && store.coach_messages(&subject.attempt_id, question_id)?.1.is_empty()
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
            transcript.locked().push_str(t);
            on_event(CoachEvent::Text { text: t.to_string() });
        };
        let asked = Mutex::new(Vec::new());
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
                if let Some(id) = self.ask_permission(&settings, &params, reply, &on_event) {
                    asked.locked().push(id);
                }
            }
        };
        let (answer, title) = tokio::join!(self.agent.prompt_with(&session, &prompt, &cancel, &stream), naming);
        // Its requests left unanswered (stopped, failed) are cancelled with
        // it; a newer answer's stay
        let asked = asked.into_inner().unwrap_or_else(|p| p.into_inner());
        self.permissions.locked().retain(|id, _| !asked.contains(id));
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
                if matches!(e, AppError::SignInRequired { .. }) {
                    self.forget_account();
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

    /// The agent's session for the question, and what to send it: the one
    /// open (only what changed since), or a new one (the task and what was
    /// said before). Another profile is another session (other tools)
    #[allow(clippy::too_many_arguments)]
    async fn session_for(
        &self,
        store: &Store,
        subject: &CoachSubject,
        question_id: &str,
        profile: Profile,
        model: &str,
        effort: &str,
        checks: &[CheckResult],
        snapshot: Option<&str>,
        text: &str,
    ) -> AppResult<(String, String)> {
        let key = (subject.attempt_id.clone(), question_id.to_string());
        let opened = match self.open.lock().await.get(&key).cloned() {
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
                (session, followup(checks, snapshot, text))
            }
            None => {
                let session = match profile {
                    Profile::Ask => self.agent.new_session(&system(subject), model).await?,
                    Profile::Agent => {
                        let system = format!("{}\n{AGENT}", system(subject));
                        let tools = self.tools.get().ok_or_else(|| AppError::assistant("the agent's tools are not ready yet; try again"))?;
                        self.agent.new_session_with(&system, model, serde_json::json!([tools.server_for(question_id)])).await?
                    }
                };
                self.agent.set_effort(&session, model, effort).await?;
                let (_, history) = store.coach_messages(&subject.attempt_id, question_id)?;
                (session, prompt(subject, checks, snapshot, &history, text))
            }
        };
        self.open.lock().await.insert(key, (session.clone(), model.to_string(), effort.to_string(), profile));
        Ok((session, prompt))
    }

    /// The agent asks to run a command: allowed at once when Tool access says
    /// so, else shown to the candidate (its id, to answer with `permit`)
    fn ask_permission(
        &self,
        settings: &policy::AgentSettings,
        params: &serde_json::Value,
        reply: tokio::sync::oneshot::Sender<serde_json::Value>,
        on_event: &impl Fn(CoachEvent),
    ) -> Option<u32> {
        let command = params["toolCall"]["rawInput"]["command"]
            .as_str()
            .or(params["toolCall"]["title"].as_str())
            .unwrap_or("a tool")
            .to_string();
        let once = params["options"].as_array().into_iter().flatten().find(|o| o["kind"] == "allow_once");
        if let Some(once) = once.filter(|_| settings.runs_unasked(&command)) {
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
        on_event(CoachEvent::Permission { id, command, options });
        Some(id)
    }

    /// Delete the question's session shown (the panel's Delete Session)
    pub async fn clear(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.clear_coach_messages(&subject.attempt_id, question_id)
    }

    /// Generate a question and prove it; stopped by `cancel` while the model writes
    pub async fn generate(
        &self,
        exams: &Exams,
        infra: &crate::runtime::infra::Infra,
        activities: &std::sync::Arc<crate::runtime::activity::Activities>,
        data_dir: &std::path::Path,
        request: &generate::GenerateRequest,
        on_draft: impl Fn(generate::Draft),
    ) -> AppResult<generate::Generated> {
        if exams.exam_in_progress() {
            return Err(AppError::invalid("the coach is not available during an exam"));
        }
        self.require_enabled()?;
        let _busy = self.busy();
        let bank = exams.bank();
        let cancel = self.start();
        // Each draft waits for the candidate's answer (`review`)
        let review = |draft: generate::Draft| {
            let (answer, answered) = tokio::sync::oneshot::channel();
            *self.reviewing.locked() = Some(answer);
            on_draft(draft);
            answered
        };
        let generated =
            generate::generate(&self.agent, GENERATOR_MODEL, &bank, infra, activities, data_dir, request, &cancel, review).await;
        self.reviewing.locked().take();
        let generated = generated?;
        // The catalog shows it from now on
        match crate::lab::load::load(&bank.root).0 {
            Some(core) => exams.replace_pack(crate::lab::mine::merged(core, data_dir)),
            None => tracing::warn!("could not reload the bundled pack: the new question shows after a restart"),
        }
        Ok(generated)
    }

    /// The candidate read the generated draft: let its scripts run, or not
    pub fn review(&self, approve: bool) -> AppResult<()> {
        let answer = self
            .reviewing
            .locked()
            .take()
            .ok_or_else(|| AppError::not_found("no generated question is waiting for review"))?;
        let _ = answer.send(approve);
        Ok(())
    }

    /// Stop the adapter once unused for a while (nothing being answered or
    /// generated): soon when it only listed models or the login, later once
    /// a question was asked. The agent's sessions go with it; the next
    /// question opens one again from what was said
    pub async fn stop_if_idle(&self) {
        use std::sync::atomic::Ordering::SeqCst;
        if self.active.load(SeqCst) > 0 {
            return;
        }
        let idle = if self.asked.load(SeqCst) { ADAPTER_IDLE_ASKED } else { ADAPTER_IDLE };
        if self.agent.stop_if_idle(idle).await {
            self.asked.store(false, SeqCst);
            self.open.lock().await.clear();
            tracing::info!(?idle, "stopped the unused agent adapter");
        }
    }

    /// Counts an answer or generation under way while it lives
    fn busy(&self) -> Busy<'_> {
        self.asked.store(true, std::sync::atomic::Ordering::SeqCst);
        self.active.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Busy(&self.active)
    }

    /// A new answer stops the one being written
    fn start(&self) -> CancellationToken {
        let cancel = CancellationToken::new();
        if let Some(previous) = self.running.locked().replace(cancel.clone()) {
            previous.cancel();
        }
        cancel
    }

    pub fn cancel(&self) {
        if let Some(token) = self.running.locked().take() {
            token.cancel();
        }
    }

    /// Another attempt starts or this one ends: the answer being written
    /// stops and the agent forgets the attempt's conversations (the app keeps
    /// them); an exam-mode attempt then starts with nothing from before
    pub async fn end_attempt(&self) {
        self.cancel();
        let open: Vec<String> = self.open.lock().await.drain().map(|(_, (session, ..))| session).collect();
        for session in open {
            self.agent.close(&session).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::prompt::*;

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
