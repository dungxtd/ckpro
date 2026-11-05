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
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct NodeState {
    /// Container name, which kind also uses as the Kubernetes node name
    pub name: String,
    pub role: NodeRole,
    pub container: ContainerStatus,
    pub ready: Readiness,
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
        if *state != before {
            (self.publish)(&state);
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, EnvState> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
