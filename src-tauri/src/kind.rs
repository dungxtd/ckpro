//! Exam clusters: a pinned kind binary managed by the app, cluster configs
//! generated here, and create/delete with progress streamed to the UI.

use crate::docker;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const KIND_VERSION: &str = "v0.33.0";
/// Kubernetes version of the exam (CKA currently runs on v1.35).
pub const NODE_IMAGE: &str = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0";

#[derive(Clone, Serialize)]
pub struct ClusterLog {
    pub cluster: String,
    pub line: String,
}

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn kubeconfig_path<R: Runtime>(app: &AppHandle<R>, cluster: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(format!("kubeconfig-{cluster}")))
}

fn release_asset() -> Result<&'static str, String> {
    Ok(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "kind-darwin-arm64",
        ("macos", "x86_64") => "kind-darwin-amd64",
        ("linux", "aarch64") => "kind-linux-arm64",
        ("linux", "x86_64") => "kind-linux-amd64",
        ("windows", "x86_64") => "kind-windows-amd64",
        (os, arch) => return Err(format!("unsupported platform {os}/{arch}")),
    })
}

/// Path to the pinned kind binary, downloaded on first use.
pub async fn ensure_kind<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let bin = data_dir(app)?.join(format!("kind-{KIND_VERSION}"));
    if bin.exists() {
        return Ok(bin);
    }
    let url = format!(
        "https://github.com/kubernetes-sigs/kind/releases/download/{KIND_VERSION}/{}",
        release_asset()?
    );
    let bytes = reqwest::get(&url)
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("downloading kind: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("downloading kind: {e}"))?;
    let tmp = bin.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &bin).map_err(|e| e.to_string())?;
    Ok(bin)
}

/// kind config: one control plane plus `workers` workers.
pub fn cluster_config(workers: u8) -> String {
    let mut config = String::from(
        "kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnodes:\n  - role: control-plane\n",
    );
    for _ in 0..workers {
        config.push_str("  - role: worker\n");
    }
    config
}

/// Run kind, forwarding every output line to the UI as a `cluster-log` event.
async fn run_kind<R: Runtime>(app: &AppHandle<R>, cluster: &str, args: &[&str]) -> Result<(), String> {
    let kind = ensure_kind(app).await?;
    let mut child = Command::new(&kind)
        .args(args)
        .env("PATH", docker::cli_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("starting kind: {e}"))?;

    let emit = |line: String| {
        let _ = app.emit(
            "cluster-log",
            ClusterLog { cluster: cluster.to_string(), line },
        );
    };
    let mut out = BufReader::new(child.stdout.take().unwrap()).lines();
    let mut err = BufReader::new(child.stderr.take().unwrap()).lines();
    loop {
        tokio::select! {
            Ok(Some(line)) = out.next_line() => emit(line),
            Ok(Some(line)) = err.next_line() => emit(line),
            else => break,
        }
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("kind {} failed ({status})", args.join(" ")))
    }
}

pub async fn create<R: Runtime>(app: &AppHandle<R>, name: &str, workers: u8) -> Result<(), String> {
    validate_name(name)?;
    let config = data_dir(app)?.join(format!("kind-{name}.yaml"));
    std::fs::write(&config, cluster_config(workers)).map_err(|e| e.to_string())?;
    let kubeconfig = kubeconfig_path(app, name)?;
    run_kind(
        app,
        name,
        &[
            "create", "cluster", "--name", name, "--image", NODE_IMAGE,
            "--config", path_str(&config)?, "--kubeconfig", path_str(&kubeconfig)?,
            "--wait", "120s",
        ],
    )
    .await
}

pub async fn delete<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<(), String> {
    validate_name(name)?;
    let kubeconfig = kubeconfig_path(app, name)?;
    run_kind(
        app,
        name,
        &["delete", "cluster", "--name", name, "--kubeconfig", path_str(&kubeconfig)?],
    )
    .await?;
    let _ = std::fs::remove_file(kubeconfig);
    Ok(())
}

fn validate_name(name: &str) -> Result<(), String> {
    let ok = name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(format!("invalid cluster name '{name}'")) }
}

fn path_str(path: &Path) -> Result<&str, String> {
    path.to_str().ok_or_else(|| format!("non UTF-8 path {}", path.display()))
}
