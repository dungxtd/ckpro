//! Tauri commands: thin wrappers over the runtime, cluster, lab and
//! assistant modules. Every command is listed in `specta_builder()` in lib.rs.

use crate::cluster::jobs::Jobs;
use crate::cluster::{kind::Kind, lifecycle};
use crate::error::{AppError, AppResult};
use crate::runtime::activity::Activities;
use crate::runtime::infra::Infra;
use crate::runtime::jumphost::Jumphost;
use crate::runtime::model::{Env, EnvState};
use crate::runtime::preflight;
use crate::store::{Progress, Settings, Store};
use crate::studio::proof::{Proof, ProofPlan, Proofs, Scope};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

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

/// The candidate agrees to build the exam images here (the registry would
/// not give them): they are built now, and whenever needed after.
#[tauri::command]
#[specta::specta]
pub fn env_build_images(env: State<'_, Arc<Env>>, infra: State<'_, Arc<Infra>>) {
    infra.allow_building();
    env.request_retry();
}

/// Empty the image mirror's cache (the Environment page): refused while an
/// attempt or a proof runs, both of which pull through it.
#[tauri::command]
#[specta::specta]
pub async fn env_clear_cache(
    env: State<'_, Arc<Env>>,
    infra: State<'_, Arc<Infra>>,
    exams: State<'_, Arc<Exams>>,
    proofs: State<'_, Proofs>,
    activities: State<'_, Arc<Activities>>,
) -> AppResult<()> {
    if !matches!(exams.state(), ExamState::Idle) {
        return Err(AppError::busy("an attempt is open: close it first, its clusters pull through the cache"));
    }
    if proofs.list().iter().any(|(_, p)| p.ended_at.is_none()) {
        return Err(AppError::busy("an exam is being proven in Create: wait for it, or stop it"));
    }
    infra.clear_cache_shown(&env, &activities).await
}

/// Show node readiness (the Environment page opens) or stop (it closes): the
/// clusters' Kubernetes node watches are kept open only meanwhile.
#[tauri::command]
#[specta::specta]
pub fn env_watch_nodes(env: State<'_, Arc<Env>>, on: bool) {
    env.set_watch_nodes(on);
}

/// Remove a cluster (Environment): not one an attempt runs on.
#[tauri::command]
#[specta::specta]
pub async fn delete_cluster(
    kind: State<'_, Arc<Kind>>,
    exams: State<'_, Arc<Exams>>,
    jumphost: State<'_, Arc<Jumphost>>,
    jobs: State<'_, Arc<Jobs>>,
    activities: State<'_, Arc<Activities>>,
    name: String,
) -> AppResult<()> {
    if exams.uses_cluster(&name) {
        return Err(AppError::invalid(format!("an attempt runs on {name}: close it, and its clusters go with it")));
    }
    lifecycle::remove(&kind, &jumphost, &jobs, &activities, &name).await
}

/// Start a cluster's stopped nodes.
#[tauri::command]
#[specta::specta]
pub async fn repair_cluster(
    activities: State<'_, Arc<Activities>>,
    exams: State<'_, Arc<Exams>>,
    jobs: State<'_, Arc<Jobs>>,
    name: String,
) -> AppResult<()> {
    // The attempt starts its clusters itself as it resumes
    if exams.works_on_cluster(&name) {
        return Err(AppError::busy(format!("the attempt is starting {name} itself: wait for it")));
    }
    // Not while it is deleted, nor while the app starts it already
    let _job = jobs.begin(&name, crate::runtime::model::ClusterJob::Starting)?;
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
pub async fn list_exams(app: AppHandle) -> Vec<ExamSummary> {
    off_main_or_default(app, |app| Ok(app.state::<Arc<Exams>>().catalog())).await
}

/// The plans from `from` to `to` (YYYY-MM-DD, both included); `offset_minutes`
/// east of UTC places attempts on the candidate's own days.
#[tauri::command]
#[specta::specta]
pub async fn plans_between(app: AppHandle, from: String, to: String, offset_minutes: i32) -> AppResult<Vec<PlanView>> {
    off_main(app, move |app| app.state::<Arc<Exams>>().plans_between(&from, &to, offset_minutes)).await
}

/// Plan an exam on a day; returns the plan's id.
#[tauri::command]
#[specta::specta]
pub async fn plan_add(app: AppHandle, day: String, exam_id: String, mode: Mode) -> AppResult<i32> {
    off_main(app, move |app| {
        let id = app.state::<Arc<Exams>>().plan_add(&day, &exam_id, mode)?;
        crate::study_changed(app, false);
        Ok(id)
    })
    .await
}

/// Remove a plan.
#[tauri::command]
#[specta::specta]
pub async fn plan_remove(app: AppHandle, id: i32) -> AppResult<()> {
    off_main(app, move |app| {
        app.state::<Arc<Exams>>().plan_remove(id)?;
        crate::study_changed(app, false);
        Ok(())
    })
    .await
}

/// How ready the candidate is for a certification: per domain, and the
/// predicted score.
#[tauri::command]
#[specta::specta]
pub async fn readiness(app: AppHandle, certification: String) -> AppResult<ExamReadiness> {
    off_main(app, move |app| app.state::<Arc<Exams>>().readiness(&certification, crate::runtime::activity::now_ms())).await
}

/// Delete one of the candidate's own exams and its questions (and the
/// custom exams using them): their plans go, and Create conversations that
/// saved them hold drafts again. The exams gone
#[tauri::command]
#[specta::specta]
pub async fn delete_exam(app: AppHandle, id: String) -> AppResult<Vec<String>> {
    off_main(app, move |app| {
        let (exams, proofs) = (app.state::<Arc<Exams>>(), app.state::<Proofs>());
        let gone = exams.delete_exam(&id, &crate::data_dir(), |session| proofs.proving(session))?;
        crate::study_changed(app, true);
        Ok(gone)
    })
    .await
}

/// `work` off the main thread, where the interface runs: files written and
/// the question bank read again take a while. The app's state from `app`
/// (Tauri runs a command that is not async on the main thread.) A panic
/// in the work is the app's own failure, not the candidate's
async fn off_main<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&AppHandle) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(move || work(&app)).await.map_err(|e| AppError::internal("working in the background", e))?
}

/// `off_main` for a command that answers with what it has: what fails is
/// logged, and the default answered
async fn off_main_or_default<T: Default + Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&AppHandle) -> AppResult<T> + Send + 'static,
) -> T {
    off_main(app, work).await.unwrap_or_else(|e| {
        tracing::warn!(error = %e, "answering from the background");
        T::default()
    })
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
pub async fn agent_settings(app: AppHandle) -> AppResult<AgentSettings> {
    off_main(app, |app| Ok(crate::ai::policy::AgentSettings::load(&app.state::<Arc<Store>>())?.normalized())).await
}

#[tauri::command]
#[specta::specta]
pub async fn save_agent_settings(
    exams: State<'_, Arc<Exams>>,
    coach: State<'_, Coach>,
    store: State<'_, Arc<Store>>,
    settings: AgentSettings,
) -> AppResult<AgentSettings> {
    exams.assistant_allowed()?;
    let settings = settings.normalized();
    settings.save(&store)?;
    coach.configure(&settings).await;
    Ok(settings)
}

/// What runs the assistant (this computer's Claude CLI or Docker), and what this
/// computer has.
#[tauri::command]
#[specta::specta]
pub async fn coach_runtime(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<RuntimeInfo> {
    exams.assistant_allowed()?;
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
pub async fn coach_history(app: AppHandle, question_id: String) -> AppResult<CoachHistory> {
    off_main(app, move |app| Coach::history(&app.state::<Arc<Exams>>(), &app.state::<Arc<Store>>(), &question_id)).await
}

/// Ask the coach about a question (practice mode, or after the result); the
/// answer streams on `events` and resolves to the whole answer.
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn coach_ask(
    coach: State<'_, Coach>,
    exams: State<'_, Arc<Exams>>,
    store: State<'_, Arc<Store>>,
    question_id: String,
    text: String,
    model: ModelChoice,
    context: CoachContext,
    events: Channel<CoachEvent>,
) -> AppResult<CoachReply> {
    coach
        .ask(&exams, &store, &question_id, &text, &model.model, &model.effort, model.profile, context, |e| {
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
pub async fn coach_transcripts(app: AppHandle, attempt_id: String) -> AppResult<Vec<CoachTranscript>> {
    off_main(app, move |app| {
        app.state::<Arc<Exams>>().assistant_allowed()?;
        Coach::transcripts(&app.state::<Arc<Store>>(), &attempt_id)
    })
    .await
}

/// The past attempts that have coach sessions (History shows a way to them).
#[tauri::command]
#[specta::specta]
pub async fn coached_attempts(app: AppHandle) -> AppResult<Vec<String>> {
    off_main(app, |app| {
        app.state::<Arc<Exams>>().assistant_allowed()?;
        Coach::coached_attempts(&app.state::<Arc<Store>>())
    })
    .await
}

/// The attempt's coach sessions (History).
#[tauri::command]
#[specta::specta]
pub async fn coach_sessions(app: AppHandle) -> AppResult<Vec<CoachSession>> {
    off_main(app, |app| Coach::sessions(&app.state::<Arc<Exams>>(), &app.state::<Arc<Store>>())).await
}

/// Name a question's coach session (empty: back to its first question).
#[tauri::command]
#[specta::specta]
pub async fn coach_rename(app: AppHandle, question_id: String, title: String) -> AppResult<()> {
    off_main(app, move |app| Coach::rename(&app.state::<Arc<Exams>>(), &app.state::<Arc<Store>>(), &question_id, &title)).await
}

/// The effort levels a model takes (none when it has no effort setting).
#[tauri::command]
#[specta::specta]
pub async fn coach_efforts(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, model: String) -> AppResult<Vec<ModelOption>> {
    exams.assistant_allowed()?;
    coach.efforts(&model).await
}

/// The models the coach can use, as the agent lists them for this login.
#[tauri::command]
#[specta::specta]
pub async fn coach_models(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<CoachModels> {
    exams.assistant_allowed()?;
    coach.models().await
}

/// How the candidate did per curriculum domain, per certification attempted.
#[tauri::command]
#[specta::specta]
pub async fn study_stats(app: AppHandle) -> Vec<StudyStats> {
    off_main_or_default(app, |app| Ok(app.state::<Arc<Exams>>().study_stats())).await
}

/// Open a web page in the system browser (https only): links outside the exam desktop.
#[tauri::command]
#[specta::specta]
pub fn open_in_browser(app: AppHandle, url: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt as _;
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::invalid(format!("not a web page: {url}")));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::io("opening the browser", std::io::Error::other(e)))
}

/// The Claude login the assistant answers as.
#[tauri::command]
#[specta::specta]
pub async fn coach_account(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>) -> AppResult<Account> {
    exams.assistant_allowed()?;
    coach.account().await
}

/// Sign in to Claude with the CLI's login; what it prints streams on
/// `events` (the sign-in link, a prompt for the browser's code).
#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, method: SignInMethod, events: Channel<SignInEvent>) -> AppResult<()> {
    exams.assistant_allowed()?;
    coach
        .sign_in(method, |e| {
            let _ = events.send(e);
        })
        .await
}

/// Type a line into the running sign-in (the code the browser shows).
#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in_input(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, line: String) -> AppResult<()> {
    exams.assistant_allowed()?;
    coach.sign_in_input(&line).await
}

#[tauri::command]
#[specta::specta]
pub async fn coach_sign_in_cancel(coach: State<'_, Coach>) -> AppResult<()> {
    coach.sign_in_cancel().await;
    Ok(())
}

/// Answer the assistant's request to run a command: one of its options
/// (allow once, always, reject…), or none to cancel.
#[tauri::command]
#[specta::specta]
pub fn coach_permit(exams: State<'_, Arc<Exams>>, coach: State<'_, Coach>, id: u32, option: Option<String>) -> AppResult<()> {
    exams.assistant_allowed()?;
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
pub async fn exam_progress(app: AppHandle, attempt_id: String) -> AppResult<Progress> {
    off_main(app, move |app| app.state::<Arc<Store>>().progress(&attempt_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn save_exam_progress(app: AppHandle, attempt_id: String, progress: Progress) -> AppResult<()> {
    off_main(app, move |app| app.state::<Arc<Store>>().save_progress(&attempt_id, &progress)).await
}

/// The exam desk's display settings (desktop zoom and resolution, text size).
#[tauri::command]
#[specta::specta]
pub async fn settings(app: AppHandle) -> AppResult<Settings> {
    off_main(app, |app| app.state::<Arc<Store>>().settings()).await
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings(app: AppHandle, settings: Settings) -> AppResult<()> {
    off_main(app, move |app| {
        let store = app.state::<Arc<Store>>();
        let targets = store.settings().ok().map(|s| s.targets);
        store.save_settings(&settings)?;
        // Turned off: what it was writing stops
        if !settings.assistant_enabled {
            app.state::<Coach>().stop_answers();
        }
        // Other exams aimed at: other readiness to read
        if targets.as_ref() != Some(&settings.targets) {
            crate::study_changed(app, false);
        }
        Ok(())
    })
    .await
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
pub async fn desktop_session(exams: State<'_, Arc<Exams>>) -> AppResult<Option<crate::runtime::desktop::DesktopSession>> {
    // Not up yet: answered as it comes up (or after a while, to ask again)
    exams.desktop_session(std::time::Duration::from_secs(30)).await
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
    proofs: State<'_, Proofs>,
    id: String,
    mode: Mode,
    replace: bool,
) -> AppResult<()> {
    // Before anything is created: this machine can run it, beside the proofs
    // running (their clusters are not among the app's)
    if let Some(summary) = exams.catalog().into_iter().find(|e| e.id == id) {
        let state = preflight::measured(&env).await;
        preflight::exam_fits(&state, summary.minimum_mb + proofs.reserved_mb(), &summary.clusters)?;
    }
    // An exam has no assistant: it refuses from here, then what it was doing
    // stops (answers, proofs); nothing it begins meanwhile slips past
    let _starting = (mode == Mode::Exam).then(|| exams.exam_starting());
    if mode == Mode::Exam {
        coach.stop_answers();
        proofs.stop_all();
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
pub async fn exam_history(app: AppHandle) -> Vec<HistoryEntry> {
    off_main_or_default(app, |app| Ok(app.state::<Arc<Exams>>().history())).await
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
pub async fn studio_sessions(app: AppHandle) -> AppResult<Vec<crate::store::StudioSessionRow>> {
    off_main(app, |app| app.state::<Arc<Store>>().studio_sessions()).await
}

/// A new Create conversation
#[tauri::command]
#[specta::specta]
pub async fn studio_new(app: AppHandle) -> AppResult<StudioConversation> {
    off_main(app, |app| {
        let id = app.state::<Arc<Store>>().studio_new()?;
        Ok(StudioConversation { id, messages: Vec::new(), draft: Default::default() })
    })
    .await
}

/// A Create conversation, with its messages and draft
#[tauri::command]
#[specta::specta]
pub async fn studio_open(app: AppHandle, session: i32) -> AppResult<StudioConversation> {
    off_main(app, move |app| {
        let (store, exams, proofs) = (app.state::<Arc<Store>>(), app.state::<Arc<Exams>>(), app.state::<Proofs>());
        let draft = crate::studio::opened(&store, &exams, &crate::data_dir(), session, || proofs.proving(session))?;
        Ok(StudioConversation { id: session, messages: store.studio_messages(session)?, draft })
    })
    .await
}

/// Say something in a Create conversation; the answer streams as it is
/// written (and Claude's tool uses), the draft's changes arrive as
/// `StudioDraft`. The days Claude is told of are this computer's
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
pub async fn studio_delete(coach: State<'_, Coach>, proofs: State<'_, Proofs>, store: State<'_, Arc<Store>>, session: i32) -> AppResult<()> {
    // What goes on for it stops: its answer, its proof (and the proof's cluster)
    coach.studio_stop(session);
    proofs.stop(session);
    coach.studio_forget(session).await;
    store.studio_delete(session)
}

/// Take a question out of the draft (by id, or a new one's key)
#[tauri::command]
#[specta::specta]
pub async fn studio_remove(app: AppHandle, session: i32, id: String) -> AppResult<crate::studio::draft::ExamDraft> {
    off_main(app, move |app| {
        let (store, proofs) = (app.state::<Arc<Store>>(), app.state::<Proofs>());
        crate::studio::edit(&store, session, || proofs.proving(session), |draft| Ok(draft.remove_by_candidate(&id)))
            .map(|(draft, _)| draft)
    })
    .await
}

/// The candidate's changes to the draft: its title, its length, or every
/// question out
#[tauri::command]
#[specta::specta]
pub async fn studio_edit(
    app: AppHandle,
    session: i32,
    title: Option<String>,
    duration_minutes: Option<u32>,
    clear: bool,
) -> AppResult<crate::studio::draft::ExamDraft> {
    off_main(app, move |app| {
        let (store, proofs) = (app.state::<Arc<Store>>(), app.state::<Proofs>());
        crate::studio::edit(&store, session, || proofs.proving(session), |draft| {
            draft.edit(title.as_deref(), duration_minutes, clear);
            Ok(())
        })
        .map(|(draft, ())| draft)
    })
    .await
}

/// What proving a conversation's exam takes (its cluster, the time), and
/// why it cannot run now if so
#[tauri::command]
#[specta::specta]
pub async fn studio_plan(
    store: State<'_, Arc<Store>>,
    exams: State<'_, Arc<Exams>>,
    env: State<'_, Arc<Env>>,
    proofs: State<'_, Proofs>,
    session: i32,
) -> AppResult<ProofPlan> {
    let fits = proof_fits(preflight::measured(&env).await, &proofs);
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
    exams.assistant_allowed()?;
    let fits = proof_fits(preflight::measured(&env).await, &proofs);
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

/// Whether a proof's run of so many MB fits in what Docker has left
/// (`state`, measured), the proofs running counted (their clusters are not
/// among the app's)
fn proof_fits(state: EnvState, proofs: &Proofs) -> impl Fn(u32) -> AppResult<()> + '_ {
    move |mb| preflight::fits(&state, "Proving the exam", mb + proofs.reserved_mb(), &[])
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
pub async fn studio_save(app: AppHandle, session: i32) -> AppResult<String> {
    off_main(app, move |app| {
        let (store, exams, proofs) = (app.state::<Arc<Store>>(), app.state::<Arc<Exams>>(), app.state::<Proofs>());
        let id = crate::studio::save(&store, &exams, &crate::data_dir(), session, || proofs.proving(session))?;
        crate::study_changed(app, true);
        Ok(id)
    })
    .await
}
