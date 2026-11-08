mod ai;
mod cli;
mod cluster;
mod commands;
mod error;
mod former;
mod lab;
mod observability;
mod runtime;
mod store;
mod studio;
mod sync;
mod telemetry;

use runtime::model::{Env, EnvState};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tauri_specta::Event;

/// Pushed to the UI on every exam state change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct ExamChanged(lab::exam::ExamState);

/// A long operation started or moved on (without its log).
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct ActivityChanged(runtime::activity::Activity);

/// A log line of a long operation.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct ActivityLog {
    pub id: u32,
    pub line: String,
}

/// Something changed the running attempt's environment outside cktry.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct GuardNotice(String);

/// A Create conversation's exam is being proven: where it is (none: done).
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct StudioProof {
    pub session: i32,
    pub proof: Option<studio::proof::Proof>,
}

/// Claude changed a Create conversation's draft exam.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct StudioDraft {
    pub session: i32,
    pub draft: studio::draft::ExamDraft,
}

/// The candidate's study changed: an attempt finished, a plan or the target
/// changed, or (`catalog`) the exams themselves (one saved or deleted).
/// What the screens read of it (history, plans, readiness, the exams) is
/// read again on it, not polled
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct StudyChanged {
    pub catalog: bool,
}

/// Tell the screens the study changed (`catalog`: the exams too)
pub fn study_changed(app: &tauri::AppHandle, catalog: bool) {
    let _ = StudyChanged { catalog }.emit(app);
}

/// Pushed to the UI on every environment change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct EnvChanged(EnvState);

/// Typed IPC: debug builds regenerate `desktop/src/tauri/bindings.ts`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(tauri_specta::collect_events![EnvChanged, ExamChanged, ActivityChanged, ActivityLog, GuardNotice, StudioDraft, StudioProof, StudyChanged])
        .commands(tauri_specta::collect_commands![
        commands::env_state,
        commands::studio_sessions,
        commands::studio_new,
        commands::studio_open,
        commands::studio_ask,
        commands::studio_delete,
        commands::studio_remove,
        commands::studio_edit,
        commands::studio_plan,
        commands::studio_verify,
        commands::studio_proofs,
        commands::studio_stop_proof,
        commands::studio_stop,
        commands::studio_save,
        commands::env_retry,
        commands::env_watch_nodes,
        commands::delete_cluster,
        commands::repair_cluster,
        commands::list_exams,
        commands::delete_exam,
        commands::plans_between,
        commands::plan_add,
        commands::plan_update,
        commands::plan_remove,
        commands::readiness,
        commands::exam_state,
        commands::desktop_session,
        commands::desktop_reset,
        commands::desktop_open_url,
        commands::coach_status,
        commands::app_info,
        commands::telemetry_configure,
        commands::agent_settings,
        commands::save_agent_settings,
        commands::coach_runtime,
        commands::coach_history,
        commands::coach_ask,
        commands::coach_cancel,
        commands::coach_permit,
        commands::coach_account,
        commands::coach_sign_in,
        commands::coach_sign_in_input,
        commands::coach_sign_in_cancel,
        commands::coach_clear,
        commands::coach_new_session,
        commands::coach_open_session,
        commands::coach_transcripts,
        commands::coached_attempts,
        commands::coach_sessions,
        commands::coach_rename,
        commands::coach_models,
        commands::coach_efforts,
        commands::study_stats,
        commands::open_in_browser,
        commands::activities,
        commands::exam_progress,
        commands::save_exam_progress,
        commands::settings,
        commands::save_settings,
        commands::start_exam,
        commands::submit_exam,
        commands::retry_exam,
        commands::end_exam,
        commands::check_question,
        commands::question_solution,
        commands::exam_history,
    ])
}

/// Bindings are exported by debug builds (and checked by a test)
#[cfg(debug_assertions)]
fn typescript() -> specta_typescript::Typescript {
    specta_typescript::Typescript::default().header("// @ts-nocheck")
}

/// Bundle identifier (tauri.conf.json); names the app data directory.
pub const APP_ID: &str = "dev.cktry.app";
/// The database, in the data directory (store.rs)
pub const DATABASE: &str = "cktry.db";

/// Where the app keeps kind, kubeconfigs and the jumphost files: the same
/// directory for the app and the CLI.
/// Kubeconfigs, keys and the database are the user's only: the directory is
/// made private before anything goes in, whichever runs first.
pub fn data_dir() -> std::path::PathBuf {
    let dir = dirs::data_dir().unwrap_or_else(std::env::temp_dir).join(APP_ID);
    // What the app kept under its former name comes along, the first time
    former::move_data(&dir);
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    dir
}

/// The bundled lab pack: from the source tree in development, from the app
/// resources in a release build. Lint problems are logged, not fatal.
pub(crate) fn load_pack(resource_dir: Option<std::path::PathBuf>) -> lab::load::LoadedPack {
    let root = if cfg!(debug_assertions) {
        std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packs/core"))
    } else {
        resource_dir.unwrap_or_default().join("packs/core")
    };
    let (pack, mut findings) = lab::load::load(&root);
    if let Some(pack) = &pack {
        findings.extend(lab::lint::lint(pack));
    }
    for f in &findings {
        tracing::warn!(file = %f.file, "{}", f.message);
    }
    pack.unwrap_or_else(|| lab::load::LoadedPack {
        root,
        pack: lab::model::Pack {
            id: "none".into(),
            title: "No pack".into(),
            version: "0".into(),
            certifications: Default::default(),
        },
        questions: Default::default(),
        exams: Default::default(),
    })
}

/// CLI subcommands run headless; otherwise start the app.
pub fn main() -> std::process::ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if cli::is_cli(&args) {
        return cli::main();
    }
    run();
    std::process::ExitCode::SUCCESS
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    builder
        .export(typescript(), concat!(env!("CARGO_MANIFEST_DIR"), "/../src/tauri/bindings.ts"))
        .expect("exporting typescript bindings");

    tauri::Builder::default()
        // The window opens where and as large as it was left
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(cluster::jobs::Jobs::default())
        .manage(ai::Coach::new())
        .invoke_handler({
            let handler = builder.invoke_handler();
            // Each command the interface calls, by name (debug: `CKTRY_LOG`)
            move |invoke: tauri::ipc::Invoke| {
                tracing::debug!(command = invoke.message.command(), "command");
                handler(invoke)
            }
        })
        .setup(move |app| {
            if let Ok(dir) = app.path().app_log_dir() {
                observability::init(&dir);
            }
            builder.mount_events(app);
            let data_dir = data_dir();
            telemetry::watch_panics(data_dir.clone());
            let kind = Arc::new(cluster::kind::Kind::new(data_dir.clone()));
            let infra = Arc::new(runtime::infra::Infra::new(data_dir.clone()));
            app.manage(infra.clone());
let proving = app.handle().clone();
            app.manage(studio::proof::Proofs::new(move |session, proof| {
                let _ = StudioProof { session, proof: proof.cloned() }.emit(&proving);
            }));
            app.manage(Arc::new(runtime::jumphost::Jumphost::app(&data_dir)));
            let (changed, line) = (app.handle().clone(), app.handle().clone());
            let activities = runtime::activity::Activities::new(
                move |activity| {
                    let _ = ActivityChanged(activity.clone()).emit(&changed);
                },
                move |id, text| {
                    let _ = ActivityLog { id, line: text.to_string() }.emit(&line);
                },
            );
            app.manage(activities.clone());
            let handle = app.handle().clone();
            let env = Arc::new(Env::new(move |state| {
                let _ = EnvChanged(state.clone()).emit(&handle);
            }));
            let notices = app.handle().clone();
            let guard = runtime::guard::Guard::new(move |what| {
                let _ = GuardNotice(what.to_string()).emit(&notices);
            });
            app.manage(guard.clone());
            let jumphost = app.state::<Arc<runtime::jumphost::Jumphost>>().inner().clone();
            // Everything kept between runs; what earlier versions wrote to
            // files moves in once
            let store = Arc::new(store::Store::open(&data_dir.join(DATABASE))?);
            store.import_files(&data_dir);
            // The assistant runs where its settings say
            app.state::<ai::Coach>().apply(&ai::policy::AgentSettings::load(&store).unwrap_or_default().normalized());
            app.state::<ai::Coach>().switch(store.settings().map(|s| s.assistant_enabled).unwrap_or(true));
            // Docker, the clusters and the guard; the attempt being resumed
            // starts its own clusters, task host and desktop
            let resuming = lab::exam::saved_running(&store).map(|(attempt, _)| attempt.clusters).unwrap_or_default();
            runtime::monitor::start(env.clone(), kind.clone(), infra.clone(), activities.clone(), guard.clone(), resuming);
            app.manage(store.clone());
            let exams_handle = app.handle().clone();
            let exams = Arc::new(lab::exam::Exams::new(
                lab::mine::merged(load_pack(app.path().resource_dir().ok()), &data_dir),
                kind.clone(),
                infra,
                jumphost,
                runtime::desktop::NAME,
                store.clone(),
                move |state| {
                    let _ = ExamChanged(state.clone()).emit(&exams_handle);
                    // A result in, or an attempt gone: the history moved
                    if matches!(state, lab::exam::ExamState::Finished { .. } | lab::exam::ExamState::Idle) {
                        study_changed(&exams_handle, false);
                    }
                },
                activities,
                guard,
            ));
            exams.restore();
            // The agent sessions' tools, served to the agent on the loopback
            {
                let (handle, store) = (app.handle().clone(), store.clone());
                let drafts = app.handle().clone();
                let proofs = app.handle().clone();
                let studio = Arc::new(ai::studio_tools::Tools::new(
                    exams.clone(),
                    store.clone(),
                    data_dir.clone(),
                    move |session, draft| {
                        let _ = StudioDraft { session, draft: draft.clone() }.emit(&drafts);
                    },
                    move |session| proofs.state::<studio::proof::Proofs>().proving(session),
                ));
                tauri::async_runtime::spawn(async move {
                    match ai::mcp_http::McpHttp::start(store, Some(studio)).await {
                        Ok(server) => handle.state::<ai::Coach>().serve_tools(server),
                        Err(e) => tracing::warn!(error = %e, "the agent's tools are unavailable"),
                    }
                    // The adapter does not stay up unused
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                        handle.state::<ai::Coach>().stop_if_idle().await;
                    }
                });
            }
            app.manage(exams);
            app.manage(kind);
            app.manage(env);
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "cktry started");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // cktry stops the containers itself now: not for the guard to restart
                app.state::<Arc<runtime::guard::Guard>>().suspend();
                // Clusters stop until the next start
                runtime::reconcile::on_exit(&app.state::<Arc<cluster::kind::Kind>>());
                // Exams being proven in Create: their clusters go
                app.state::<studio::proof::Proofs>().on_exit();
            }
        });
}

#[cfg(test)]
mod e2e;
