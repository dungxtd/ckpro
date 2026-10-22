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

/// Pushed to the UI on every environment change.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct EnvChanged(EnvState);

/// Typed IPC: debug builds regenerate `desktop/src/tauri/bindings.ts`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(tauri_specta::collect_events![EnvChanged])
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
    ])
}

fn typescript() -> specta_typescript::Typescript {
    specta_typescript::Typescript::default().header("// @ts-nocheck")
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
            let kind = Arc::new(cluster::kind::Kind::new(app.path().app_data_dir()?));
            let handle = app.handle().clone();
            let env = Arc::new(Env::new(move |state| {
                let _ = EnvChanged(state.clone()).emit(&handle);
            }));
            runtime::monitor::start(env.clone(), kind.clone());
            app.manage(kind);
            app.manage(env);
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "ckiu started");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // Shells die with the app; clusters are left for the next
                // start to reconcile
                let terminals = app.state::<terminal::Terminals>();
                tauri::async_runtime::block_on(terminals.close_all());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// End-to-end against the host Docker engine; slow, so opt-in:
    /// `cargo test -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn cluster_lifecycle_and_lab_script() {
        let kind = cluster::kind::Kind::new(std::env::temp_dir().join("ckiu-e2e"));
        let log = |line: String| println!("  kind: {line}");
        let name = "ckiu-e2e";

        let docker = runtime::docker::connect().await.unwrap();
        println!("docker: {:?}", docker.version().await.unwrap().version);
        let started = std::time::Instant::now();
        kind.create(name, 1, &log).await.unwrap();
        println!("created in {:?}", started.elapsed());

        // Nodes belong to the ckiu compose project, one service per node
        for node in [format!("{name}-control-plane"), format!("{name}-worker")] {
            let labels = docker.inspect_container(&node, None).await.unwrap().config.unwrap().labels.unwrap();
            assert_eq!(labels.get("com.docker.compose.project").map(String::as_str), Some("ckiu"), "{node}");
            assert_eq!(labels.get("com.docker.compose.service"), Some(&node), "{node}");
        }
        println!("ok: nodes carry the ckiu compose labels");

        // A CK-X validation script: the namespace does not exist yet, so it must fail
        let ckiu = "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
        assert_ne!(lab::script::run(name, ckiu).await.unwrap().exit_code, 0);

        let setup = std::env::temp_dir().join("ckiu-e2e-setup.sh");
        writeln!(std::fs::File::create(&setup).unwrap(), "kubectl create namespace app-team1").unwrap();
        assert_eq!(lab::script::run(name, setup.to_str().unwrap()).await.unwrap().exit_code, 0);
        assert_eq!(lab::script::run(name, ckiu).await.unwrap().exit_code, 0);

        kind.delete(name, &log).await.unwrap();
    }

    /// The monitor notices nodes going away and coming back, live:
    /// `cargo test monitor -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn monitor_tracks_node_failure_and_repair() {
        use runtime::model::{ContainerStatus, Readiness};
        use std::time::Duration;

        let kind = Arc::new(cluster::kind::Kind::new(std::env::temp_dir().join("ckiu-e2e-monitor")));
        let log = |_: String| {};
        let name = "ckiu-mon";
        let env = Arc::new(Env::new(|state| {
            let nodes: Vec<String> = state
                .clusters
                .iter()
                .flat_map(|c| &c.nodes)
                .map(|n| format!("{}={:?}/{:?}", n.name, n.container, n.ready))
                .collect();
            println!("  state: docker={:?} nodes={nodes:?} issues={}", state.docker, state.issues.len());
        }));
        kind.create(name, 1, &log).await.unwrap();
        runtime::monitor::start(env.clone(), kind.clone());

        let wait = |what: &'static str, done: Box<dyn Fn(&EnvState) -> bool>| {
            let env = env.clone();
            async move {
                for _ in 0..240 {
                    if done(&env.snapshot()) {
                        println!("ok: {what}");
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                panic!("timed out waiting for: {what}");
            }
        };
        let worker = format!("{name}-worker");

        wait("all nodes Ready", Box::new(|s| {
            s.clusters.first().is_some_and(|c| c.nodes.len() == 2 && c.nodes.iter().all(|n| n.ready == Readiness::Ready))
        }))
        .await;

        let docker = runtime::docker::connect().await.unwrap();
        docker.stop_container(&worker, None::<bollard::query_parameters::StopContainerOptions>).await.unwrap();
        let w = worker.clone();
        wait("stopped worker reported as an issue", Box::new(move |s| {
            s.clusters.iter().flat_map(|c| &c.nodes).any(|n| n.name == w && n.container == ContainerStatus::Stopped)
                && s.issues.iter().any(|i| i.component == w)
        }))
        .await;

        runtime::reconcile::repair(&docker, name).await.unwrap();
        wait("worker Ready again, no issues", Box::new(|s| {
            s.issues.is_empty()
                && s.clusters.first().is_some_and(|c| c.nodes.iter().all(|n| n.ready == Readiness::Ready))
        }))
        .await;

        kind.delete(name, &log).await.unwrap();
        wait("cluster gone from the state", Box::new(|s| s.clusters.is_empty())).await;
    }

    /// A kind cluster created elsewhere is shown as foreign, its name is
    /// blocked, and adopting it makes it a managed cluster:
    /// `cargo test foreign -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn foreign_cluster_is_detected_and_adopted() {
        use std::time::Duration;
        let tmp = std::env::temp_dir();
        let elsewhere = cluster::kind::Kind::new(tmp.join("ckiu-e2e-elsewhere"));
        let ours = Arc::new(cluster::kind::Kind::new(tmp.join("ckiu-e2e-ours")));
        let log = |_: String| {};
        let name = "ckiu-foreign";
        elsewhere.create(name, 0, &log).await.unwrap();

        let env = Arc::new(Env::new(|_| {}));
        runtime::monitor::start(env.clone(), ours.clone());
        let wait = |what: &'static str, done: Box<dyn Fn(&EnvState) -> bool>| {
            let env = env.clone();
            async move {
                for _ in 0..120 {
                    if done(&env.snapshot()) {
                        println!("ok: {what}");
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                panic!("timed out waiting for: {what}");
            }
        };

        wait("listed as foreign", Box::new(|s| s.foreign_clusters.iter().any(|c| c == name))).await;
        let checks = runtime::preflight::check(&env.snapshot(), name, 0);
        assert!(checks.iter().any(|c| c.name == "Name" && !c.ok), "name should be blocked");
        println!("ok: preflight blocks the name");

        ours.adopt(name).await.unwrap();
        env.request_resync();
        wait("managed after adopt", Box::new(|s| {
            s.foreign_clusters.is_empty() && s.clusters.iter().any(|c| c.name == name)
        }))
        .await;

        ours.delete(name, &log).await.unwrap();
    }

    /// The committed bindings must match the commands (also runs in CI).
    #[test]
    fn bindings_export() {
        specta_builder()
            .export(typescript(), std::env::temp_dir().join("ckiu-bindings.ts"))
            .unwrap();
    }
}
