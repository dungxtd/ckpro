//! Tauri commands: thin wrappers over the runtime, cluster, lab and
//! assistant modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::{kind::Kind, lifecycle};
use crate::runtime::infra::Infra;
use crate::runtime::jumphost::{Jumphost, app_placement};
use crate::error::{AppError, AppResult};
use crate::runtime::activity::Activities;
use crate::store::{Progress, Settings, Store};
use crate::runtime::model::{Env, EnvState};
use crate::runtime::preflight;
use crate::studio::proof::{Proof, ProofPlan, Proofs, Scope};
use std::sync::Arc;
use tauri::State;
use tauri::ipc::Channel;

/// Current environment; later changes arrive as `EnvChanged` events.
#[tauri::command]
#[specta::specta]
pub fn env_state(env: State<'_, Arc<Env>>) -> EnvState {
    env.snapshot()
}

/// Try Docker again now (Retry), not at the monitor's next backoff.
#[tauri::command]
#[specta::specta]
pub fn env_retry(env: State<'_, Arc<Env>>) {
    env.request_retry();
}

/// Show node readiness (the Environment page opens) or stop (it closes): the
/// clusters' Kubernetes node watches are kept open only meanwhile.
#[tauri::command]
#[specta::specta]
pub fn env_watch_nodes(env: State<'_, Arc<Env>>, on: bool) {
    env.set_watch_nodes(on);
}

#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(
    kind: State<'_, Arc<Kind>>,
    exams: State<'_, Arc<Exams>>,
    jumphost: State<'_, Arc<Jumphost>>,
    jobs: State<'_, Jobs>,
    activities: State<'_, Arc<Activities>>,
    name: String,
) -> AppResult<()> {
    if exams.uses_cluster(&name) {
        return Err(AppError::invalid(format!("an attempt runs on {name}: close it, and its clusters go with it")));
    }
    jobs.begin(&name)?;
    let op = activities.begin(
        format!("Removing cluster {name}"),
        vec![format!("Removing cluster {name}"), "Updating the task host".into()],
    );
    let send = |line: String| op.log(line);
    let result = async {
        lifecycle::delete(&kind, &name, &send).await?;
        op.step(1, None);
        jumphost.refresh_access(&crate::runtime::docker::connect().await?, &kind, &app_placement(&kind)).await
    }
    .await;
    jobs.end(&name);
    op.end(result)
}

/// Start a cluster's stopped nodes.
#[tauri::command]
#[specta::specta]
pub async fn repair_cluster(activities: State<'_, Arc<Activities>>, name: String) -> AppResult<()> {
    let op = activities.begin(format!("Starting cluster {name}"), vec![format!("Starting the stopped nodes of {name}")]);
    let result = async { crate::runtime::reconcile::repair(&crate::runtime::docker::connect().await?, &name).await }.await;
    op.end(result)
}

// --- exams -----------------------------------------------------------------

use crate::lab::checks::CheckResult;
use crate::lab::exam::plan::{ExamReadiness, PlanView};
use crate::lab::exam::{ExamState, ExamSummary, Exams, HistoryEntry, Mode};
use crate::lab::model::Solution;

#[tauri::command]
#[specta::specta]
pub fn list_exams(exams: State<'_, Arc<Exams>>) -> Vec<ExamSummary> {
    exams.catalog()
}

/// The plans from `from` to `to` (YYYY-MM-DD, both included); `offset_minutes`
/// east of UTC places attempts on the candidate's own days.
#[tauri::command]
#[specta::specta]
pub fn plans_between(
    exams: State<'_, Arc<Exams>>,
    from: String,
    to: String,
    offset_minutes: i32,
) -> AppResult<Vec<PlanView>> {
    exams.plans_between(&from, &to, offset_minutes)
}

/// Plan an exam on a day; returns the plan's id.
#[tauri::command]
#[specta::specta]
pub fn plan_add(exams: State<'_, Arc<Exams>>, day: String, exam_id: String, mode: Mode) -> AppResult<i32> {
    exams.plan_add(&day, &exam_id, mode)
}

/// Move a plan to another day, or take it the other way.
#[tauri::command]
#[specta::specta]
pub fn plan_update(exams: State<'_, Arc<Exams>>, id: i32, day: Option<String>, mode: Option<Mode>) -> AppResult<()> {
    exams.plan_update(id, day, mode)
}

/// Remove a plan.
#[tauri::command]
#[specta::specta]
pub fn plan_remove(exams: State<'_, Arc<Exams>>, id: i32) -> AppResult<()> {
    exams.plan_remove(id)
}

/// How ready the candidate is for a certification: per domain, and the
/// predicted score.
#[tauri::command]
#[specta::specta]
pub fn readiness(exams: State<'_, Arc<Exams>>, certification: String) -> AppResult<ExamReadiness> {
    exams.readiness(&certification, crate::runtime::activity::now_ms())
}

/// Delete one of the candidate's own exams (generated questions) and its questions.
#[tauri::command]
#[specta::specta]
pub fn delete_exam(exams: State<'_, Arc<Exams>>, id: String) -> AppResult<()> {
    exams.delete_exam(&id, &crate::data_dir())
}

/// Reset the exam desktop: a new one, every window closed; the client reconnects.
#[tauri::command]
#[specta::specta]
pub async fn desktop_reset(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
    exams.reset_desktop().await
}

/// Open allowed documentation in the exam desktop's Firefox.
#[tauri::command]
#[specta::specta]
pub async fn desktop_open_url(exams: State<'_, Arc<Exams>>, url: String) -> AppResult<()> {
    let docker = crate::runtime::docker::connect().await?;
    crate::runtime::desktop::open_url(&docker, crate::runtime::desktop::NAME, &url, &exams.attempt_docs()).await
}

// --- practice coach --------------------------------------------------------

use crate::ai::account::{Account, SignInEvent, SignInMethod};
use crate::ai::agent::{ModelOption, RuntimeInfo};
use crate::ai::policy::AgentSettings;
use crate::ai::{Coach, CoachContext, CoachModels, ModelChoice, CoachEvent, CoachReply, CoachHistory, CoachSession, CoachStatus, CoachTranscript};
use crate::lab::exam::StudyStats;

/// Whether the coach can run (Node.js for the adapter found).
#[tauri::command]
#[specta::specta]
pub fn coach_status(coach: State<'_, Coach>) -> CoachStatus {
    coach.status()
}

/// How far the assistant's agent may go on its own.
#[tauri::command]
#[specta::specta]
pub fn agent_settings(store: State<'_, Arc<Store>>) -> AppResult<AgentSettings> {
    Ok(crate::ai::policy::AgentSettings::load(&store)?.normalized())
}

#[tauri::command]
#[specta::specta]
pub async fn save_agent_settings(coach: State<'_, Coach>, store: State<'_, Arc<Store>>, settings: AgentSettings) -> AppResult<AgentSettings> {
    let settings = settings.normalized();
    settings.save(&store)?;
    coach.configure(&settings).await;
    Ok(settings)
}

/// What runs the assistant (this Mac's Claude CLI or Docker), and what this
/// Mac has.
#[tauri::command]
#[specta::specta]
pub async fn coach_runtime(coach: State<'_, Coach>) -> AppResult<RuntimeInfo> {
    Ok(coach.runtime().await)
}

/// Where the app keeps its data, and its version.
#[tauri::command]
#[specta::specta]
pub fn app_info() -> AppInfo {
    AppInfo { data_dir: crate::data_dir().display().to_string(), version: env!("CARGO_PKG_VERSION").into() }
}

#[derive(serde::Serialize, specta::Type)]
pub struct AppInfo {
    pub data_dir: String,
    pub version: String,
}

/// The question's coach session in the current attempt: its name and messages.
#[tauri::command]
#[specta::specta]
pub fn coach_history(
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
) -> AppResult<CoachHistory> {
    Coach::history(&exams, &store, &question_id)
}

/// Ask the coach about a question (practice mode, or after the result); the
/// answer streams on `events` and resolves to the whole answer.
#[tauri::command]
#[specta::specta]
pub async fn coach_ask(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
    text: String,
    checks: Vec<CheckResult>,
    solution_opened: bool,
    model: ModelChoice,
    context: CoachContext,
    events: Channel<CoachEvent>,
) -> AppResult<CoachReply> {
    coach
        .ask(&exams, &store, &question_id, &text, &checks, solution_opened, &model.model, &model.effort, model.profile, context, |e| {
            let _ = events.send(e);
        })
        .await
}

/// Delete the question's current coach session (Delete Session).
#[tauri::command]
#[specta::specta]
pub async fn coach_clear(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
) -> AppResult<()> {
    coach.clear(&exams, &store, &question_id).await
}

/// A new coach session for the question (New Session); the earlier ones stay.
#[tauri::command]
#[specta::specta]
pub async fn coach_new_session(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
) -> AppResult<()> {
    coach.new_session(&exams, &store, &question_id).await
}

/// Show an earlier coach session of the question (History).
#[tauri::command]
#[specta::specta]
pub async fn coach_open_session(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
    session: u32,
) -> AppResult<()> {
    coach.open_session(&exams, &store, &question_id, session).await
}

/// Every coach session of a past attempt, to read back.
#[tauri::command]
#[specta::specta]
pub fn coach_transcripts(store: State<'_, Arc<Store>>, attempt_id: String) -> AppResult<Vec<CoachTranscript>> {
    Coach::transcripts(&store, &attempt_id)
}

/// The past attempts that have coach sessions (History shows a way to them).
#[tauri::command]
#[specta::specta]
pub fn coached_attempts(store: State<'_, Arc<Store>>) -> AppResult<Vec<String>> {
    Coach::coached_attempts(&store)
}

/// The attempt's coach sessions (History).
#[tauri::command]
#[specta::specta]
pub fn coach_sessions(exams: State<'_, Arc<Exams>>, store: State<'_, Arc<Store>>) -> AppResult<Vec<CoachSession>> {
    Coach::sessions(&exams, &store)
}

/// Name a question's coach session (empty: back to its first question).
#[tauri::command]
#[specta::specta]
pub fn coach_rename(exams: State<'_, Arc<Exams>>, store: State<'_, Arc<Store>>, question_id: String, title: String) -> AppResult<()> {
    Coach::rename(&exams, &store, &question_id, &title)
}

/// The effort levels a model takes (none when it has no effort setting).
#[tauri::command]
#[specta::specta]
pub async fn coach_efforts(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, model: String) -> AppResult<Vec<ModelOption>> {
    no_exam(&exams)?;
    coach.efforts(&model).await
}

/// The models the coach can use, as the agent lists them for this login.
#[tauri::command]
#[specta::specta]
pub async fn coach_models(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<CoachModels> {
    no_exam(&exams)?;
    coach.models().await
}

/// How the candidate did per curriculum domain, per certification attempted.
#[tauri::command]
#[specta::specta]
pub fn study_stats(exams: State<'_, Arc<Exams>>) -> Vec<StudyStats> {
    exams.study_stats()
}

/// Open a web page in the system browser (https only): links outside the exam desktop.
#[tauri::command]
#[specta::specta]
pub fn open_in_browser(url: String) -> AppResult<()> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::invalid(format!("not a web page: {url}")));
    }
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(opener)
        .arg(&url)
        .spawn()
        .map_err(|e| AppError::io("opening the browser", e))?;
    Ok(())
}

/// The Claude login the assistant answers as.
#[tauri::command]
#[specta::specta]
pub async fn coach_account(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<Account> {
    no_exam(&exams)?;
    coach.account().await
}

/// Sign in to Claude with the CLI's login; what it prints streams on
/// `events` (the sign-in link, a prompt for the browser's code).
#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, method: SignInMethod, events: Channel<SignInEvent>) -> AppResult<()> {
    no_exam(&exams)?;
    coach
        .sign_in(method, |e| {
            let _ = events.send(e);
        })
        .await
}

/// Type a line into the running sign-in (the code the browser shows).
#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in_input(coach: State<'_, Coach>, line: String) -> AppResult<()> {
    coach.sign_in_input(&line).await
}

#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in_cancel(coach: State<'_, Coach>) -> AppResult<()> {
    coach.sign_in_cancel().await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn coach_sign_out(coach: State<'_, Coach>) -> AppResult<()> {
    coach.sign_out().await
}

/// Answer the assistant's request to run a command: one of its options
/// (allow once, always, reject…), or none to cancel.
#[tauri::command]
#[specta::specta]
pub fn coach_permit(coach: State<'_, Coach>, id: u32, option: Option<String>) -> AppResult<()> {
    coach.permit(id, option)
}

/// Stop the answer being written.
#[tauri::command]
#[specta::specta]
pub fn coach_cancel(coach: State<'_, Coach>) {
    coach.cancel();
}

/// Where the candidate is in an attempt (question, flags, hints opened).
#[tauri::command]
#[specta::specta]
pub fn exam_progress(store: State<'_, Arc<Store>>, attempt_id: String) -> AppResult<Progress> {
    store.progress(&attempt_id)
}

#[tauri::command]
#[specta::specta]
pub fn save_exam_progress(store: State<'_, Arc<Store>>, attempt_id: String, progress: Progress) -> AppResult<()> {
    store.save_progress(&attempt_id, &progress)
}

/// The exam desk's display settings (desktop zoom and resolution, text size).
#[tauri::command]
#[specta::specta]
pub fn settings(store: State<'_, Arc<Store>>) -> AppResult<Settings> {
    store.settings()
}

#[tauri::command]
#[specta::specta]
pub fn save_settings(store: State<'_, Arc<Store>>, settings: Settings) -> AppResult<()> {
    store.save_settings(&settings)
}

/// The last long operations, with their logs (later changes arrive as
/// `ActivityChanged` and `ActivityLog`).
#[tauri::command]
#[specta::specta]
pub fn activities(activities: State<'_, Arc<Activities>>) -> Vec<crate::runtime::activity::Activity> {
    activities.list()
}

/// How to connect to the exam desktop (VNC over a websocket on 127.0.0.1),
/// or nothing when no attempt has one.
#[tauri::command]
#[specta::specta]
pub async fn desktop_session() -> AppResult<Option<crate::runtime::desktop::DesktopSession>> {
    crate::runtime::desktop::session(&crate::runtime::docker::connect().await?, crate::runtime::desktop::NAME).await
}

/// Current attempt; later changes arrive as `ExamChanged` events.
#[tauri::command]
#[specta::specta]
pub fn exam_state(exams: State<'_, Arc<Exams>>) -> ExamState {
    exams.state()
}

/// Start preparing an attempt. `replace` deletes existing clusters with the
/// names the exam needs.
#[tauri::command]
#[specta::specta]
pub async fn start_exam(
    exams: State<'_, Arc<Exams>>,
    env: State<'_, Arc<Env>>,
    coach: State<'_, Coach>,
    id: String,
    mode: Mode,
    replace: bool,
) -> AppResult<()> {
// Before anything is created: this machine can run it
    if let Some(summary) = exams.catalog().into_iter().find(|e| e.id == id) {
        preflight::exam_fits(&env.snapshot(), summary.minimum_mb, &summary.clusters).map_err(AppError::invalid)?;
    }
    coach.end_attempt().await;
    exams.inner().start(&id, mode, replace).await
}

#[tauri::command]
#[specta::specta]
pub fn submit_exam(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
    exams.inner().submit()
}

/// Resume (or grade) again the attempt whose resume or grading failed.
#[tauri::command]
#[specta::specta]
pub fn retry_exam(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
    exams.inner().retry()
}

/// Cancel preparation, or close the attempt and delete its clusters.
#[tauri::command]
#[specta::specta]
pub async fn end_exam(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<()> {
    coach.end_attempt().await;
    exams.end().await
}

/// Practice mode: grade one question now.
#[tauri::command]
#[specta::specta]
pub async fn check_question(exams: State<'_, Arc<Exams>>, question_id: String) -> AppResult<Vec<CheckResult>> {
    exams.check_question(&question_id).await
}

/// Practice mode, or after the result.
#[tauri::command]
#[specta::specta]
pub fn question_solution(exams: State<'_, Arc<Exams>>, question_id: String) -> AppResult<Solution> {
    exams.solution(&question_id)
}

#[tauri::command]
#[specta::specta]
pub fn exam_history(exams: State<'_, Arc<Exams>>) -> Vec<HistoryEntry> {
    exams.history()
}

/// The assistant is off while an exam-mode attempt is under way: not even its
/// login or models are read then
fn no_exam(exams: &Exams) -> AppResult<()> {
    if exams.exam_in_progress() {
        return Err(AppError::invalid("the assistant is off during an exam"));
    }
    Ok(())
}

/// Send the core's errors to PostHog as the interface's person and session,
/// or stop (Settings > About).
#[tauri::command]
#[specta::specta]
pub fn telemetry_configure(on: bool, key: String, host: String, distinct_id: String, session_id: Option<String>) {
    crate::telemetry::configure(on, key, host, distinct_id, session_id);
}

/// A Create conversation, opened: its messages and draft exam
#[derive(Clone, Debug, serde::Serialize, specta::Type)]
pub struct StudioConversation {
    pub id: i32,
    pub messages: Vec<crate::store::StudioMessage>,
    pub draft: crate::studio::draft::ExamDraft,
}

/// The Create conversations, latest first
#[tauri::command]
#[specta::specta]
pub fn studio_sessions(store: State<'_, Arc<Store>>) -> AppResult<Vec<crate::store::StudioSessionRow>> {
    store.studio_sessions()
}

/// A new Create conversation
#[tauri::command]
#[specta::specta]
pub fn studio_new(store: State<'_, Arc<Store>>) -> AppResult<StudioConversation> {
    let id = store.studio_new()?;
    Ok(StudioConversation { id, messages: Vec::new(), draft: Default::default() })
}

/// A Create conversation, with its messages and draft
#[tauri::command]
#[specta::specta]
pub fn studio_open(store: State<'_, Arc<Store>>, session: i32) -> AppResult<StudioConversation> {
    Ok(StudioConversation { id: session, messages: store.studio_messages(session)?, draft: crate::studio::draft::ExamDraft::load(&store, session)? })
}

/// Say something in a Create conversation; the answer streams as it is
/// written (and Claude's tool uses), the draft's changes arrive as `StudioDraft`
#[tauri::command]
#[specta::specta]
pub async fn studio_ask(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    session: i32,
    text: String,
    model: ModelChoice,
    events: Channel<CoachEvent>,
) -> AppResult<CoachReply> {
    coach
        .studio_ask(&exams, &store, session, &text, &model.model, &model.effort, |e| {
            let _ = events.send(e);
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub fn studio_rename(store: State<'_, Arc<Store>>, session: i32, title: String) -> AppResult<()> {
    store.studio_rename(session, &title)
}

#[tauri::command]
#[specta::specta]
pub async fn studio_delete(coach: State<'_, Coach>, store: State<'_, Arc<Store>>, session: i32) -> AppResult<()> {
    coach.studio_forget(session).await;
    store.studio_delete(session)
}

/// Take a question out of the draft (by id, or a new one's key)
#[tauri::command]
#[specta::specta]
pub fn studio_remove(store: State<'_, Arc<Store>>, session: i32, id: String) -> AppResult<crate::studio::draft::ExamDraft> {
    let mut draft = crate::studio::draft::ExamDraft::load(&store, session)?;
    draft.remove(&id);
    draft.save(&store, session)?;
    Ok(draft)
}

/// The candidate's changes to the draft: its title, its length, or every
/// question out
#[tauri::command]
#[specta::specta]
pub fn studio_edit(
    store: State<'_, Arc<Store>>,
    session: i32,
    title: Option<String>,
    duration_minutes: Option<u32>,
    clear: bool,
) -> AppResult<crate::studio::draft::ExamDraft> {
    let mut draft = crate::studio::draft::ExamDraft::load(&store, session)?;
    draft.edit(title.as_deref(), duration_minutes, clear);
    draft.save(&store, session)?;
    Ok(draft)
}

/// What proving a conversation's exam takes (its cluster, the time), and
/// why it cannot run now if so
#[tauri::command]
#[specta::specta]
pub fn studio_plan(store: State<'_, Arc<Store>>, exams: State<'_, Arc<Exams>>, env: State<'_, Arc<Env>>, session: i32) -> AppResult<ProofPlan> {
    let fits = |mb| preflight::fits(&env.snapshot(), "Proving the exam", mb, &[]);
    crate::studio::plan(&store, &exams, &crate::data_dir(), session, fits)
}

/// Prove the draft exam on a cluster made for it, every question together
/// (`scope`: all, or those not proven), as the candidate's go: their scripts
/// run there. The draft with their results; where it is arrives as `StudioProof`
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn studio_verify(
    store: State<'_, Arc<Store>>,
    exams: State<'_, Arc<Exams>>,
    proofs: State<'_, Proofs>,
    activities: State<'_, Arc<Activities>>,
    infra: State<'_, Arc<Infra>>,
    env: State<'_, Arc<Env>>,
    session: i32,
    scope: Scope,
) -> AppResult<crate::studio::draft::ExamDraft> {
    no_exam(&exams)?;
    let fits = |mb| preflight::fits(&env.snapshot(), "Proving the exam", mb, &[]);
    let app = crate::studio::Proving {
        store: &store,
        exams: &exams,
        proofs: &proofs,
        activities: &activities,
        infra: infra.inner().clone(),
        data_dir: &crate::data_dir(),
    };
    crate::studio::verify(app, session, scope, fits).await
}

/// The exams being proven, by conversation
#[tauri::command]
#[specta::specta]
pub fn studio_proofs(proofs: State<'_, Proofs>) -> Vec<(i32, Proof)> {
    proofs.list()
}

/// Stop proving a conversation's exam (its cluster goes)
#[tauri::command]
#[specta::specta]
pub fn studio_stop_proof(proofs: State<'_, Proofs>, session: i32) {
    proofs.stop(session);
}

/// Stop the answer being written in a conversation
#[tauri::command]
#[specta::specta]
pub fn studio_stop(coach: State<'_, Coach>, session: i32) {
    coach.studio_stop(session);
}

/// Save the draft as the candidate's exam; its id
#[tauri::command]
#[specta::specta]
pub fn studio_save(store: State<'_, Arc<Store>>, exams: State<'_, Arc<Exams>>, session: i32) -> AppResult<String> {
    crate::studio::save(&store, &exams, &crate::data_dir(), session)
}
