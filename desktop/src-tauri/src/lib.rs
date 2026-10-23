mod cli;
mod cluster;
mod commands;
mod error;
mod lab;
mod observability;
mod runtime;
mod terminal;

use runtime::model::{Env, EnvState};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tauri_specta::Event;

/// Pushed to the UI on every exam state change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct ExamChanged(lab::exam::ExamState);

/// Pushed to the UI on every environment change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct EnvChanged(EnvState);

/// Typed IPC: debug builds regenerate `desktop/src/tauri/bindings.ts`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(tauri_specta::collect_events![EnvChanged, ExamChanged])
        .commands(tauri_specta::collect_commands![
        commands::env_state,
        commands::preflight,
        commands::create_cluster,
        commands::delete_cluster,
        commands::cancel_cluster,
        commands::repair_cluster,
        commands::adopt_cluster,
        commands::run_script,
        commands::terminal_open,
        commands::terminal_write,
        commands::terminal_resize,
        commands::terminal_close,
        commands::list_exams,
        commands::exam_state,
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
fn load_pack(resource_dir: Option<std::path::PathBuf>) -> lab::load::LoadedPack {
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
        .manage(terminal::Terminals::default())
        .manage(cluster::jobs::Jobs::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            if let Ok(dir) = app.path().app_log_dir() {
                observability::init(&dir);
            }
            builder.mount_events(app);
            let data_dir = data_dir();
            let kind = Arc::new(cluster::kind::Kind::new(data_dir.clone()));
            app.manage(Arc::new(runtime::infra::Infra::new(data_dir.clone())));
            app.manage(Arc::new(runtime::jumphost::Jumphost::app(&data_dir)));
            let handle = app.handle().clone();
            let env = Arc::new(Env::new(move |state| {
                let _ = EnvChanged(state.clone()).emit(&handle);
            }));
            runtime::monitor::start(env.clone(), kind.clone());
            let infra = app.state::<Arc<runtime::infra::Infra>>().inner().clone();
            let jumphost = app.state::<Arc<runtime::jumphost::Jumphost>>().inner().clone();
            let exams_handle = app.handle().clone();
            let exams = Arc::new(lab::exam::Exams::new(
                load_pack(app.path().resource_dir().ok()),
                kind.clone(),
                infra,
                jumphost,
                crate::data_dir().join("history"),
                move |state| {
                    let _ = ExamChanged(state.clone()).emit(&exams_handle);
                },
            ));
            exams.restore();
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
    /// and lab scripts graded there.
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

        // A CK-X validation script, graded on the jumphost: FAIL, then PASS
        let ckx = "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
        assert_ne!(lab::script::run(&f.jumphost.name, ckx).await.unwrap().exit_code, 0);
        assert_eq!(f.on_jumphost("kubectl create namespace app-team1").await.exit_code, 0);
        assert_eq!(lab::script::run(&f.jumphost.name, ckx).await.unwrap().exit_code, 0);
        println!("ok: lab script graded on the jumphost");

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
        runtime::reconcile::on_startup(&docker, &f.kind).await;
        eventually("starting again brings back the nodes and the pod", 90, async || {
            let out = f.on_jumphost("kubectl get nodes --no-headers | grep -cw Ready; kubectl get pod web -o jsonpath='{.status.phase}'").await;
            out.text.split_whitespace().collect::<Vec<_>>() == ["2", "Running"]
        })
        .await;

        f.delete(name).await;
        let out = f.on_jumphost("kubectl config get-contexts -o name 2>&1").await;
        assert!(!out.text.contains(name), "{}", out.text);
        println!("ok: context removed from the jumphost");
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
        f.create(name, 1).await;
        runtime::monitor::start(env.clone(), f.kind.clone());
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
    }

    /// A whole attempt through the exam engine, both modes, on a one-question
    /// exam: `cargo test exam_engine -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn exam_engine_practice_and_exam_modes() {
        use lab::exam::{ExamState, Exams, Mode};
        let pack_dir = std::env::temp_dir().join("ckdry-e2e-pack");
        let _ = std::fs::remove_dir_all(&pack_dir);
        let core = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        std::fs::create_dir_all(pack_dir.join("questions/cka")).unwrap();
        std::fs::create_dir_all(pack_dir.join("exams")).unwrap();
        std::fs::copy(core.join("pack.yaml"), pack_dir.join("pack.yaml")).unwrap();
        std::fs::copy(core.join("questions/cka/rbac-ci-token.yaml"), pack_dir.join("questions/cka/rbac-ci-token.yaml")).unwrap();
        std::fs::write(pack_dir.join("exams/one.yaml"), "title: One\ncertification: cka\nquestions: [core/cka/rbac-ci-token]\n").unwrap();
        let (pack, findings) = lab::load::load(&pack_dir);
        assert!(findings.is_empty(), "{:?}", findings.iter().map(|f| &f.message).collect::<Vec<_>>());

        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("ckdry-e2e-history"));
        let f = fixture("exam");
        let exams = Arc::new(Exams::new(pack.unwrap(), f.kind.clone(), f.infra.clone(), f.jumphost.clone(), std::env::temp_dir().join("ckdry-e2e-history"), |s: &ExamState| {
            if let ExamState::Preparing { step, .. } = s { println!("  | {step}"); }
        }));
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
        exams.start("core/one", Mode::Practice, true).await.unwrap();
        wait_running().await;
        let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
        assert!(ends_at.is_none() && !attempt.questions[0].hints.is_empty());
        assert!(exams.check_question(question).await.unwrap().iter().all(|c| !c.passed));
        println!("ok: practice check fails before solving");
        let solution = exams.solution(question).unwrap();
        let docker = runtime::docker::connect().await.unwrap();
        let (exit, out) =
            lab::checks::run_script(&docker, &f.jumphost.name, "k8s", &solution.run, 300).await.unwrap();
        assert_eq!(exit, 0, "{out}");
        assert!(exams.check_question(question).await.unwrap().iter().all(|c| c.passed));
        println!("ok: practice check passes after solving");
        exams.submit().unwrap();
        eventually("practice graded 100%", 60, async || {
            matches!(exams.state(), ExamState::Finished { ref result, .. } if result.score == 100.0 && result.passed)
        })
        .await;
        exams.end().await.unwrap();
        assert!(matches!(exams.state(), ExamState::Idle) && !f.kind.owned_clusters().contains(&"k8s".to_string()));
        println!("ok: ending removes the clusters");

        // Exam: nothing hidden leaks, nothing to check, unsolved scores 0
        exams.start("core/one", Mode::Exam, true).await.unwrap();
        wait_running().await;
        let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
        assert!(ends_at.is_some() && attempt.questions[0].hints.is_empty());
        assert!(exams.check_question(question).await.is_err() && exams.solution(question).is_err());
        println!("ok: exam mode hides hints, checks and solutions");
        // Quitting the app mid-exam: a new engine on the same data resumes it
        let reopen = || {
            Arc::new(Exams::new(lab::load::load(&pack_dir).0.unwrap(), f.kind.clone(), f.infra.clone(), f.jumphost.clone(), std::env::temp_dir().join("ckdry-e2e-history"), |_: &ExamState| {}))
        };
        let resumed = reopen();
        resumed.restore();
        let ExamState::Running { attempt: again, ends_at: again_ends, .. } = resumed.state() else { panic!("not resumed") };
        assert!(again.id == attempt.id && again_ends == ends_at && resumed.solution(question).is_err());
        println!("ok: a running exam survives restarting the app");
        exams.submit().unwrap();
        eventually("exam graded, unsolved fails", 60, async || {
            matches!(exams.state(), ExamState::Finished { ref result, .. } if !result.passed)
        })
        .await;
        assert!(exams.solution(question).is_ok());
        println!("ok: solution available after the result");
        exams.end().await.unwrap();
        assert_eq!(exams.history().len(), 2);
        println!("ok: both attempts in history");
        let after = reopen();
        after.restore();
        assert!(matches!(after.state(), ExamState::Idle));
        println!("ok: nothing to resume once the attempt has ended");
    }

    /// The committed bindings must match the commands (also runs in CI).
    #[test]
    fn bindings_export() {
        specta_builder()
            .export(typescript(), std::env::temp_dir().join("ckdry-bindings.ts"))
            .unwrap();
    }
}
