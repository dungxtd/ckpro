mod cluster;
mod commands;
mod error;
mod lab;
mod observability;
mod runtime;
mod terminal;

use tauri::{Manager, RunEvent};

/// Typed IPC: debug builds regenerate `desktop/src/tauri/bindings.ts`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::docker_status,
        commands::create_cluster,
        commands::delete_cluster,
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
        .invoke_handler(builder.invoke_handler())
        .setup(|app| {
            if let Ok(dir) = app.path().app_log_dir() {
                observability::init(&dir);
            }
            let data_dir = app.path().app_data_dir()?;
            app.manage(cluster::kind::Kind::new(data_dir));
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "ckiu desktop started");
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

        // A CK-X validation script: the namespace does not exist yet, so it must fail
        let ckiu = "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
        assert_ne!(lab::script::run(name, ckiu).await.unwrap().exit_code, 0);

        let setup = std::env::temp_dir().join("ckiu-e2e-setup.sh");
        writeln!(std::fs::File::create(&setup).unwrap(), "kubectl create namespace app-team1").unwrap();
        assert_eq!(lab::script::run(name, setup.to_str().unwrap()).await.unwrap().exit_code, 0);
        assert_eq!(lab::script::run(name, ckiu).await.unwrap().exit_code, 0);

        kind.delete(name, &log).await.unwrap();
    }

    /// The committed bindings must match the commands (also runs in CI).
    #[test]
    fn bindings_export() {
        specta_builder()
            .export(typescript(), std::env::temp_dir().join("ckiu-bindings.ts"))
            .unwrap();
    }
}
