//! Tauri commands: thin wrappers over the runtime, cluster, lab and terminal
//! modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::{kind::Kind, lifecycle};
use crate::runtime::infra::Infra;
use crate::runtime::jumphost::{Jumphost, app_placement};
use crate::error::{AppError, AppResult};
use crate::runtime::activity::Activities;
use crate::store::{Progress, Settings, Store};
use crate::runtime::model::{DockerState, Env, EnvState};
use crate::runtime::preflight::{self, Check};
use crate::terminal::{TerminalEvent, Terminals};
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

/// What creating a cluster with `workers` workers needs, and whether it is there.
#[tauri::command]
#[specta::specta]
pub fn preflight(env: State<'_, Arc<Env>>, name: String, workers: u8) -> Vec<Check> {
    preflight::check(&env.snapshot(), &name, workers)
}

/// Create a cluster, streaming kind's output lines to `log`. Cancelling
/// (`cancel_cluster`) stops kind and removes whatever it had created.
#[tauri::command]
#[specta::specta]
pub async fn create_cluster(
    kind: State<'_, Arc<Kind>>,
    infra: State<'_, Arc<Infra>>,
    jumphost: State<'_, Arc<Jumphost>>,
    jobs: State<'_, Jobs>,
    env: State<'_, Arc<Env>>,
    activities: State<'_, Arc<Activities>>,
    name: String,
    workers: u8,
    log: Channel<String>,
) -> AppResult<()> {
    let state = env.snapshot();
    if !matches!(state.docker, DockerState::Up { .. }) {
        return Err(AppError::DockerUnavailable { message: "Docker is not running".into() });
    }
    // kind would fail late with "node(s) already exist"; say why up front
    if let Some(check) = preflight::check(&state, &name, workers).into_iter().find(|c| c.name == "Name" && !c.ok) {
        return Err(AppError::invalid(check.detail));
    }
    let token = jobs.begin(&name)?;
    let plural = if workers == 1 { "" } else { "s" };
    let op = activities.begin(
        format!("Creating cluster {name}"),
        vec![format!("Creating cluster {name}: 1 control plane, {workers} worker{plural}"), "Updating the task host".into()],
    );
    let send = |line: String| {
        op.log(line.clone());
        let _ = log.send(line);
    };
    let result = async {
        lifecycle::create(&kind, &infra, &name, workers, &send, &token).await?;
        op.step(1, None);
        let docker = crate::runtime::docker::connect().await?;
        jumphost.ensure(&docker, &send).await?;
        jumphost.refresh_access(&docker, &kind, &app_placement(&kind)).await
    }
    .await;
    jobs.end(&name);
    env.request_resync();
    op.end(result)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(
    kind: State<'_, Arc<Kind>>,
    jumphost: State<'_, Arc<Jumphost>>,
    jobs: State<'_, Jobs>,
    activities: State<'_, Arc<Activities>>,
    name: String,
    log: Channel<String>,
) -> AppResult<()> {
    jobs.begin(&name)?;
    let op = activities.begin(
        format!("Removing cluster {name}"),
        vec![format!("Removing cluster {name}"), "Updating the task host".into()],
    );
    let send = |line: String| {
        op.log(line.clone());
        let _ = log.send(line);
    };
    let result = async {
        lifecycle::delete(&kind, &name, &send).await?;
        op.step(1, None);
        jumphost.refresh_access(&crate::runtime::docker::connect().await?, &kind, &app_placement(&kind)).await
    }
    .await;
    jobs.end(&name);
    op.end(result)
}

/// Cancel the operation running on a cluster; false when there is none.
#[tauri::command]
#[specta::specta]
pub fn cancel_cluster(jobs: State<'_, Jobs>, name: String) -> bool {
    jobs.cancel(&name)
}

/// Manage an existing kind cluster created outside ckdry.
#[tauri::command]
#[specta::specta]
pub async fn adopt_cluster(
    kind: State<'_, Arc<Kind>>,
    infra: State<'_, Arc<Infra>>,
    jumphost: State<'_, Arc<Jumphost>>,
    env: State<'_, Arc<Env>>,
    activities: State<'_, Arc<Activities>>,
    name: String,
) -> AppResult<()> {
    let op = activities.begin(
        format!("Taking over cluster {name}"),
        vec![format!("Taking over cluster {name}"), "Updating the task host".into()],
    );
    let log = |line: String| op.log(line);
    let result = async {
        lifecycle::adopt(&kind, &infra, &name, &log).await?;
        op.step(1, None);
        let docker = crate::runtime::docker::connect().await?;
        jumphost.ensure(&docker, &log).await?;
        jumphost.refresh_access(&docker, &kind, &app_placement(&kind)).await
    }
    .await;
    env.request_resync();
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

/// Shell on the jumphost (no `container`) or directly on a cluster node.
#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    terminals: State<'_, Terminals>,
    jumphost: State<'_, Arc<Jumphost>>,
    container: Option<String>,
    events: Channel<TerminalEvent>,
) -> AppResult<String> {
    let container = container.unwrap_or_else(|| jumphost.name.clone());
    terminals.open(&container, vec!["TERM=xterm-256color".into()], events).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_write(terminals: State<'_, Terminals>, id: String, data: String) -> AppResult<()> {
    terminals.write(&id, &data).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_resize(
    terminals: State<'_, Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    terminals.resize(&id, cols, rows).await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_close(terminals: State<'_, Terminals>, id: String) -> AppResult<()> {
    terminals.close(&id).await;
    Ok(())
}

// --- exams -----------------------------------------------------------------

use crate::lab::checks::CheckResult;
use crate::lab::exam::{ExamState, ExamSummary, Exams, HistoryEntry, Mode};
use crate::lab::model::Solution;

#[tauri::command]
#[specta::specta]
pub fn list_exams(exams: State<'_, Arc<Exams>>) -> Vec<ExamSummary> {
    exams.catalog()
}

/// Restart the exam desktop (its windows close; the client reconnects).
#[tauri::command]
#[specta::specta]
pub async fn desktop_reset(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
    // ckdry's own restart: the guard does not report it
    exams.expect_restart(crate::runtime::desktop::NAME);
    crate::runtime::desktop::reset(&crate::runtime::docker::connect().await?, crate::runtime::desktop::NAME).await
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
use crate::ai::agent::ModelOption;
use crate::ai::policy::AgentSettings;
use crate::ai::{Coach, CoachContext, CoachModels, ModelChoice, CoachEvent, CoachReply, CoachHistory, CoachSession, CoachStatus};
use crate::ai::generate::{self, GenerateRequest, Generated, GeneratorTarget};
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
    Ok(store.agent_settings()?.normalized())
}

#[tauri::command]
#[specta::specta]
pub fn save_agent_settings(store: State<'_, Arc<Store>>, settings: AgentSettings) -> AppResult<AgentSettings> {
    let settings = settings.normalized();
    store.save_agent_settings(&settings)?;
    Ok(settings)
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

/// Start a question's coach session over (New Session).
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
pub async fn coach_efforts(coach: State<'_, Coach>, model: String) -> AppResult<Vec<ModelOption>> {
    coach.efforts(&model).await
}

/// The models the coach can use, as the agent lists them for this login.
#[tauri::command]
#[specta::specta]
pub async fn coach_models(coach: State<'_, Coach>) -> AppResult<CoachModels> {
    coach.models().await
}

/// How the candidate did per curriculum domain, per certification attempted.
#[tauri::command]
#[specta::specta]
pub fn study_stats(exams: State<'_, Arc<Exams>>) -> Vec<StudyStats> {
    exams.study_stats()
}

/// Ask the coach for a study plan from the history (not during an exam); it
/// streams on `events` and resolves to the whole plan.
#[tauri::command]
#[specta::specta]
pub async fn coach_study_plan(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    certification: String,
    events: Channel<CoachEvent>,
) -> AppResult<String> {
    coach
        .study_plan(&exams, &store, &certification, |e| {
            let _ = events.send(e);
        })
        .await
}

/// The latest study plan for a certification, if any.
#[tauri::command]
#[specta::specta]
pub fn study_plan_last(store: State<'_, Arc<Store>>, certification: String) -> AppResult<Option<String>> {
    Coach::last_study_plan(&store, &certification)
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

/// What the question generator can write for.
#[tauri::command]
#[specta::specta]
pub fn generator_targets(exams: State<'_, Arc<Exams>>) -> Vec<GeneratorTarget> {
    generate::targets(&exams.bank())
}

/// Generate a question, prove it on a cluster and keep it in "My questions"
/// (progress as an activity). Not during an exam.
#[tauri::command]
#[specta::specta]
pub async fn generate_question(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    infra: State<'_, Arc<Infra>>,
    activities: State<'_, Arc<Activities>>,
    request: GenerateRequest,
) -> AppResult<Generated> {
    coach.generate(&exams, &infra, &activities, &crate::data_dir(), &request).await
}

/// The Claude login the assistant answers as.
#[tauri::command]
#[specta::specta]
pub async fn coach_account(coach: State<'_, Coach>) -> AppResult<Account> {
    coach.account().await
}

/// Sign in to Claude with the CLI's login; what it prints streams on
/// `events` (the sign-in link, a prompt for the browser's code).
#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in(coach: State<'_, Coach>, method: SignInMethod, events: Channel<SignInEvent>) -> AppResult<()> {
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
    id: String,
    mode: Mode,
    replace: bool,
) -> AppResult<()> {
    // Before anything is created: this machine can run it
    if let Some(summary) = exams.catalog().into_iter().find(|e| e.id == id) {
        preflight::exam_fits(&env.snapshot(), summary.minimum_mb, &summary.clusters).map_err(AppError::invalid)?;
    }
    exams.inner().start(&id, mode, replace).await
}

#[tauri::command]
#[specta::specta]
pub fn submit_exam(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
    exams.inner().submit()
}

/// Cancel preparation, or close the attempt and delete its clusters.
#[tauri::command]
#[specta::specta]
pub async fn end_exam(exams: State<'_, Arc<Exams>>) -> AppResult<()> {
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

