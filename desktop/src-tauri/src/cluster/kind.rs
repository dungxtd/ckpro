//! Exam clusters: a pinned kind binary managed by the app, cluster configs
//! generated here, and create/delete with every output line handed to a sink.

use crate::error::{AppError, AppResult};
use crate::runtime::{docker, infra};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const KIND_VERSION: &str = "v0.33.0";

/// Where the app keeps kind (`bin_dir`) and the configs and kubeconfigs of
/// the clusters it owns (`dir`).
pub struct Kind {
    bin_dir: PathBuf,
    dir: PathBuf,
    /// The Docker network its clusters are made on (kind's own, `kind`, if none)
    network: Option<String>,
}

impl Kind {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { bin_dir: data_dir.clone(), dir: data_dir, network: None }
    }

    /// Clusters owned by one verify run, kept apart from the app's: their
    /// state, and their Docker network
    pub fn scoped(data_dir: PathBuf, state_dir: PathBuf, network: String) -> Self {
        Self { bin_dir: data_dir, dir: state_dir, network: Some(network) }
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

    /// Every kind cluster on this machine, managed by cktry or not (a run
    /// interrupted before kind wrote its kubeconfig leaves one unmanaged).
    pub async fn all_clusters(&self) -> AppResult<Vec<String>> {
        // kind execs in the nodes (docker exec): cktry's own, not outside access
        let _own = crate::runtime::guard::own_operation();
        let output = Command::new(self.binary().await?)
            .args(["get", "clusters"])
            .env("PATH", self.kind_path()?)
            .output()
            .await
            .map_err(|e| AppError::cluster(format!("starting kind: {e}")))?;
        Ok(String::from_utf8_lossy(&output.stdout).lines().map(str::to_string).collect())
    }

    /// Drop the app's files for a cluster that no longer exists.
    pub fn forget(&self, cluster: &str) {
        let _ = std::fs::remove_file(self.kubeconfig(cluster));
        let _ = std::fs::remove_file(self.dir.join(format!("kind-{cluster}.yaml")));
    }

    /// Path to the pinned kind binary, downloaded on first use.
    async fn binary(&self) -> AppResult<PathBuf> {
        let bin = self.bin_dir.join(format!("kind-{KIND_VERSION}"));
        if bin.exists() {
            return Ok(bin);
        }
        std::fs::create_dir_all(&self.bin_dir).map_err(|e| AppError::io("creating data dir", e))?;
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
    /// option to label its node containers, so the shim adds the cktry compose
    /// labels to every `docker run`; all other commands go straight through.
    fn kind_path(&self) -> AppResult<String> {
        let real = docker::cli().ok_or_else(|| AppError::DockerUnavailable {
            message: format!("The docker CLI was not found. {}.", docker::INSTALL),
        })?;
        let shim_dir = self.bin_dir.join("shim");
        std::fs::create_dir_all(&shim_dir).map_err(|e| AppError::io("creating docker shim", e))?;
        let labels: String = docker::compose_labels("$name")
            .into_iter()
            .map(|(k, v)| format!(" --label \"{k}={v}\""))
            .collect();
        let script = format!(
            "#!/bin/sh\n\
             # Written by cktry: label kind's node containers as part of the cktry compose project\n\
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
        let dirs = std::iter::once(shim_dir).chain(std::env::split_paths(&docker::cli_path()).collect::<Vec<_>>());
        std::env::join_paths(dirs).map(|p| p.to_string_lossy().into_owned()).map_err(|e| AppError::io("setting kind's PATH", std::io::Error::other(e)))
    }

    /// Run kind, handing every output line to `log`.
    async fn run(&self, args: &[&str], log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        let kind = self.binary().await?;
        // kind execs in the nodes (docker exec): cktry's own, not outside access
        let _own = crate::runtime::guard::own_operation();
        let mut command = Command::new(&kind);
        if let Some(network) = &self.network {
            command.env("KIND_EXPERIMENTAL_DOCKER_NETWORK", network);
        }
        let mut child = command
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

    /// Create a cluster from the exam node image; `registry_config` is the
    /// containerd certs.d directory mounted into every node.
    pub async fn create(
        &self,
        name: &str,
        workers: u8,
        registry_config: &Path,
        log: &(dyn Fn(String) + Sync),
    ) -> AppResult<()> {
        validate_name(name)?;
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating data dir", e))?;
        let config = self.dir.join(format!("kind-{name}.yaml"));
        std::fs::write(&config, cluster_config(workers, registry_config))
            .map_err(|e| AppError::io("writing kind config", e))?;
        let kubeconfig = self.kubeconfig(name);
        self.run(
            &[
                "create", "cluster", "--name", name, "--image", &infra::NODE_IMAGE.tag(),
                "--config", path_str(&config)?, "--kubeconfig", path_str(&kubeconfig)?,
                "--wait", "120s",
            ],
            log,
        )
        .await
    }

    /// kubeconfig that reaches the API server from inside the clusters' network
    /// (`https://<name>-control-plane:6443`), for the jumphost.
    pub async fn internal_kubeconfig(&self, name: &str) -> AppResult<String> {
        // kind execs in the nodes (docker exec): cktry's own, not outside access
        let _own = crate::runtime::guard::own_operation();
        let output = Command::new(self.binary().await?)
            .args(["get", "kubeconfig", "--internal", "--name", name])
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
        String::from_utf8(output.stdout).map_err(|e| AppError::cluster(e.to_string()))
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
        // kind ships no Windows arm64 build; Windows on Arm runs the x64 one
        // (it only talks to Docker, whose containers are arm64 there)
        ("windows", "aarch64") => "kind-windows-amd64",
        (os, arch) => return Err(AppError::cluster(format!("unsupported platform {os}/{arch}"))),
    })
}

/// kind config: one control plane plus `workers` workers, every node pulling
/// through the registry caches (containerd certs.d).
fn cluster_config(workers: u8, registry_config: &Path) -> String {
    let node = |role: &str| {
        format!(
            "  - role: {role}\n    extraMounts:\n      - hostPath: {}\n        containerPath: /etc/containerd/certs.d\n        readOnly: true\n",
            registry_config.display()
        )
    };
    let mut config = String::from(
        "kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\n\
         containerdConfigPatches:\n  - |-\n    [plugins.\"io.containerd.cri.v1.images\".registry]\n      config_path = \"/etc/containerd/certs.d\"\n\
         nodes:\n",
    );
    config.push_str(&node("control-plane"));
    for _ in 0..workers {
        config.push_str(&node("worker"));
    }
    config
}

/// Label kind puts on every node container: the cluster's name
pub const CLUSTER_LABEL: &str = "io.x-k8s.kind.cluster";
const ROLE_LABEL: &str = "io.x-k8s.kind.role";

/// A kind node container, as Docker lists it.
pub struct NodeContainer {
    pub name: String,
    pub cluster: String,
    pub control_plane: bool,
    /// Docker's state: running, exited, paused, ...
    pub state: String,
}

/// The node containers of every kind cluster on the engine (any owner), or
/// of `cluster` alone.
pub async fn node_containers(docker: &bollard::Docker, cluster: Option<&str>) -> AppResult<Vec<NodeContainer>> {
    let label = match cluster {
        Some(cluster) => format!("{CLUSTER_LABEL}={cluster}"),
        None => CLUSTER_LABEL.to_string(),
    };
    let containers = docker
        .list_containers(Some(bollard::query_parameters::ListContainersOptions {
            all: true,
            filters: Some(std::collections::HashMap::from([("label".to_string(), vec![label])])),
            ..Default::default()
        }))
        .await?;
    Ok(containers
        .into_iter()
        .filter_map(|c| {
            let labels = c.labels.unwrap_or_default();
            Some(NodeContainer {
                name: c.names?.first()?.trim_start_matches('/').to_string(),
                cluster: labels.get(CLUSTER_LABEL)?.clone(),
                control_plane: labels.get(ROLE_LABEL).is_some_and(|r| r == "control-plane"),
                state: c.state.map(|s| s.to_string()).unwrap_or_default(),
            })
        })
        .collect())
}

pub fn validate_name(name: &str) -> AppResult<()> {
    let ok = name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(AppError::invalid(format!("invalid cluster name '{name}'"))) }
}

fn path_str(path: &Path) -> AppResult<&str> {
    path.to_str().ok_or_else(|| AppError::invalid(format!("non UTF-8 path {}", path.display())))
}
