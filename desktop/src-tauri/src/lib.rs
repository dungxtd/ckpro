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
            let data_dir = app.path().app_data_dir()?;
            let kind = Arc::new(cluster::kind::Kind::new(data_dir.clone()));
            app.manage(Arc::new(runtime::infra::Infra::new(data_dir)));
            let handle = app.handle().clone();
            let env = Arc::new(Env::new(move |state| {
                let _ = EnvChanged(state.clone()).emit(&handle);
            }));
            runtime::monitor::start(env.clone(), kind.clone());
            app.manage(kind);
            app.manage(env);
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "ckdry started");
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
    use runtime::{exec, infra};
    use std::time::Duration;

    /// Opt-in end-to-end tests against the host Docker engine (slow; they
    /// replace the app's jumphost): `cargo test -- --ignored --nocapture`
    struct Fixture {
        kind: Arc<cluster::kind::Kind>,
        infra: Arc<infra::Infra>,
    }

    fn fixture(dir: &str) -> Fixture {
        let dir = std::env::temp_dir().join(dir);
        Fixture {
            kind: Arc::new(cluster::kind::Kind::new(dir.clone())),
            infra: Arc::new(infra::Infra::new(dir)),
        }
    }

    fn log(line: String) {
        println!("  | {line}");
    }

    /// Shell command on the jumphost, as the candidate would type it.
    async fn on_jumphost(cmd: &str) -> exec::Output {
        let docker = runtime::docker::connect().await.unwrap();
        exec::run(&docker, infra::JUMPHOST, &["bash", "-lc", cmd], &[], None).await.unwrap()
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
        let f = fixture("ckdry-e2e");
        let name = "ckdry-e2e";
        let started = std::time::Instant::now();
        cluster::lifecycle::create(&f.kind, &f.infra, name, 1, &log, &Default::default()).await.unwrap();
        println!("created in {:?}", started.elapsed());

        let docker = runtime::docker::connect().await.unwrap();
        for container in [format!("{name}-control-plane"), format!("{name}-worker"), infra::JUMPHOST.into()] {
            let labels = docker.inspect_container(&container, None).await.unwrap().config.unwrap().labels.unwrap();
            assert_eq!(labels.get("com.docker.compose.project").map(String::as_str), Some("ckdry"), "{container}");
        }
        println!("ok: nodes and jumphost are in the ckdry compose project");

        let out = on_jumphost("kubectl config current-context && kubectl get nodes --no-headers | wc -l").await;
        assert_eq!(out.text.split_whitespace().collect::<Vec<_>>(), [name, "2"], "{}", out.text);
        println!("ok: jumphost kubectl has context {name} with 2 nodes");

        let out = on_jumphost(&format!(
            "ssh {name}-worker hostname && ssh {name}-control-plane 'ls /etc/kubernetes/manifests; systemctl is-active kubelet'"
        ))
        .await;
        assert!(out.text.contains(&format!("{name}-worker")) && out.text.contains("etcd.yaml") && out.text.contains("active"), "{}", out.text);
        println!("ok: ssh to nodes, static pods and kubelet visible");

        let out = on_jumphost(&format!(
            "d=/root/.ckdry/etcd/{name}; etcdctl --endpoints=https://{name}-control-plane:2379 --cacert=$d/ca.crt --cert=$d/client.crt --key=$d/client.key endpoint health"
        ))
        .await;
        assert!(out.text.contains("is healthy"), "{}", out.text);
        println!("ok: etcdctl from the jumphost");

        eventually("kubectl top nodes (metrics-server)", 60, async || {
            on_jumphost("kubectl top nodes").await.exit_code == 0
        })
        .await;

        let out = on_jumphost("kubectl run web --image=nginx:alpine && kubectl wait --for=condition=Ready pod/web --timeout=180s").await;
        assert_eq!(out.exit_code, 0, "{}", out.text);
        let catalog = exec::run(&docker, infra::MIRRORS[0].0, &["wget", "-qO-", "http://127.0.0.1:5000/v2/_catalog"], &[], None).await.unwrap();
        assert!(catalog.text.contains("library/nginx"), "{}", catalog.text);
        println!("ok: image pulled through the docker.io cache");

        // A CK-X validation script, graded on the jumphost: FAIL, then PASS
        let ckx = "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
        assert_ne!(lab::script::run(ckx).await.unwrap().exit_code, 0);
        assert_eq!(on_jumphost("kubectl create namespace app-team1").await.exit_code, 0);
        assert_eq!(lab::script::run(ckx).await.unwrap().exit_code, 0);
        println!("ok: lab script graded on the jumphost");

        cluster::lifecycle::delete(&f.kind, &f.infra, name, &log).await.unwrap();
        let out = on_jumphost("kubectl config get-contexts -o name 2>&1").await;
        assert!(!out.text.contains(name), "{}", out.text);
        println!("ok: context removed from the jumphost");
    }

    /// The monitor notices nodes going away and coming back, live:
    /// `cargo test monitor -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn monitor_tracks_node_failure_and_repair() {
        use runtime::model::{ContainerStatus, Readiness};
        let f = fixture("ckdry-e2e-monitor");
        let name = "ckdry-mon";
        let env = Arc::new(Env::new(|_| {}));
        cluster::lifecycle::create(&f.kind, &f.infra, name, 1, &log, &Default::default()).await.unwrap();
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

        cluster::lifecycle::delete(&f.kind, &f.infra, name, &log).await.unwrap();
        eventually("cluster gone from the state", 30, async || env.snapshot().clusters.is_empty()).await;
    }

    /// The committed bindings must match the commands (also runs in CI).
    #[test]
    fn bindings_export() {
        specta_builder()
            .export(typescript(), std::env::temp_dir().join("ckdry-bindings.ts"))
            .unwrap();
    }
}
