mod ai;
mod cli;
mod cluster;
mod commands;
mod error;
mod lab;
mod observability;
mod runtime;
mod store;
mod terminal;

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

/// Something changed the running attempt's environment outside ckdry.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct GuardNotice(String);

/// Pushed to the UI on every environment change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct EnvChanged(EnvState);

/// Typed IPC: debug builds regenerate `desktop/src/tauri/bindings.ts`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(tauri_specta::collect_events![EnvChanged, ExamChanged, ActivityChanged, ActivityLog, GuardNotice])
        .commands(tauri_specta::collect_commands![
        commands::env_state,
        commands::env_retry,
        commands::env_watch_nodes,
        commands::preflight,
        commands::create_cluster,
        commands::delete_cluster,
        commands::cancel_cluster,
        commands::repair_cluster,
        commands::adopt_cluster,
        commands::terminal_open,
        commands::terminal_write,
        commands::terminal_resize,
        commands::terminal_close,
        commands::list_exams,
        commands::exam_state,
        commands::desktop_session,
        commands::desktop_reset,
        commands::desktop_open_url,
        commands::coach_status,
        commands::app_info,
        commands::agent_settings,
        commands::save_agent_settings,
        commands::coach_history,
        commands::coach_ask,
        commands::coach_cancel,
        commands::coach_permit,
        commands::coach_account,
        commands::coach_sign_in,
        commands::coach_sign_in_input,
        commands::coach_sign_in_cancel,
        commands::coach_sign_out,
        commands::coach_clear,
        commands::coach_sessions,
        commands::coach_rename,
        commands::coach_models,
        commands::coach_efforts,
        commands::study_stats,
        commands::coach_study_plan,
        commands::study_plan_last,
        commands::open_in_browser,
        commands::generator_targets,
        commands::generate_question,
        commands::activities,
        commands::exam_progress,
        commands::save_exam_progress,
        commands::settings,
        commands::save_settings,
        commands::start_exam,
        commands::submit_exam,
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
pub const APP_ID: &str = "dev.ckdry.app";

/// Where the app keeps kind, kubeconfigs and the jumphost files: the same
/// directory for the app and the CLI.
pub fn data_dir() -> std::path::PathBuf {
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join(APP_ID)
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
        .manage(terminal::Terminals::default())
        .manage(cluster::jobs::Jobs::default())
        .manage(ai::Coach::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            if let Ok(dir) = app.path().app_log_dir() {
                observability::init(&dir);
            }
            builder.mount_events(app);
            let data_dir = data_dir();
            // Kubeconfigs, keys and the database: the user's only
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::create_dir_all(&data_dir);
                let _ = std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700));
            }
            let kind = Arc::new(cluster::kind::Kind::new(data_dir.clone()));
            let infra = Arc::new(runtime::infra::Infra::new(data_dir.clone()));
            app.manage(infra.clone());
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
            runtime::monitor::start(env.clone(), kind.clone(), infra.clone(), activities.clone(), guard.clone());
            let jumphost = app.state::<Arc<runtime::jumphost::Jumphost>>().inner().clone();
            // Everything kept between runs; what earlier versions wrote to
            // files moves in once
            let store = Arc::new(store::Store::open(&data_dir.join("ckdry.db"))?);
            store.import_files(&data_dir);
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
                },
                activities,
                guard,
            ));
            exams.restore();
            // The agent sessions' tools, served to their container
            {
                let (handle, exams, store, dir) = (app.handle().clone(), exams.clone(), store.clone(), data_dir.clone());
                tauri::async_runtime::spawn(async move {
                    match ai::mcp_http::McpHttp::start(move || exams.bank(), store, dir).await {
                        Ok(server) => handle.state::<ai::Coach>().serve_tools(server),
                        Err(e) => tracing::warn!(error = %e, "the agent's tools are unavailable"),
                    }
                });
            }
            app.manage(exams);
            app.manage(kind);
            app.manage(env);
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "ckdry started");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // ckdry stops the containers itself now: not for the guard to restart
                app.state::<Arc<runtime::guard::Guard>>().suspend();
                // Shells die with the app; clusters stop until the next start
                let terminals = app.state::<terminal::Terminals>();
                tauri::async_runtime::block_on(terminals.close_all());
                runtime::reconcile::on_exit(&app.state::<Arc<cluster::kind::Kind>>());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use runtime::{exec, infra};
    use std::time::Duration;

    /// Opt-in end-to-end tests against the host Docker engine (slow; they
    /// replace the app's jumphost): `cargo test -- --ignored --nocapture`
    struct Fixture {
        kind: Arc<cluster::kind::Kind>,
        infra: Arc<infra::Infra>,
        jumphost: Arc<runtime::jumphost::Jumphost>,
    }

    /// Clusters, kind state and a jumphost of the test's own
    fn fixture(name: &str) -> Fixture {
        let dir = std::env::temp_dir().join(format!("ckdry-e2e-{name}"));
        Fixture {
            kind: Arc::new(cluster::kind::Kind::new(dir.clone())),
            infra: Arc::new(infra::Infra::new(dir.clone())),
            jumphost: Arc::new(runtime::jumphost::Jumphost::for_run(&dir, &format!("test-{name}"))),
        }
    }

    impl Fixture {
        /// Remove the test's own jumphost container: a test leaves nothing
        /// running. Its directory stays: the next run mounts the same path,
        /// and OrbStack's file sharing shows a deleted-then-recreated
        /// directory as missing to new containers
        async fn teardown(&self) {
            let docker = runtime::docker::connect().await.unwrap();
            let options = bollard::query_parameters::RemoveContainerOptions { force: true, v: true, ..Default::default() };
            let _ = docker.remove_container(&self.jumphost.name, Some(options)).await;
        }

        /// Create a cluster and give the jumphost access to it
        async fn create(&self, cluster: &str, workers: u8) {
            cluster::lifecycle::create(&self.kind, &self.infra, cluster, workers, &log, &Default::default()).await.unwrap();
            self.refresh().await;
        }

        async fn delete(&self, cluster: &str) {
            cluster::lifecycle::delete(&self.kind, cluster, &log).await.unwrap();
            self.refresh().await;
        }

        async fn refresh(&self) {
            let docker = runtime::docker::connect().await.unwrap();
            self.jumphost.ensure(&docker, &log).await.unwrap();
            let placement = runtime::jumphost::app_placement(&self.kind);
            self.jumphost.refresh_access(&docker, &self.kind, &placement).await.unwrap();
        }

        /// Shell command on the jumphost, as the candidate would type it
        async fn on_jumphost(&self, cmd: &str) -> exec::Output {
            let docker = runtime::docker::connect().await.unwrap();
            exec::run(&docker, &self.jumphost.name, &["bash", "-lc", cmd], &[], None).await.unwrap()
        }
    }

    fn log(line: String) {
        println!("  | {line}");
    }

    async fn eventually(what: &str, attempts: u32, check: impl AsyncFn() -> bool) {
        for _ in 0..attempts {
            if check().await {
                println!("ok: {what}");
                return;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        panic!("timed out waiting for: {what}");
    }

    /// A cluster as the candidate sees it on the exam: from the jumphost,
    /// a context per cluster, ssh to nodes, etcdctl, metrics, cached pulls,
    /// and checks graded there.
    #[tokio::test]
    #[ignore]
    async fn exam_cluster_from_the_jumphost() {
        let f = fixture("cluster");
        let name = "ckdry-e2e";
        let started = std::time::Instant::now();
        f.create(name, 1).await;
        println!("created in {:?}", started.elapsed());

        let docker = runtime::docker::connect().await.unwrap();
        for container in [format!("{name}-control-plane"), format!("{name}-worker"), f.jumphost.name.clone()] {
            let labels = docker.inspect_container(&container, None).await.unwrap().config.unwrap().labels.unwrap();
            assert_eq!(labels.get("com.docker.compose.project").map(String::as_str), Some("ckdry"), "{container}");
        }
        println!("ok: nodes and jumphost are in the ckdry compose project");

        let out = f.on_jumphost("kubectl config current-context && kubectl get nodes --no-headers | wc -l").await;
        assert_eq!(out.text.split_whitespace().collect::<Vec<_>>(), [name, "2"], "{}", out.text);
        println!("ok: jumphost kubectl has context {name} with 2 nodes");

        let out = f.on_jumphost(&format!(
            "ssh {name}-worker hostname && ssh {name}-control-plane 'ls /etc/kubernetes/manifests; systemctl is-active kubelet'"
        ))
        .await;
        assert!(out.text.contains(&format!("{name}-worker")) && out.text.contains("etcd.yaml") && out.text.contains("active"), "{}", out.text);
        println!("ok: ssh to nodes, static pods and kubelet visible");

        let out = f.on_jumphost(&format!(
            "d=/root/.ckdry/etcd/{name}; etcdctl --endpoints=https://{name}-control-plane:2379 --cacert=$d/ca.crt --cert=$d/client.crt --key=$d/client.key endpoint health"
        ))
        .await;
        assert!(out.text.contains("is healthy"), "{}", out.text);
        println!("ok: etcdctl from the jumphost");

        eventually("kubectl top nodes (metrics-server)", 60, async || {
            f.on_jumphost("kubectl top nodes").await.exit_code == 0
        })
        .await;

        let out = f.on_jumphost("kubectl run web --image=nginx:alpine && kubectl wait --for=condition=Ready pod/web --timeout=180s").await;
        assert_eq!(out.exit_code, 0, "{}", out.text);
        let catalog = exec::run(&docker, infra::MIRROR, &["wget", "-qO-", "http://127.0.0.1:5000/v2/_catalog"], &[], None).await.unwrap();
        assert!(catalog.text.contains("library/nginx"), "{}", catalog.text);
        println!("ok: image pulled through the docker.io cache");

        // A check script, graded on the jumphost: FAIL, then PASS
        let check = "kubectl get namespace app-team1";
        assert_ne!(lab::checks::run_script(&docker, &f.jumphost.name, name, check, 30).await.unwrap().0, 0);
        assert_eq!(f.on_jumphost("kubectl create namespace app-team1").await.exit_code, 0);
        assert_eq!(lab::checks::run_script(&docker, &f.jumphost.name, name, check, 30).await.unwrap().0, 0);
        println!("ok: a check graded on the jumphost");

        // Quitting the app stops the cluster and cache (and the app's own
        // jumphost, not this test's); starting it again brings them back,
        // workloads included
        let containers = [format!("{name}-control-plane"), format!("{name}-worker"), infra::MIRROR.to_string()];
        let running = async |container: &str| {
            docker.inspect_container(container, None).await.ok().and_then(|c| c.state?.running).unwrap_or(false)
        };
        runtime::reconcile::on_exit(&f.kind);
        eventually("quitting stops the nodes and cache", 30, async || {
            for c in &containers {
                if running(c).await {
                    return false;
                }
            }
            true
        })
        .await;
        runtime::reconcile::on_startup(&docker, &f.kind, &runtime::activity::Activities::silent()).await;
        eventually("starting again brings back the nodes and the pod", 90, async || {
            let out = f.on_jumphost("kubectl get nodes --no-headers | grep -cw Ready; kubectl get pod web -o jsonpath='{.status.phase}'").await;
            out.text.split_whitespace().collect::<Vec<_>>() == ["2", "Running"]
        })
        .await;

        f.delete(name).await;
        let out = f.on_jumphost("kubectl config get-contexts -o name 2>&1").await;
        assert!(!out.text.contains(name), "{}", out.text);
        println!("ok: context removed from the jumphost");
        f.teardown().await;
    }

    /// The monitor notices nodes going away and coming back, live:
    /// `cargo test monitor -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn monitor_tracks_node_failure_and_repair() {
        use runtime::model::{ContainerStatus, Readiness};
        let f = fixture("monitor");
        let name = "ckdry-mon";
        let env = Arc::new(Env::new(|_| {}));
        // Readiness is followed while it is shown (the Environment page)
        env.set_watch_nodes(true);
        f.create(name, 1).await;
        runtime::monitor::start(env.clone(), f.kind.clone(), f.infra.clone(), runtime::activity::Activities::silent(), runtime::guard::Guard::new(|_| {}));
        let worker = format!("{name}-worker");

        eventually("all nodes Ready", 120, async || {
            env.snapshot().clusters.first().is_some_and(|c| c.nodes.len() == 2 && c.nodes.iter().all(|n| n.ready == Readiness::Ready))
        })
        .await;

        let docker = runtime::docker::connect().await.unwrap();
        docker.stop_container(&worker, None::<bollard::query_parameters::StopContainerOptions>).await.unwrap();
        eventually("stopped worker reported as an issue", 60, async || {
            let s = env.snapshot();
            s.clusters.iter().flat_map(|c| &c.nodes).any(|n| n.name == worker && n.container == ContainerStatus::Stopped)
                && s.issues.iter().any(|i| i.component == worker)
        })
        .await;

        runtime::reconcile::repair(&docker, name).await.unwrap();
        eventually("worker Ready again, no issues", 120, async || {
            let s = env.snapshot();
            s.issues.is_empty() && s.clusters.first().is_some_and(|c| c.nodes.iter().all(|n| n.ready == Readiness::Ready))
        })
        .await;

        f.delete(name).await;
        eventually("cluster gone from the state", 30, async || env.snapshot().clusters.is_empty()).await;
        f.teardown().await;
    }

    /// A whole attempt through the exam engine, both modes, on a one-question
    /// exam: `cargo test exam_engine -- --ignored --nocapture`
    /// A pack with one exam ("core/one") of one question, on `cluster`
    fn one_question_pack(name: &str, cluster: &str) -> (std::path::PathBuf, lab::load::LoadedPack) {
        let pack_dir = std::env::temp_dir().join(format!("ckdry-e2e-pack-{name}"));
        let _ = std::fs::remove_dir_all(&pack_dir);
        let core = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        std::fs::create_dir_all(pack_dir.join("questions/cka")).unwrap();
        std::fs::create_dir_all(pack_dir.join("exams")).unwrap();
        std::fs::copy(core.join("pack.yaml"), pack_dir.join("pack.yaml")).unwrap();
        let question_yaml = std::fs::read_to_string(core.join("questions/cka/rbac-ci-token.yaml")).unwrap();
        std::fs::write(pack_dir.join("questions/cka/rbac-ci-token.yaml"), format!("{question_yaml}\ncluster: {cluster}\n")).unwrap();
        std::fs::write(pack_dir.join("exams/one.yaml"), "title: One\ncertification: cka\nquestions: [core/cka/rbac-ci-token]\n").unwrap();
        let (pack, findings) = lab::load::load(&pack_dir);
        assert!(findings.is_empty(), "{:?}", findings.iter().map(|f| &f.message).collect::<Vec<_>>());
        (pack_dir, pack.unwrap())
    }

    #[tokio::test]
    #[ignore]
    async fn exam_engine_practice_and_exam_modes() {
        use lab::exam::{ExamState, Exams, Mode};
        // A cluster of its own: kind names are global, and `k8s` is the app's
        // (a running exam's cluster would be replaced)
        let cluster = "ckdry-e2e-exam";
        let (pack_dir, pack) = one_question_pack("exam", cluster);

        let db = std::env::temp_dir().join("ckdry-e2e-exam.db");
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", db.display()));
        }
        let store = Arc::new(store::Store::open(&db).unwrap());
        let f = fixture("exam");
        let desktop = "ckdry-desktop-test-exam";
        // The monitor feeds the guard Docker's events, as in the app
        let guard = runtime::guard::Guard::new(|what| println!("  guard: {what}"));
        runtime::monitor::start(Arc::new(Env::new(|_| {})), f.kind.clone(), f.infra.clone(), runtime::activity::Activities::silent(), guard.clone());
        let exams = Arc::new(Exams::new(pack, f.kind.clone(), f.infra.clone(), f.jumphost.clone(), desktop, store.clone(), |_: &ExamState| {}, runtime::activity::Activities::new(|_| {}, |_, line: &str| println!("  | {line}")), guard.clone()));
        let question = "core/cka/rbac-ci-token";
        let wait_running = async || {
            for _ in 0..300 {
                match exams.state() {
                    ExamState::Running { .. } => return,
                    ExamState::Failed { message, .. } => panic!("exam failed: {message}"),
                    _ => tokio::time::sleep(Duration::from_secs(1)).await,
                }
            }
            panic!("exam never started");
        };

        // Practice: check, solve, check, submit
        let started = std::time::Instant::now();
        exams.start("core/one", Mode::Practice, true).await.unwrap();
        wait_running().await;
        println!("ok: exam ready in {:.1} s (cluster, task host, desktop, setup)", started.elapsed().as_secs_f64());
        let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
        assert!(ends_at.is_none() && !attempt.questions[0].hints.is_empty());
        let failing = exams.check_question(question).await.unwrap();
        assert!(failing.iter().all(|c| !c.passed));
        println!("ok: practice check fails before solving");

        // The guard: the Mac is shut out of the API server, and what is done
        // to the environment outside the exam desktop is put back and noted
        let kubeconfig = f.kind.kubeconfig(cluster);
        eventually("kubectl from the host is refused", 30, async || {
            !std::process::Command::new("kubectl")
                .args(["--kubeconfig", &kubeconfig.to_string_lossy(), "--request-timeout=3s", "get", "ns"])
                .output()
                .is_ok_and(|o| o.status.success())
        })
        .await;
        println!("ok: kubectl from the host cannot reach the cluster during the attempt");
        let docker_cli = runtime::docker::cli().expect("docker CLI");
        let outside_cmd = |args: &[&str]| std::process::Command::new(&docker_cli).args(args).output().unwrap();
        outside_cmd(&["exec", &format!("{cluster}-control-plane"), "true"]);
        eventually("an outside exec is noted", 15, async || guard.outside().iter().any(|o| o.contains("command was run"))).await;
        outside_cmd(&["stop", "-t", "1", desktop]);
        eventually("a desktop stopped outside is started again", 30, async || {
            guard.outside().iter().any(|o| o.contains("stopped outside")) && outside_cmd(&["inspect", "-f", "{{.State.Running}}", desktop]).stdout.starts_with(b"true")
        })
        .await;
        println!("ok: an outside exec is noted; a desktop stopped outside is started again");

        // The practice coach answers about the failing check (the real model,
        // when Claude Code is installed) and keeps the conversation
        if runtime::docker::cli().is_some() {
            let streamed = std::sync::Mutex::new(String::new());
            let coach = ai::Coach::new();
            let context = ai::CoachContext { checks: true, cluster: true };
            let answer = coach
                .ask(&exams, &store, question, "Why do my checks fail? One sentence.", &failing, false, "haiku", "default", ai::Profile::Ask, context, |event| {
                    if let ai::CoachEvent::Text { text } = event {
                        streamed.lock().unwrap().push_str(&text)
                    }
                })
                .await
                .unwrap()
                .text;
            assert!(!answer.trim().is_empty() && !streamed.lock().unwrap().is_empty());
            assert_eq!(ai::Coach::history(&exams, &store, question).unwrap().messages.len(), 2);
            println!("ok: the practice coach answers and keeps the conversation: {}", answer.lines().next().unwrap_or_default());
        } else {
            println!("skip: the practice coach (Claude Code is not installed)");
        }

        // The exam desktop, as the candidate uses it
        let docker = runtime::docker::connect().await.unwrap();
        let session = runtime::desktop::session(&docker, desktop).await.unwrap().expect("a desktop session");
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", session.port)).await.is_ok() && session.password.len() == 8);
        println!("ok: desktop VNC on 127.0.0.1:{} behind a password", session.port);
        let on_base = async |cmd: &str| {
            exec::run(&docker, desktop, &["bash", "-lc", cmd], &[], None).await.unwrap()
        };
        let out = on_base("hostname; whoami; command -v kubectl || echo no-kubectl").await;
        assert_eq!(out.text.split_whitespace().collect::<Vec<_>>(), ["base", "candidate", "no-kubectl"], "{}", out.text);
        println!("ok: the desktop is candidate@base, without kubectl");
        let out = on_base(&format!("ssh -o BatchMode=yes {cluster} 'kubectl config current-context && kubectl get nodes --no-headers | wc -l && yq --version'")).await;
        let lines: Vec<&str> = out.text.lines().collect();
        assert!(out.exit_code == 0 && lines.first() == Some(&cluster) && out.text.contains("mikefarah"), "{}", out.text);
        println!("ok: `ssh <cluster>` from base reaches the task host on its context, with yq");
        let out = on_base("cat /usr/share/firefox-esr/distribution/policies.json").await;
        assert!(out.text.contains("https://kubernetes.io/docs*") && out.text.contains("https://gateway-api.sigs.k8s.io*"), "{}", out.text);
        println!("ok: Firefox allows the CKA documentation only");

        // The candidate's day on base: ssh to the task host and the nodes, the
        // hosts' tools, the browser, the editor, the keyboard; how fast, how big
        let started = std::time::Instant::now();
        let out = on_base(&format!("ssh -o BatchMode=yes {cluster} true")).await;
        assert_eq!(out.exit_code, 0, "{}", out.text);
        println!("ok: ssh to the task host in {} ms", started.elapsed().as_millis());
        let out = on_base(&format!(
            "ssh -o BatchMode=yes {cluster}-control-plane 'test -f /etc/kubernetes/manifests/etcd.yaml && echo static-pods' \
             && ssh -o BatchMode=yes {cluster}-worker hostname"
        ))
        .await;
        assert!(out.exit_code == 0 && out.text.contains("static-pods") && out.text.contains(&format!("{cluster}-worker")), "{}", out.text);
        println!("ok: ssh from base to the nodes");
        let out = on_base(&format!(
            "ssh -o BatchMode=yes {cluster} bash -s <<'EOF'\n\
             bash -ic 'type k; complete -p k' 2>/dev/null\n\
             helm version --short\n\
             etcdctl version | head -1\n\
             etcdutl version | head -1\n\
             man -w ls\n\
             EOF"
        ))
        .await;
        for expected in ["k is aliased to `kubectl'", "complete", "v3.", "etcdctl version", "etcdutl version", "/usr/share/man"] {
            assert!(out.text.contains(expected), "no {expected:?} in {}", out.text);
        }
        println!("ok: the task host has k (with completion), helm, etcdctl, etcdutl, man");
        let out = on_base(
            "python3 -c \"import urllib.request as u; print(u.urlopen('https://kubernetes.io/pagefind/pagefind-entry.json', timeout=20).status)\"",
        )
        .await;
        assert_eq!(out.text.trim(), "200", "{}", out.text);
        println!("ok: kubernetes.io search (Pagefind) is reachable from base");
        let out = on_base(
            "codium --no-sandbox --version | head -1 && ! grep -q extensionsGallery /usr/share/codium/resources/app/product.json && command -v onboard",
        )
        .await;
        assert_eq!(out.exit_code, 0, "{}", out.text);
        println!("ok: VSCodium {} (no extension marketplace) and the virtual keyboard", out.text.lines().next().unwrap_or_default());
        // A closed window's orphans (here a shell's child) are reaped, not left as zombies
        let out = on_base("sh -c 'sleep 0.2 &' ; sleep 1; ps -eo stat= | grep -c '^Z' || true").await;
        assert_eq!(out.text.trim(), "0", "zombies on the desktop: {}", out.text);
        println!("ok: the desktop reaps orphaned processes");
        let started = std::time::Instant::now();
        assert_eq!(on_base("DISPLAY=:1 nohup firefox-esr >/tmp/firefox.log 2>&1 &").await.exit_code, 0);
        eventually("Firefox runs on the desktop", 30, async || {
            on_base("pgrep -f firefox-esr >/dev/null && ! grep -qiE 'crash|segfault' /tmp/firefox.log").await.exit_code == 0
        })
        .await;
        println!("  firefox up in {} ms", started.elapsed().as_millis());
        let stats = std::process::Command::new("docker")
            .env("PATH", runtime::docker::cli_path())
            .args(["stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}} {{.CPUPerc}}"])
            .output()
            .unwrap();
        let containers = [desktop.to_string(), f.jumphost.name.clone(), format!("{cluster}-control-plane"), format!("{cluster}-worker")];
        for line in String::from_utf8_lossy(&stats.stdout).lines().filter(|l| containers.iter().any(|c| l.starts_with(&format!("{c} ")))) {
            println!("  {line}");
        }
        assert_eq!(on_base("command -v codium").await.exit_code, 0);
        runtime::desktop::reset(&docker, desktop).await.unwrap();
        // VNC itself must be back, not just the container (a stale X lock once
        // kept Xvnc down while websockify kept the container up)
        eventually("Reset desktop brings back VNC, VSCodium and the same allowed docs", 30, async || {
            runtime::desktop::session(&docker, desktop).await.ok().flatten().is_some()
                && on_base("exec 3<>/dev/tcp/127.0.0.1/5901 && grep -q kubernetes.io/docs /usr/share/firefox-esr/distribution/policies.json").await.exit_code == 0
        })
        .await;
        let solution = exams.solution(question).unwrap();
        let docker = runtime::docker::connect().await.unwrap();
        let (exit, out) =
            lab::checks::run_script(&docker, &f.jumphost.name, cluster, &solution.run, 300).await.unwrap();
        assert_eq!(exit, 0, "{out}");
        assert!(exams.check_question(question).await.unwrap().iter().all(|c| c.passed));
        println!("ok: practice check passes after solving");
        exams.submit().unwrap();
        eventually("practice graded 100%", 60, async || {
            matches!(exams.state(), ExamState::Finished { ref result, .. } if result.score == 100.0 && result.passed)
        })
        .await;
        let ExamState::Finished { result, .. } = exams.state() else { unreachable!() };
        // Exactly what was done above: not ckdry's own restarts or kind's execs
        assert!(result.outside.len() == 2 && !result.outside.iter().any(|o| o.contains("disconnected")), "{:?}", result.outside);
        println!("ok: the result lists what was done outside the exam desktop: {:?}", result.outside);
        eventually("the nodes' memory measured", 30, async || store.footprint().unwrap().control_plane_mb > 0).await;
        println!("ok: measured the nodes: {:?}", store.footprint().unwrap());
        exams.end().await.unwrap();
        assert!(matches!(exams.state(), ExamState::Idle) && !f.kind.owned_clusters().contains(&cluster.to_string()));
        assert!(runtime::desktop::session(&runtime::docker::connect().await.unwrap(), desktop).await.unwrap().is_none());
        println!("ok: ending removes the clusters and the desktop");

        // Exam: nothing hidden leaks, nothing to check, unsolved scores 0
        exams.start("core/one", Mode::Exam, true).await.unwrap();
        wait_running().await;
        let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
        assert!(ends_at.is_some() && attempt.questions[0].hints.is_empty());
        assert!(exams.check_question(question).await.is_err() && exams.solution(question).is_err());
        assert!(exams.coach_subject(question, false).is_err());
        println!("ok: exam mode hides hints, checks, solutions and the coach");
        // Quitting the app mid-exam: work in progress on the task host and in
        // the cluster, everything stopped (as on quit), then a new engine on
        // the same data resumes it with that work intact
        let docker = runtime::docker::connect().await.unwrap();
        let work = format!("mkdir -p /tmp/exam && echo in-progress > /tmp/exam/answer.txt && kubectl --context {cluster} create configmap work-in-progress");
        assert_eq!(lab::checks::run_script(&docker, &f.jumphost.name, cluster, &work, 60).await.unwrap().0, 0);
        let nodes = docker
            .list_containers(Some(bollard::query_parameters::ListContainersOptions {
                filters: Some(std::collections::HashMap::from([("label".to_string(), vec![format!("io.x-k8s.kind.cluster={cluster}")])])),
                ..Default::default()
            }))
            .await
            .unwrap();
        // Quitting the app: the guard stops reacting first, as on RunEvent::Exit
        guard.suspend();
        let mut stopped: Vec<String> = nodes.into_iter().flat_map(|c| c.names.unwrap_or_default()).map(|n| n.trim_start_matches('/').to_string()).collect();
        stopped.extend([f.jumphost.name.clone(), desktop.to_string()]);
        for name in &stopped {
            docker.stop_container(name, None::<bollard::query_parameters::StopContainerOptions>).await.unwrap();
        }
        println!("ok: quit mid-exam, {} containers stopped", stopped.len());
        let reopen = || {
            Arc::new(Exams::new(lab::load::load(&pack_dir).0.unwrap(), f.kind.clone(), f.infra.clone(), f.jumphost.clone(), desktop, Arc::new(store::Store::open(&db).unwrap()), |_: &ExamState| {}, runtime::activity::Activities::silent(), guard.clone()))
        };
        let resumed = reopen();
        resumed.restore();
        assert!(matches!(resumed.state(), ExamState::Resuming { .. }));
        eventually("a running exam survives restarting the app (resuming, then running)", 90, async || {
            matches!(resumed.state(), ExamState::Running { attempt: ref again, ends_at: again_ends, .. }
                if again.id == attempt.id && again_ends == ends_at)
        })
        .await;
        assert!(resumed.solution(question).is_err());
        let (exit, out) = lab::checks::run_script(
            &docker,
            &f.jumphost.name,
            cluster,
            "cat /tmp/exam/answer.txt && kubectl get configmap work-in-progress -o name",
            60,
        )
        .await
        .unwrap();
        assert!(exit == 0 && out.contains("in-progress") && out.contains("configmap/work-in-progress"), "{out}");
        println!("ok: the work on the task host and in the cluster survived");
        eventually("the desktop's VNC is back after the restart", 30, async || {
            exec::run(&docker, desktop, &["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/5901"], &[], None).await.is_ok_and(|o| o.exit_code == 0)
        })
        .await;
        exams.submit().unwrap();
        eventually("exam graded, unsolved fails", 60, async || {
            matches!(exams.state(), ExamState::Finished { ref result, .. } if !result.passed)
        })
        .await;
        // Quitting and resuming (kind reading kubeconfigs) is ckdry's own doing
        let ExamState::Finished { result, .. } = exams.state() else { unreachable!() };
        assert!(result.outside.is_empty(), "{:?}", result.outside);
        println!("ok: nothing outside noted for an attempt only ckdry touched");
        assert!(exams.solution(question).is_ok());
        println!("ok: solution available after the result");
        exams.end().await.unwrap();
        assert_eq!(exams.history().len(), 2);
        println!("ok: both attempts in history");
        let after = reopen();
        after.restore();
        assert!(matches!(after.state(), ExamState::Idle));
        println!("ok: nothing to resume once the attempt has ended");
        f.teardown().await;
    }

    /// The committed bindings must match the commands (also runs in CI).
    #[test]
    fn bindings_export() {
        specta_builder()
            .export(typescript(), std::env::temp_dir().join("ckdry-bindings.ts"))
            .unwrap();
    }
}
