//! The environment as the app sees it: one `EnvState`, updated by the monitor
//! from Docker events and Kubernetes watches, and pushed to the UI whenever it
//! changes. Issues are derived from the state, never stored separately.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct EnvState {
    pub docker: DockerState,
    /// Clusters created by this app (kind clusters with a kubeconfig in the
    /// app data dir); other kind clusters on the machine are left alone
    pub clusters: Vec<ClusterState>,
    pub issues: Vec<Issue>,
    /// The checks of Docker's machine that pass, in words (the ones that
    /// fail are issues); derived, like the issues
    #[serde(default)]
    pub passed: Vec<String>,
    /// What each running container takes, measured while the Environment
    /// page is open (none otherwise, or before the first measurement)
    #[serde(default)]
    pub usage: Option<Vec<ContainerUse>>,
    /// The exam images not here yet (`Infra::missing_images`)
    #[serde(default)]
    pub images_missing: Vec<String>,
    /// Docker's disk and kernel limits, read in the image mirror while the
    /// Environment page is open (none while it does not run)
    #[serde(default)]
    pub host: Option<HostFacts>,
}

/// What the Docker machine has, as its own tools report it
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct HostFacts {
    /// Free space on Docker's disk (`df`), in MB
    pub disk_free_mb: u32,
    /// What the image mirror's cache holds, in MB
    pub cache_mb: u32,
    /// `fs.inotify.max_user_watches` and `max_user_instances` of the kernel
    /// every container shares: kind needs them high
    pub inotify_watches: u32,
    pub inotify_instances: u32,
}

/// Below this, a new cluster may not start: a warning
pub const DISK_LOW_MB: u32 = 10 * 1024;
/// What kind asks the kernel for (its known issues): below, clusters fail
/// in odd ways
pub const INOTIFY_WATCHES: u32 = 524_288;
pub const INOTIFY_INSTANCES: u32 = 512;

/// A running container and the memory it takes now
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ContainerUse {
    pub name: String,
    pub owner: Owner,
    /// Memory in use (page cache left out), in MB
    pub mb: u32,
}

/// Whose a container is
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Owner {
    /// A node of one of cktry's clusters
    Cluster { cluster: String },
    /// One of cktry's own services (task host, desktop, mirror)
    Service { service: String },
    /// Not cktry's; `cluster` when it is a node of another kind cluster
    Other { cluster: Option<String> },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DockerState {
    #[default]
    Connecting,
    Down { reason: String },
    Up { engine: String, version: String, cpus: u32, memory_mb: u32 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ClusterState {
    pub name: String,
    pub nodes: Vec<NodeState>,
    /// A running attempt's: the guard keeps it as set up
    #[serde(default)]
    pub guarded: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct NodeState {
    /// Container name, which kind also uses as the Kubernetes node name
    pub name: String,
    pub role: NodeRole,
    pub container: ContainerStatus,
    pub ready: Readiness,
    /// The kubelet's version (`v1.35.8`), once the node was watched
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum NodeRole {
    ControlPlane,
    Worker,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ContainerStatus {
    Running,
    Stopped,
    /// created, restarting, paused, dead, ...
    Other { status: String },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Readiness {
    /// No report from the API server (yet)
    #[default]
    Unknown,
    Ready,
    NotReady { reason: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Issue {
    pub severity: Severity,
    /// "docker", a cluster name or a node name
    pub component: String,
    pub message: String,
    /// What the user can do about it
    pub hint: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
}

impl EnvState {
    pub fn cluster_mut(&mut self, name: &str) -> Option<&mut ClusterState> {
        self.clusters.iter_mut().find(|c| c.name == name)
    }

    fn derive_passed(&self) -> Vec<String> {
        let Some(host) = &self.host else { return Vec::new() };
        let mut passed = Vec::new();
        if host.disk_free_mb >= DISK_LOW_MB {
            passed.push(format!("{:.0} GB of disk left for Docker", f64::from(host.disk_free_mb) / 1024.0));
        }
        if host.inotify_watches >= INOTIFY_WATCHES && host.inotify_instances >= INOTIFY_INSTANCES {
            passed.push("file watch limits high enough for kind".into());
        }
        passed
    }

    fn derive_issues(&self) -> Vec<Issue> {
        let mut issues = Vec::new();
        if let DockerState::Down { reason } = &self.docker {
            issues.push(Issue {
                severity: Severity::Error,
                component: "docker".into(),
                message: reason.clone(),
                hint: format!("{}; cktry reconnects on its own.", crate::runtime::docker::START),
            });
            return issues;
        }
        if let Some(host) = &self.host {
            if host.disk_free_mb < DISK_LOW_MB {
                issues.push(Issue {
                    severity: Severity::Warning,
                    component: "docker".into(),
                    message: format!("Docker has {:.1} GB of disk left", f64::from(host.disk_free_mb) / 1024.0),
                    hint: "Under 10 GB a new cluster may not start. Clear the image cache, or free space in OrbStack or Docker Desktop.".into(),
                });
            }
            if host.inotify_watches < INOTIFY_WATCHES || host.inotify_instances < INOTIFY_INSTANCES {
                issues.push(Issue {
                    severity: Severity::Warning,
                    component: "docker".into(),
                    message: format!(
                        "File watch limits are low for kind ({} watches, {} instances)",
                        host.inotify_watches, host.inotify_instances
                    ),
                    hint: format!(
                        "Clusters may fail to start. Raise them in Docker's machine: sysctl fs.inotify.max_user_watches={INOTIFY_WATCHES} fs.inotify.max_user_instances={INOTIFY_INSTANCES}."
                    ),
                });
            }
        }
        for cluster in &self.clusters {
            for node in &cluster.nodes {
                match (&node.container, &node.ready) {
                    (ContainerStatus::Running, Readiness::NotReady { reason }) => issues.push(Issue {
                        severity: Severity::Error,
                        component: node.name.clone(),
                        message: format!("{} is NotReady: {reason}", node.name),
                        hint: format!(
                            "Open a shell on {} and check the kubelet: systemctl status kubelet, journalctl -u kubelet.",
                            node.name
                        ),
                    }),
                    (ContainerStatus::Running, _) => {}
                    (ContainerStatus::Stopped, _) => issues.push(Issue {
                        severity: Severity::Error,
                        component: node.name.clone(),
                        message: format!("{} is stopped", node.name),
                        hint: format!("Use Repair on cluster {} to start its nodes.", cluster.name),
                    }),
                    (ContainerStatus::Other { status }, _) => issues.push(Issue {
                        severity: Severity::Warning,
                        component: node.name.clone(),
                        message: format!("{} is {status}", node.name),
                        hint: format!("Wait a moment, or use Repair on cluster {}.", cluster.name),
                    }),
                }
            }
        }
        issues
    }
}

/// Shared state plus the callback that publishes it.
pub struct Env {
    state: Mutex<EnvState>,
    publish: Box<dyn Fn(&EnvState) + Send + Sync>,
    /// Asks the monitor to re-read the environment now (after changes that
    /// produce no Docker event, like adopting a cluster)
    resync: tokio::sync::Notify,
    /// Asks the monitor to try Docker again now, not at its next backoff
    retry: tokio::sync::Notify,
    /// Someone shows node readiness (the Environment page): only then are the
    /// clusters' Kubernetes node watches kept open
    watch_nodes: std::sync::atomic::AtomicBool,
}

impl Env {
    pub fn new(publish: impl Fn(&EnvState) + Send + Sync + 'static) -> Self {
        Self {
            state: Mutex::new(EnvState::default()),
            publish: Box::new(publish),
            resync: tokio::sync::Notify::new(),
            retry: tokio::sync::Notify::new(),
            watch_nodes: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub fn request_retry(&self) {
        self.retry.notify_one();
    }

    pub async fn retry_requested(&self) {
        self.retry.notified().await;
    }

    /// Show (or stop showing) node readiness; the monitor opens or closes the
    /// node watches at once
    pub fn set_watch_nodes(&self, on: bool) {
        self.watch_nodes.store(on, std::sync::atomic::Ordering::SeqCst);
        self.request_resync();
    }

    pub fn watching_nodes(&self) -> bool {
        self.watch_nodes.load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn request_resync(&self) {
        self.resync.notify_one();
    }

    pub async fn resync_requested(&self) {
        self.resync.notified().await;
    }

    pub fn snapshot(&self) -> EnvState {
        self.lock().clone()
    }

    /// Apply a change; publishes only when the state actually changed.
    pub fn update(&self, change: impl FnOnce(&mut EnvState)) {
        let mut state = self.lock();
        let before = state.clone();
        change(&mut state);
        state.issues = state.derive_issues();
        state.passed = state.derive_passed();
        if *state != before {
            (self.publish)(&state);
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, EnvState> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dockers_disk_and_limits_pass_or_ask_for_a_look() {
        let env = Env::new(|_| {});
        let host = |disk_free_mb, inotify_instances| HostFacts { disk_free_mb, cache_mb: 0, inotify_watches: 1_048_576, inotify_instances };
        env.update(|s| s.host = Some(host(200 * 1024, 8192)));
        let state = env.snapshot();
        assert!(state.issues.is_empty());
        assert_eq!(state.passed, ["200 GB of disk left for Docker", "file watch limits high enough for kind"]);
        // Low disk, low limits: two warnings, nothing passes
        env.update(|s| s.host = Some(host(4 * 1024, 128)));
        let state = env.snapshot();
        assert_eq!(state.issues.len(), 2);
        assert!(state.passed.is_empty());
        assert!(state.issues[0].message.contains("4.0 GB of disk left"));
    }
}
