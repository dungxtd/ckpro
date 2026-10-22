mod docker;
mod kind;
mod lab;
mod terminal;

use tauri::{AppHandle, State};
use terminal::Terminals;

/// Docker engine version, or why it is unreachable.
#[tauri::command]
async fn docker_status() -> Result<String, String> {
    let docker = docker::connect().await?;
    let version = docker.version().await.map_err(|e| e.to_string())?;
    Ok(format!(
        "{} {}",
        version.platform.map(|p| p.name).unwrap_or_default(),
        version.version.unwrap_or_default()
    ))
}

#[tauri::command]
async fn create_cluster(app: AppHandle, name: String, workers: u8) -> Result<(), String> {
    kind::create(&app, &name, workers).await
}

#[tauri::command]
async fn delete_cluster(app: AppHandle, name: String) -> Result<(), String> {
    kind::delete(&app, &name).await
}

/// Shell on a cluster node, with kubectl pointed at the cluster.
#[tauri::command]
async fn terminal_open(
    app: AppHandle,
    terminals: State<'_, Terminals>,
    container: String,
) -> Result<String, String> {
    let env = vec!["KUBECONFIG=/etc/kubernetes/admin.conf".into(), "TERM=xterm-256color".into()];
    terminal::open(app, &terminals, &container, env).await
}

#[tauri::command]
async fn terminal_write(terminals: State<'_, Terminals>, id: String, data: String) -> Result<(), String> {
    terminal::write(&terminals, &id, &data).await
}

#[tauri::command]
async fn terminal_resize(
    terminals: State<'_, Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal::resize(&terminals, &id, cols, rows).await
}

#[tauri::command]
async fn terminal_close(terminals: State<'_, Terminals>, id: String) -> Result<(), String> {
    terminal::close(&terminals, &id).await;
    Ok(())
}

#[tauri::command]
async fn run_script(cluster: String, path: String) -> Result<lab::ScriptResult, String> {
    lab::run_script(&cluster, &path).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Terminals::default())
        .invoke_handler(tauri::generate_handler![
            docker_status,
            create_cluster,
            delete_cluster,
            terminal_open,
            terminal_write,
            terminal_resize,
            terminal_close,
            run_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
        let app = tauri::test::mock_app();
        let handle = app.handle().clone();
        let name = "ckx-spike";

        println!("docker: {}", docker_status().await.unwrap());
        let started = std::time::Instant::now();
        kind::create(&handle, name, 1).await.unwrap();
        println!("created in {:?}", started.elapsed());

        // A CK-X validation script: the namespace does not exist yet, so it must fail
        let ckx = "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
        let failing = lab::run_script(name, ckx).await.unwrap();
        println!("before: exit {} {}", failing.exit_code, failing.output.trim());
        assert_ne!(failing.exit_code, 0);

        // After creating it, the same script passes
        let mut setup = tempfile();
        writeln!(setup.1, "kubectl create namespace app-team1").unwrap();
        assert_eq!(lab::run_script(name, &setup.0).await.unwrap().exit_code, 0);
        let passing = lab::run_script(name, ckx).await.unwrap();
        println!("after: exit {} {}", passing.exit_code, passing.output.trim());
        assert_eq!(passing.exit_code, 0);

        kind::delete(&handle, name).await.unwrap();
    }

    fn tempfile() -> (String, std::fs::File) {
        let path = std::env::temp_dir().join("ckx-spike-setup.sh");
        let file = std::fs::File::create(&path).unwrap();
        (path.to_string_lossy().into_owned(), file)
    }
}
