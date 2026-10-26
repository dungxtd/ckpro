//! Tauri commands: thin wrappers over the runtime, cluster, lab and terminal
//! modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::{kind::Kind, lifecycle};
use crate::runtime::infra::Infra;
use crate::runtime::jumphost::{Jumphost, app_placement};
use crate::error::{AppError, AppResult};
use crate::runtime::activity::Activities;
use crate::store::{Progress, Settings, Store};
use crate::lab::script::ScriptResult;
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

/// Run a lab script on the jumphost.
#[tauri::command]
#[specta::specta]
pub async fn run_script(jumphost: State<'_, Arc<Jumphost>>, path: String) -> AppResult<ScriptResult> {
    crate::lab::script::run(&jumphost.name, &path).await
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
pub async fn desktop_reset() -> AppResult<()> {
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

use crate::ai::{Coach, CoachEvent, CoachStatus};
use crate::store::CoachMessage;

/// Whether the coach can run (Claude Code installed).
#[tauri::command]
#[specta::specta]
pub fn coach_status() -> CoachStatus {
    Coach::status()
}

/// The question's coach conversation in the current attempt.
#[tauri::command]
#[specta::specta]
pub fn coach_history(
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
) -> AppResult<Vec<CoachMessage>> {
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
    events: Channel<CoachEvent>,
) -> AppResult<String> {
    coach
        .ask(&exams, &store, &question_id, &text, &checks, solution_opened, |e| {
            let _ = events.send(e);
        })
        .await
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
pub async fn start_exam(exams: State<'_, Arc<Exams>>, id: String, mode: Mode, replace: bool) -> AppResult<()> {
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
