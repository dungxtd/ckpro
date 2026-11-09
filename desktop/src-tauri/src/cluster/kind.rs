//! Exam clusters: a pinned kind binary managed by the app, cluster configs
//! generated here, and create/delete with every output line handed to a sink.

use crate::error::{AppError, AppResult};
use crate::runtime::{docker, infra};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

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
        let output = self.output(&["get", "clusters"]).await?;
        Ok(String::from_utf8_lossy(&output.stdout).lines().map(str::to_string).collect())
    }

    /// Drop the app's files for a cluster that no longer exists.
    pub fn forget(&self, cluster: &str) {
        let _ = std::fs::remove_file(self.kubeconfig(cluster));
        let _ = std::fs::remove_file(self.dir.join(format!("kind-{cluster}.yaml")));
    }

    /// Path to the pinned kind binary, downloaded on first use.
    async fn binary(&self) -> AppResult<PathBuf> {
        let bin = self.bin_dir.join(crate::platform::program_file(&format!("kind-{KIND_VERSION}")));
        if bin.exists() {
            return Ok(bin);
        }
        std::fs::create_dir_all(&self.bin_dir).map_err(|e| AppError::io("creating data dir", e))?;
        let url = format!(
            "https://github.com/kubernetes-sigs/kind/releases/download/{KIND_VERSION}/{}",
            release_asset()?
        );
        tracing::info!(%url, "downloading kind");
        let bytes = download(&url).await.map_err(|e| AppError::io("downloading kind", e))?;
        let tmp = bin.with_extension("part");
        std::fs::write(&tmp, &bytes).map_err(|e| AppError::io("saving kind", e))?;
        crate::platform::make_executable(&tmp).map_err(|e| AppError::io("saving kind", e))?;
        std::fs::rename(&tmp, &bin).map_err(|e| AppError::io("saving kind", e))?;
        Ok(bin)
    }

    /// kind, set to run docker through the app's stand-in
    /// (`cluster::docker_shim`): first on its PATH, then the real CLI, which
    /// the stand-in hands every command to. kind has no option to label its
    /// node containers; the stand-in adds the cktry compose labels to `docker run`
    async fn kind(&self) -> AppResult<tokio::process::Command> {
        let kind = self.binary().await?;
        let real = docker::cli().ok_or_else(|| AppError::DockerUnavailable {
            message: format!("The docker CLI was not found. {}.", docker::INSTALL),
        })?;
        let shim_dir = self.bin_dir.join("shim");
        std::fs::create_dir_all(&shim_dir).map_err(|e| AppError::io("creating the docker stand-in", e))?;
        let app = super::docker_shim::program().map_err(|e| AppError::io("finding the app for the docker stand-in", e))?;
        let shim = shim_dir.join(crate::platform::program_file("docker"));
        crate::platform::link_program(&app, &shim).map_err(|e| AppError::io("linking the docker stand-in", e))?;
        // What earlier versions left there (scripts): only the stand-in stays
        for entry in std::fs::read_dir(&shim_dir).into_iter().flatten().flatten() {
            if entry.path() != shim {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        let path = std::env::join_paths(std::iter::once(shim_dir).chain(docker::cli_dirs()))
            .map_err(|e| AppError::io("setting kind's PATH", std::io::Error::other(e)))?;
        let mut command = crate::platform::command(kind);
        command.env("PATH", path).env(super::docker_shim::REAL_DOCKER, real);
        if let Some(network) = &self.network {
            command.env("KIND_EXPERIMENTAL_DOCKER_NETWORK", network);
        }
        Ok(command)
    }

    /// kind, started with `args` in a tree of its own: the docker commands
    /// it runs stop with it (an exam's preparation cancelled)
    async fn start(&self, args: &[&str]) -> AppResult<crate::platform::ProcessTree> {
        let mut command = self.kind().await?;
        command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        crate::platform::ProcessTree::spawn(command).map_err(|e| AppError::cluster(format!("starting kind: {e}")))
    }

    /// What kind prints for `args`, once it ends
    async fn output(&self, args: &[&str]) -> AppResult<std::process::Output> {
        self.start(args).await?.output().await.map_err(|e| AppError::cluster(format!("running kind: {e}")))
    }

    /// Run kind, handing every output line to `log` but its noise.
    async fn run(&self, args: &[&str], log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        // kind execs in the nodes (docker exec): cktry's own, not outside access
        let _own = crate::runtime::guard::own_operation();
        let mut tree = self.start(args).await?;

        let mut out = BufReader::new(tree.stdout().expect("piped")).lines();
        let mut err = BufReader::new(tree.stderr().expect("piped")).lines();
        let mut tail = Vec::new();
        loop {
            let line = tokio::select! {
                Ok(Some(line)) = out.next_line() => line,
                Ok(Some(line)) = err.next_line() => line,
                else => break,
            };
            if noise(&line) {
                continue;
            }
            tail.push(line.clone());
            if tail.len() > 5 {
                tail.remove(0);
            }
            log(line);
        }
        let status = tree.wait().await.map_err(|e| AppError::cluster(e.to_string()))?;
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
        let output = self.output(&["get", "kubeconfig", "--internal", "--name", name]).await?;
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

/// Tries a download takes before it gives up
const DOWNLOAD_ATTEMPTS: u32 = 4;

/// `url`'s body. A failure that may pass (a 5xx or 429 from GitHub, a
/// timeout, a dropped connection) is tried again after 2, 4 and 8 seconds;
/// any other (a 404) fails at once
async fn download(url: &str) -> reqwest::Result<bytes::Bytes> {
    download_with(url, std::time::Duration::from_secs(1)).await
}

/// `download`, waiting `unit` times 2, 4, 8 between tries
async fn download_with(url: &str, unit: std::time::Duration) -> reqwest::Result<bytes::Bytes> {
    let mut attempt = 1;
    loop {
        let result = async { reqwest::get(url).await?.error_for_status()?.bytes().await }.await;
        match result {
            Err(e) if attempt < DOWNLOAD_ATTEMPTS && passing(&e) => {
                let wait = unit * (1 << attempt);
                tracing::warn!(error = %e, attempt, ?wait, "download failed; trying again");
                tokio::time::sleep(wait).await;
                attempt += 1;
            }
            result => return result,
        }
    }
}

/// Whether a failed request may succeed when tried again
fn passing(e: &reqwest::Error) -> bool {
    match e.status() {
        Some(status) => status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS,
        None => e.is_timeout() || e.is_connect() || e.is_request() || e.is_body(),
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

/// What kind prints that tells the candidate nothing: the warning for the
/// network cktry picks on purpose, and its advice once a cluster is up
/// (blank lines, the kubectl context, a link to its quick start)
fn noise(line: &str) -> bool {
    const LINES: &[&str] = &[
        "KIND_EXPERIMENTAL_DOCKER_NETWORK",
        "Here be dragons",
        "Set kubectl context to",
        "You can now use your cluster with",
        "kubectl cluster-info --context",
        "Not sure what to do next",
        "Have a nice day",
    ];
    line.trim().is_empty() || LINES.iter().any(|l| line.contains(l))
}

pub fn validate_name(name: &str) -> AppResult<()> {
    let ok = name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(AppError::invalid(format!("invalid cluster name '{name}'"))) }
}

fn path_str(path: &Path) -> AppResult<&str> {
    path.to_str().ok_or_else(|| AppError::invalid(format!("non UTF-8 path {}", path.display())))
}

#[cfg(test)]
mod tests {
    use super::{download_with, noise};

    /// A server on the loopback answering each request with the next of
    /// `replies` (status, body), then 500; its URL
    async fn serve(replies: Vec<(u16, &'static str)>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/kind", listener.local_addr().unwrap());
        tokio::spawn(async move {
            let mut replies = replies.into_iter();
            while let Ok((mut stream, _)) = listener.accept().await {
                let mut request = [0; 1024];
                let _ = stream.read(&mut request).await;
                let (status, body) = replies.next().unwrap_or((500, ""));
                let reply = format!("HTTP/1.1 {status} X\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(reply.as_bytes()).await;
            }
        });
        url
    }

    /// GitHub answering 503 now and then (the scheduled run failed on a 504)
    /// does not fail the download; a missing file fails at once
    #[tokio::test]
    async fn a_download_tries_again_after_a_server_error_only() {
        let unit = std::time::Duration::from_millis(1);
        let url = serve(vec![(503, ""), (503, ""), (200, "kind")]).await;
        assert_eq!(download_with(&url, unit).await.unwrap().as_ref(), b"kind");
        let url = serve(vec![(404, ""), (200, "kind")]).await;
        let error = download_with(&url, unit).await.unwrap_err();
        assert_eq!(error.status().map(|s| s.as_u16()), Some(404));
        let url = serve(vec![(503, ""), (503, ""), (503, ""), (503, ""), (200, "kind")]).await;
        assert_eq!(download_with(&url, unit).await.unwrap_err().status().map(|s| s.as_u16()), Some(503), "four tries, then it gives up");
    }

    #[test]
    fn kinds_advice_and_network_warning_are_left_out() {
        assert!(noise("WARNING: Here be dragons! This is not supported currently."));
        assert!(noise("Not sure what to do next? 😅  Check out https://kind.sigs.k8s.io/docs/user/quick-start/"));
        assert!(noise("   "));
        // What it is doing, and what went wrong, stay
        assert!(!noise(" ✓ Starting control-plane 🕹️"));
        assert!(!noise("ERROR: failed to create cluster: node(s) already exist"));
    }
}
