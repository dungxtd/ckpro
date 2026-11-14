//! The candidate's machine. The app has one (`ckpro-jumphost`); every
//! `lab verify` run gets its own, so runs never share files or kubeconfigs.
//!
//! Its kubeconfig has a context per cluster under the cluster's *logical*
//! name (what questions and candidates use, e.g. `k8s`) pointing at the
//! *physical* kind cluster (`k8s` in the app, `k8s-v1a2b` in a verify run).

use super::docker::compose_labels;
use super::infra::{JUMPHOST_IMAGE, NETWORK, create_and_start, start_existing};
use crate::cluster::kind::Kind;
use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::models::{ContainerCreateBody, HostConfig, RestartPolicy, RestartPolicyNameEnum};
use bollard::query_parameters::{DownloadFromContainerOptions, RemoveContainerOptions};
use futures_util::StreamExt;
use kube::config::Kubeconfig;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Logical cluster name → physical kind cluster name
pub type Placement = BTreeMap<String, String>;

type Log<'a> = &'a (dyn Fn(String) + Sync);

/// The app's clusters keep their names: logical = physical
pub fn app_placement(kind: &Kind) -> Placement {
    kind.owned_clusters().into_iter().map(|c| (c.clone(), c)).collect()
}

pub const APP_NAME: &str = "ckpro-jumphost";
/// A verify run's jumphost is `ckpro-jumphost-<run>`
pub const RUN_PREFIX: &str = "ckpro-jumphost-";
/// A verify run's Docker network is `ckpro-run-<run>`
pub const RUN_NETWORK_PREFIX: &str = "ckpro-run-";

/// The Docker network of a verify run: its clusters, its jumphost and the
/// registry mirror, apart from the app's and other runs'
pub fn run_network(run: &str) -> String {
    format!("{RUN_NETWORK_PREFIX}{run}")
}

pub struct Jumphost {
    pub name: String,
    /// The Docker network it joins: the app's, or its run's own
    network: String,
    /// Mounted read-write at /root/.ckpro (`kubectl config use-context` writes)
    dir: PathBuf,
    /// One `refresh_access` at a time: each empties the etcd certs and
    /// rewrites the kubeconfig, which two at once would interleave
    refreshing: tokio::sync::Mutex<()>,
    /// One look at the ssh key at a time: two first ones would both make it,
    /// and the second `ssh-keygen` would fail on the file the first wrote
    keying: tokio::sync::Mutex<()>,
}

impl Jumphost {
    /// The app's jumphost
    pub fn app(data_dir: &Path) -> Self {
        Self { name: APP_NAME.into(), network: NETWORK.into(), dir: data_dir.join("jumphost"), refreshing: Default::default(), keying: Default::default() }
    }

    /// A jumphost of the tests' own, on the app's network beside the
    /// clusters they make there
    #[cfg(test)]
    pub fn for_test(data_dir: &Path, name: &str) -> Self {
        Self { name: format!("{RUN_PREFIX}{name}"), network: NETWORK.into(), dir: data_dir.join("runs").join(name).join("jumphost"), refreshing: Default::default(), keying: Default::default() }
    }

    /// A jumphost of its own for one verify run
    pub fn for_run(data_dir: &Path, run: &str) -> Self {
        Self { name: format!("{RUN_PREFIX}{run}"), network: run_network(run), dir: data_dir.join("runs").join(run).join("jumphost"), refreshing: Default::default(), keying: Default::default() }
    }

    /// Where etcd client certs for a logical cluster are, on the jumphost
    pub fn etcd_certs(cluster: &str) -> String {
        format!("/root/.ckpro/etcd/{cluster}")
    }

    pub async fn ensure(&self, docker: &Docker, log: Log<'_>) -> AppResult<()> {
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating jumphost dir", e))?;
        // One from an older image (an app update), or mounting another data
        // dir (older install, showing the wrong clusters): replace it
        let source = self.dir.display().to_string();
        let image = JUMPHOST_IMAGE.tag();
        if let Ok(info) = docker.inspect_container(&self.name, None).await {
            let current = info.config.and_then(|c| c.image).as_deref() == Some(image.as_str());
            let mounted = info
                .mounts
                .unwrap_or_default()
                .iter()
                .any(|m| m.source.as_deref() == Some(source.as_str()) && m.rw == Some(true));
            if !current || !mounted {
                log(format!("Replacing {} (outdated)", self.name));
                self.remove_container(docker).await?;
            }
        }
        if start_existing(docker, &self.name).await? {
            return Ok(());
        }
        log(format!("Starting {}", self.name));
        let config = ContainerCreateBody {
            image: Some(image),
            hostname: Some("jumphost".into()),
            labels: Some(compose_labels(&self.name).into_iter().collect()),
            host_config: Some(HostConfig {
                binds: Some(vec![format!("{source}:/root/.ckpro")]),
                network_mode: Some(self.network.clone()),
                restart_policy: Some(RestartPolicy {
                    name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        create_and_start(docker, &self.name, config).await
    }

    /// A fresh machine for a new attempt: files the previous candidate left
    /// (manifests, snapshots, history) must not leak into the next one.
    pub async fn reset(&self, docker: &Docker, log: Log<'_>) -> AppResult<()> {
        self.remove_container(docker).await?;
        self.ensure(docker, log).await
    }

    /// Container and files (end of a verify run)
    pub async fn remove(&self, docker: &Docker) -> AppResult<()> {
        self.remove_container(docker).await?;
        let _ = std::fs::remove_dir_all(&self.dir);
        Ok(())
    }

    async fn remove_container(&self, docker: &Docker) -> AppResult<()> {
        let options = RemoveContainerOptions { force: true, v: true, ..Default::default() };
        super::docker::unless_gone(docker.remove_container(&self.name, Some(options)).await).map(drop)
    }

    /// The key ssh signs in with on the exam's network: the task host's own,
    /// made in its container the first time, given to every node and to the
    /// exam desktop. No password opens a node or the task host, whoever
    /// reaches their network (the host, a pod, another user)
    pub async fn ssh_key(&self, docker: &Docker) -> AppResult<SshKey> {
        let _one_at_a_time = self.keying.lock().await;
        let public = format!("{SSH_KEY}.pub");
        let mut read = super::exec::run(docker, &self.name, &["cat", &public], &[], None).await?;
        if read.exit_code != 0 {
            let made = super::exec::run(docker, &self.name, &["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "ckpro", "-f", SSH_KEY], &[], None).await?;
            if made.exit_code != 0 {
                return Err(AppError::cluster(format!("making the task host's ssh key: {}", made.text.trim())));
            }
            read = super::exec::run(docker, &self.name, &["cat", &public], &[], None).await?;
        }
        let private = super::exec::run(docker, &self.name, &["cat", SSH_KEY], &[], None).await?;
        if read.exit_code != 0 || private.exit_code != 0 {
            return Err(AppError::cluster("reading the task host's ssh key"));
        }
        Ok(SshKey { public: read.text.trim().to_string(), private: private.text })
    }

    /// `refresh_access`, refused when the task host cannot reach one of
    /// `needed` (logical clusters): an exam without it cannot be worked on
    pub async fn give_access(&self, docker: &Docker, kind: &Kind, placement: &Placement, needed: &[String]) -> AppResult<()> {
        let unreachable = self.refresh_access(docker, kind, placement).await?;
        let missing: Vec<&str> = unreachable.iter().filter(|c| needed.contains(c)).map(String::as_str).collect();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(AppError::cluster(format!("the task host cannot reach cluster {}", missing.join(", "))))
        }
    }

    /// Rewrite the kubeconfig (one context per logical cluster) and the etcd
    /// certs for `placement`, keeping the candidate's current context. The
    /// logical clusters it could not give access to (stopped, say); the
    /// others are reached whatever happened to those
    pub async fn refresh_access(&self, docker: &Docker, kind: &Kind, placement: &Placement) -> AppResult<Vec<String>> {
        let _one_at_a_time = self.refreshing.lock().await;
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating jumphost dir", e))?;
        let kubeconfig_path = self.dir.join("kubeconfig");
        let previous_context = std::fs::read_to_string(&kubeconfig_path)
            .ok()
            .and_then(|text| Kubeconfig::from_yaml(&text).ok())
            .and_then(|k| k.current_context);

        let mut merged: Option<Kubeconfig> = None;
        let mut unreachable = Vec::new();
        let _ = std::fs::remove_dir_all(self.dir.join("etcd"));
        for (logical, physical) in placement {
            match kind.internal_kubeconfig(physical).await {
                Ok(text) => {
                    // Contexts, clusters and users named after the logical cluster
                    let text = text.replace(&format!("kind-{physical}"), logical);
                    let config = Kubeconfig::from_yaml(&text).map_err(|e| AppError::cluster(e.to_string()))?;
                    merged = Some(match merged {
                        None => config,
                        Some(m) => m.merge(config).map_err(|e| AppError::cluster(e.to_string()))?,
                    });
                }
                Err(e) => {
                    tracing::warn!(cluster = %physical, error = %e, "kubeconfig for the jumphost");
                    unreachable.push(logical.clone());
                }
            }
            if let Err(e) = export_etcd_certs(docker, physical, &self.dir.join("etcd").join(logical)).await {
                tracing::warn!(cluster = %physical, error = %e, "etcd certs for the jumphost");
            }
        }

        // ssh with the task host's key: given to the task host itself (the
        // desktop signs in there) and to every node; a cluster whose nodes did
        // not take it cannot be worked on
        let key = self.ssh_key(docker).await;
        match &key {
            Ok(key) => {
                if let Err(e) = authorize(docker, &self.name, &key.public).await {
                    tracing::warn!(error = %e, "ssh key for the task host");
                }
            }
            Err(e) => tracing::warn!(error = %e, "ssh key of the task host"),
        }
        let nodes = crate::cluster::kind::node_containers(docker, None).await.unwrap_or_default();
        for (logical, physical) in placement {
            let given = match &key {
                Ok(key) => {
                    let mut given = true;
                    for node in nodes.iter().filter(|n| n.cluster == *physical && n.state == "running") {
                        if let Err(e) = authorize_node(docker, &node.name, &key.public).await {
                            tracing::warn!(node = %node.name, error = %e, "ssh key for a node");
                            given = false;
                        }
                    }
                    given
                }
                Err(_) => false,
            };
            if !given && !unreachable.contains(logical) {
                unreachable.push(logical.clone());
            }
        }

        match merged {
            Some(mut config) => {
                if let Some(ctx) = previous_context.filter(|c| placement.contains_key(c)) {
                    config.current_context = Some(ctx);
                }
                let json = serde_json::to_vec_pretty(&config).map_err(|e| AppError::cluster(e.to_string()))?;
                // JSON is valid kubeconfig YAML; replace atomically under the reader
                let tmp = self.dir.join("kubeconfig.tmp");
                std::fs::write(&tmp, json).map_err(|e| AppError::io("writing kubeconfig", e))?;
                std::fs::rename(&tmp, &kubeconfig_path).map_err(|e| AppError::io("writing kubeconfig", e))?;
            }
            None => {
                let _ = std::fs::remove_file(&kubeconfig_path);
            }
        }
        Ok(unreachable)
    }
}

/// Where the task host keeps its ssh key (its own container's file system)
const SSH_KEY: &str = "/root/.ssh/id_ed25519";

/// The task host's ssh key pair (OpenSSH formats)
pub struct SshKey {
    pub public: String,
    pub private: String,
}

/// What sshd allows on a node: root with the key alone, as the node image
/// sets it (resources/node/Dockerfile)
const SSHD_CONFIG: &str = "PermitRootLogin prohibit-password\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no";

/// Let `public` sign in as root to `container` (the task host, a node), and
/// nothing else: the key replaces whatever was allowed before
async fn authorize(docker: &Docker, container: &str, public: &str) -> AppResult<()> {
    let script = "umask 077 && mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys";
    let line = format!("{public}\n");
    let out = super::exec::run(docker, container, &["sh", "-c", script], &[], Some(line.as_bytes())).await?;
    if out.exit_code != 0 {
        return Err(AppError::cluster(format!("giving {container} the ssh key: {}", out.text.trim())));
    }
    Ok(())
}

/// `authorize`, on a node, which may come from an image older than the key
/// (root with no password, password sign-in on, kept as long as its cluster):
/// root's password locked and sshd's config rewritten and reloaded when it
/// differs, so no node opens without the key. The task host needs none of
/// it: an outdated one is replaced
async fn authorize_node(docker: &Docker, container: &str, public: &str) -> AppResult<()> {
    let script = format!(
        "umask 077 && mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys \
         && usermod -p '*' root \
         && conf=/etc/ssh/sshd_config.d/ckpro.conf && want='{SSHD_CONFIG}' \
         && if [ \"$(cat $conf 2>/dev/null)\" != \"$(printf '%b' \"$want\")\" ]; then \
              mkdir -p /etc/ssh/sshd_config.d && printf '%b\\n' \"$want\" > $conf \
              && {{ systemctl reload ssh 2>/dev/null || pkill -HUP -x sshd || true; }}; fi"
    );
    let script = script.as_str();
    let line = format!("{public}\n");
    let out = super::exec::run(docker, container, &["sh", "-c", script], &[], Some(line.as_bytes())).await?;
    if out.exit_code != 0 {
        return Err(AppError::cluster(format!("giving {container} the ssh key: {}", out.text.trim())));
    }
    Ok(())
}

/// ca.crt, client.crt and client.key for etcdctl, from the control plane.
async fn export_etcd_certs(docker: &Docker, cluster: &str, dest: &Path) -> AppResult<()> {
    let mut stream = docker.download_from_container(
        &crate::cluster::kind::control_plane(cluster),
        Some(DownloadFromContainerOptions { path: "/etc/kubernetes/pki/etcd".into() }),
    );
    let mut archive = Vec::new();
    while let Some(chunk) = stream.next().await {
        archive.extend_from_slice(&chunk?);
    }
    std::fs::create_dir_all(dest).map_err(|e| AppError::io("writing etcd certs", e))?;
    let mut tar = tar::Archive::new(archive.as_slice());
    for entry in tar.entries().map_err(|e| AppError::io("reading etcd certs", e))? {
        let mut entry = entry.map_err(|e| AppError::io("reading etcd certs", e))?;
        let file = entry.path().ok().and_then(|p| p.file_name().map(|f| f.to_string_lossy().into_owned()));
        let target = match file.as_deref() {
            Some("ca.crt") => "ca.crt",
            Some("healthcheck-client.crt") => "client.crt",
            Some("healthcheck-client.key") => "client.key",
            _ => continue,
        };
        entry.unpack(dest.join(target)).map_err(|e| AppError::io("writing etcd certs", e))?;
    }
    Ok(())
}
