//! Exam clusters: a pinned kind binary managed by the app, cluster configs
//! generated here, and create/delete with every output line handed to a sink.

use crate::error::{AppError, AppResult};
use crate::runtime::docker;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const KIND_VERSION: &str = "v0.33.0";
/// Kubernetes version of the exam (CKA currently runs on v1.35).
pub const NODE_IMAGE: &str = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0";

/// Where the app keeps kind, cluster configs and kubeconfigs.
pub struct Kind {
    dir: PathBuf,
}

impl Kind {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { dir: data_dir }
    }

    pub fn kubeconfig(&self, cluster: &str) -> PathBuf {
        self.dir.join(format!("kubeconfig-{cluster}"))
    }

    /// Clusters created by this app: the ones it keeps a kubeconfig for.
    pub fn owned_clusters(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else { return Vec::new() };
        entries
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .filter_map(|f| f.strip_prefix("kubeconfig-").map(str::to_string))
            .collect()
    }

    /// Drop the app's files for a cluster that no longer exists.
    pub fn forget(&self, cluster: &str) {
        let _ = std::fs::remove_file(self.kubeconfig(cluster));
        let _ = std::fs::remove_file(self.dir.join(format!("kind-{cluster}.yaml")));
    }

    /// Path to the pinned kind binary, downloaded on first use.
    async fn binary(&self) -> AppResult<PathBuf> {
        let bin = self.dir.join(format!("kind-{KIND_VERSION}"));
        if bin.exists() {
            return Ok(bin);
        }
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating data dir", e))?;
        let url = format!(
            "https://github.com/kubernetes-sigs/kind/releases/download/{KIND_VERSION}/{}",
            release_asset()?
        );
        tracing::info!(%url, "downloading kind");
        let bytes = reqwest::get(&url)
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| AppError::io("downloading kind", e))?
            .bytes()
            .await
            .map_err(|e| AppError::io("downloading kind", e))?;
        let tmp = bin.with_extension("part");
        std::fs::write(&tmp, &bytes).map_err(|e| AppError::io("saving kind", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| AppError::io("saving kind", e))?;
        }
        std::fs::rename(&tmp, &bin).map_err(|e| AppError::io("saving kind", e))?;
        Ok(bin)
    }

    /// PATH for kind: a `docker` shim first, then the real CLI. kind has no
    /// option to label its node containers, so the shim adds the ckdry compose
    /// labels to every `docker run`; all other commands go straight through.
    fn kind_path(&self) -> AppResult<String> {
        let real = docker::cli().ok_or_else(|| AppError::DockerUnavailable {
            message: "The docker CLI was not found. Install OrbStack or Docker Desktop.".into(),
        })?;
        let shim_dir = self.dir.join("shim");
        std::fs::create_dir_all(&shim_dir).map_err(|e| AppError::io("creating docker shim", e))?;
        let labels: String = docker::compose_labels("$name")
            .into_iter()
            .map(|(k, v)| format!(" --label \"{k}={v}\""))
            .collect();
        let script = format!(
            "#!/bin/sh\n\
             # Written by ckdry: label kind's node containers as part of the ckdry compose project\n\
             if [ \"$1\" = run ]; then\n\
             \x20 shift\n\
             \x20 name=node prev=\n\
             \x20 for a in \"$@\"; do\n\
             \x20   [ \"$prev\" = --name ] && name=\"$a\"\n\
             \x20   case \"$a\" in --name=*) name=\"${{a#--name=}}\" ;; esac\n\
             \x20   prev=\"$a\"\n\
             \x20 done\n\
             \x20 exec '{real}' run{labels} \"$@\"\n\
             fi\n\
             exec '{real}' \"$@\"\n",
            real = real.display(),
        );
        let shim = shim_dir.join("docker");
        if std::fs::read_to_string(&shim).ok().as_deref() != Some(script.as_str()) {
            std::fs::write(&shim, &script).map_err(|e| AppError::io("writing docker shim", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&shim, std::fs::Permissions::from_mode(0o755))
                    .map_err(|e| AppError::io("writing docker shim", e))?;
            }
        }
        Ok(format!("{}:{}", shim_dir.display(), docker::cli_path()))
    }

    /// Run kind, handing every output line to `log`.
    async fn run(&self, args: &[&str], log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        let kind = self.binary().await?;
        let mut child = Command::new(&kind)
            .args(args)
            .env("PATH", self.kind_path()?)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| AppError::cluster(format!("starting kind: {e}")))?;

        let mut out = BufReader::new(child.stdout.take().expect("piped")).lines();
        let mut err = BufReader::new(child.stderr.take().expect("piped")).lines();
        let mut tail = Vec::new();
        loop {
            let line = tokio::select! {
                Ok(Some(line)) = out.next_line() => line,
                Ok(Some(line)) = err.next_line() => line,
                else => break,
            };
            tail.push(line.clone());
            if tail.len() > 5 {
                tail.remove(0);
            }
            log(line);
        }
        let status = child.wait().await.map_err(|e| AppError::cluster(e.to_string()))?;
        if status.success() {
            Ok(())
        } else {
            Err(AppError::cluster(format!(
                "kind {} failed: {}",
                args.first().copied().unwrap_or_default(),
                tail.join(" | ")
            )))
        }
    }

    pub async fn create(
        &self,
        name: &str,
        workers: u8,
        log: &(dyn Fn(String) + Sync),
    ) -> AppResult<()> {
        validate_name(name)?;
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating data dir", e))?;
        let config = self.dir.join(format!("kind-{name}.yaml"));
        std::fs::write(&config, cluster_config(workers))
            .map_err(|e| AppError::io("writing kind config", e))?;
        let kubeconfig = self.kubeconfig(name);
        self.run(
            &[
                "create", "cluster", "--name", name, "--image", NODE_IMAGE,
                "--config", path_str(&config)?, "--kubeconfig", path_str(&kubeconfig)?,
                "--wait", "120s",
            ],
            log,
        )
        .await
    }

    /// Take over an existing kind cluster: keep its kubeconfig, which is what
    /// makes ckdry treat a cluster as its own.
    pub async fn adopt(&self, name: &str) -> AppResult<()> {
        validate_name(name)?;
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating data dir", e))?;
        let output = Command::new(self.binary().await?)
            .args(["get", "kubeconfig", "--name", name])
            .env("PATH", self.kind_path()?)
            .output()
            .await
            .map_err(|e| AppError::cluster(format!("starting kind: {e}")))?;
        if !output.status.success() {
            return Err(AppError::cluster(format!(
                "reading the kubeconfig of '{name}': {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
        std::fs::write(self.kubeconfig(name), output.stdout)
            .map_err(|e| AppError::io("saving kubeconfig", e))
    }

    pub async fn delete(&self, name: &str, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        validate_name(name)?;
        let kubeconfig = self.kubeconfig(name);
        self.run(
            &["delete", "cluster", "--name", name, "--kubeconfig", path_str(&kubeconfig)?],
            log,
        )
        .await?;
        let _ = std::fs::remove_file(kubeconfig);
        Ok(())
    }
}

fn release_asset() -> AppResult<&'static str> {
    Ok(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "kind-darwin-arm64",
        ("macos", "x86_64") => "kind-darwin-amd64",
        ("linux", "aarch64") => "kind-linux-arm64",
        ("linux", "x86_64") => "kind-linux-amd64",
        ("windows", "x86_64") => "kind-windows-amd64",
        (os, arch) => return Err(AppError::cluster(format!("unsupported platform {os}/{arch}"))),
    })
}

/// kind config: one control plane plus `workers` workers.
fn cluster_config(workers: u8) -> String {
    let mut config = String::from(
        "kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnodes:\n  - role: control-plane\n",
    );
    for _ in 0..workers {
        config.push_str("  - role: worker\n");
    }
    config
}

pub fn validate_name(name: &str) -> AppResult<()> {
    let ok = name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(AppError::invalid(format!("invalid cluster name '{name}'"))) }
}

fn path_str(path: &Path) -> AppResult<&str> {
    path.to_str().ok_or_else(|| AppError::invalid(format!("non UTF-8 path {}", path.display())))
}
