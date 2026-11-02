//! Keeps `EnvState` in step with reality, event-driven and only as much as
//! is shown:
//! - Docker down: retried with a backoff (2 s doubling to 30 s), or at once
//!   when asked (Retry). Up: its events (pushed), a ping every 30 s to notice
//!   an engine that went away quietly, and a re-read every 5 minutes in case
//!   the event stream stalled. After a reconnect the guard re-checks the
//!   attempt (events were missed meanwhile).
//! - Kubernetes: one node watch per running cluster for Ready/NotReady, only
//!   while node readiness is shown (the Environment page).

use super::model::{ClusterState, ContainerStatus, DockerState, Env, NodeRole, NodeState, Readiness};
use super::activity::Activities;
use super::infra::Infra;
use super::guard::Guard;
use super::{docker, reconcile};
use crate::cluster::kind::{CLUSTER_LABEL, Kind, node_containers};
use bollard::Docker;
use bollard::query_parameters::EventsOptions;
use futures_util::{FutureExt, StreamExt};
use k8s_openapi::api::core::v1::Node;
use kube::runtime::{WatchStreamExt, watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;

const RETRY_FIRST: Duration = Duration::from_secs(2);
const RETRY_MAX: Duration = Duration::from_secs(30);
const PING_EVERY: Duration = Duration::from_secs(30);
/// A safety net under the events: one container list now and then
const RESYNC_EVERY: Duration = Duration::from_secs(300);

/// `resuming`: the clusters of the attempt the app resumes, which it starts
/// itself (with its task host and desktop)
pub fn start(env: Arc<Env>, kind: Arc<Kind>, infra: Arc<Infra>, activities: Arc<Activities>, guard: Arc<Guard>, resuming: Vec<String>) {
    tauri::async_runtime::spawn(run(env, kind, infra, activities, guard, resuming));
}

async fn run(env: Arc<Env>, kind: Arc<Kind>, infra: Arc<Infra>, activities: Arc<Activities>, guard: Arc<Guard>, resuming: Vec<String>) {
    let mut watchers: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut reconciled = false;
    let mut backoff = RETRY_FIRST;
    loop {
        let docker = match docker::connect().await {
            Ok(docker) => {
                backoff = RETRY_FIRST;
                docker
            }
            Err(e) => {
                env.update(|s| s.docker = DockerState::Down { reason: e.to_string() });
                stop_watchers(&mut watchers);
                tokio::select! {
                    () = tokio::time::sleep(backoff) => backoff = (backoff * 2).min(RETRY_MAX),
                    () = env.retry_requested() => backoff = RETRY_FIRST,
                }
                continue;
            }
        };
        env.update(|s| s.docker = DockerState::Connecting);
        let info = docker.info().await.ok();
        let version = docker.version().await.ok();
        env.update(|s| {
            s.docker = DockerState::Up {
                engine: info.as_ref().and_then(|i| i.operating_system.clone()).unwrap_or_default(),
                version: version.and_then(|v| v.version).unwrap_or_default(),
                cpus: info.as_ref().and_then(|i| i.ncpu).unwrap_or_default() as u32,
                memory_mb: (info.as_ref().and_then(|i| i.mem_total).unwrap_or_default() / 1_048_576)
                    as u32,
            }
        });
        tracing::info!("connected to docker");

        if !reconciled {
            // The containers left under the app's former name go first
            crate::former::remove_containers(&docker).await;
            reconcile::on_startup(&docker, &kind, &activities, &resuming).await;
            // Exams start without building anything
            tauri::async_runtime::spawn(prepare_images(docker.clone(), infra.clone(), activities.clone()));
            reconciled = true;
        }
        sync(&docker, &env, &kind, &guard, &mut watchers).await;
        // Events were missed while Docker was away: what changed meanwhile
        guard.recheck(&docker).await;

        // Containers for the cluster list and the guard, networks and volumes
        // for the guard; only the actions either acts on
        let filters = HashMap::from([
            ("type".to_string(), ["container", "network", "volume"].map(String::from).to_vec()),
            (
                "event".to_string(),
                ["create", "start", "die", "destroy", "pause", "unpause", "exec_create", "disconnect"]
                    .map(String::from)
                    .to_vec(),
            ),
        ]);
        let mut events =
            docker.events(Some(EventsOptions { filters: Some(filters), ..Default::default() })).boxed();
        let mut alive = tokio::time::interval(PING_EVERY);
        alive.tick().await;
        let mut resync = tokio::time::interval(RESYNC_EVERY);
        resync.tick().await;
        loop {
            tokio::select! {
                event = events.next() => match event {
                    Some(Ok(event)) => {
                        guard.on_event(&docker, &event);
                        if !is_node_change(&event) {
                            continue;
                        }
                        // Coalesce a burst (create/start/... of every node)
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        while let Some(Some(Ok(event))) = events.next().now_or_never() {
                            guard.on_event(&docker, &event);
                        }
                        sync(&docker, &env, &kind, &guard, &mut watchers).await;
                    }
                    _ => break,
                },
                _ = env.resync_requested() => sync(&docker, &env, &kind, &guard, &mut watchers).await,
                // Events say what changed; this only notices an engine that
                // stopped without closing the stream (a sleeping VM)
                _ = alive.tick() => {
                    if !docker::answers(&docker).await {
                        break;
                    }
                }
                _ = resync.tick() => sync(&docker, &env, &kind, &guard, &mut watchers).await,
            }
        }
        tracing::warn!("lost connection to docker");
        env.update(|s| s.docker = DockerState::Down { reason: "Lost connection to Docker".into() });
        stop_watchers(&mut watchers);
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Rebuild the cluster list from the kind containers this app owns.
/// A kind node's container changed state (an exec or a network event does
/// not change the cluster list)
fn is_node_change(event: &bollard::models::EventMessage) -> bool {
    event.typ == Some(bollard::models::EventMessageTypeEnum::CONTAINER)
        && !event.action.as_deref().unwrap_or_default().starts_with("exec_")
        && event.actor.as_ref().and_then(|a| a.attributes.as_ref()).is_some_and(|a| a.contains_key(CLUSTER_LABEL))
}

async fn sync(
    docker: &Docker,
    env: &Arc<Env>,
    kind: &Kind,
    guard: &Guard,
    watchers: &mut HashMap<String, JoinHandle<()>>,
) {
    let containers = match node_containers(docker, None).await {
        Ok(containers) => containers,
        Err(e) => {
            tracing::warn!(error = %e, "listing kind containers");
            return;
        }
    };
    let owned = kind.owned_clusters();
    let previous = env.snapshot();

    let mut clusters: Vec<ClusterState> = Vec::new();
    for c in containers {
        let cluster = &c.cluster;
        // Other kind clusters on the machine are not ckpro's to show
        if !owned.contains(cluster) {
            continue;
        }
        let name = c.name;
        let container = match c.state.as_str() {
            "running" => ContainerStatus::Running,
            "exited" => ContainerStatus::Stopped,
            other => ContainerStatus::Other { status: other.to_string() },
        };
        // Readiness comes from the node watch; it is meaningless while stopped
        let ready = if container == ContainerStatus::Running {
            previous
                .clusters
                .iter()
                .flat_map(|c| &c.nodes)
                .find(|n| n.name == name)
                .map(|n| n.ready.clone())
                .unwrap_or_default()
        } else {
            Readiness::Unknown
        };
        let role = if c.control_plane { NodeRole::ControlPlane } else { NodeRole::Worker };
        let node = NodeState { name, role, container, ready };
        match clusters.iter_mut().find(|c| &c.name == cluster) {
            Some(existing) => existing.nodes.push(node),
            None => clusters.push(ClusterState { name: cluster.clone(), nodes: vec![node] }),
        }
    }
    for cluster in &mut clusters {
        cluster.nodes.sort_by(|a, b| {
            (a.role != NodeRole::ControlPlane, &a.name).cmp(&(b.role != NodeRole::ControlPlane, &b.name))
        });
    }
    clusters.sort_by(|a, b| a.name.cmp(&b.name));

    // One node watch per cluster whose control plane runs, while readiness
    // is shown; not during an attempt (the guard closes the API to the host)
    let watched: Vec<String> = if env.watching_nodes() {
        clusters
            .iter()
            .filter(|c| !guard.guards(&c.name))
            .filter(|c| {
                c.nodes.iter().any(|n| n.role == NodeRole::ControlPlane && n.container == ContainerStatus::Running)
            })
            .map(|c| c.name.clone())
            .collect()
    } else {
        Vec::new()
    };
    watchers.retain(|name, handle| {
        let keep = watched.contains(name) && !handle.is_finished();
        if !keep {
            handle.abort();
        }
        keep
    });
    for name in watched {
        watchers.entry(name.clone()).or_insert_with(|| {
            tokio::spawn(watch_nodes(name.clone(), kind.kubeconfig(&name), env.clone()))
        });
    }

    env.update(|s| s.clusters = clusters);
}

fn stop_watchers(watchers: &mut HashMap<String, JoinHandle<()>>) {
    for (_, handle) in watchers.drain() {
        handle.abort();
    }
}

/// Follow the cluster's Node objects and record their Ready condition.
async fn watch_nodes(cluster: String, kubeconfig: PathBuf, env: Arc<Env>) {
    loop {
        match client(&kubeconfig).await {
            Ok(client) => {
                let nodes: kube::Api<Node> = kube::Api::all(client);
                let mut stream = watcher(nodes, watcher::Config::default()).default_backoff().boxed();
                while let Some(event) = stream.next().await {
                    match event {
                        Ok(watcher::Event::Apply(node) | watcher::Event::InitApply(node)) => {
                            set_readiness(&env, &cluster, &node)
                        }
                        Ok(_) => {}
                        Err(e) => tracing::debug!(%cluster, error = %e, "node watch"),
                    }
                }
            }
            Err(e) => tracing::debug!(%cluster, error = %e, "kubernetes client"),
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn client(kubeconfig: &PathBuf) -> Result<kube::Client, String> {
    let config = kube::config::Kubeconfig::read_from(kubeconfig).map_err(|e| e.to_string())?;
    let config = kube::Config::from_custom_kubeconfig(config, &Default::default())
        .await
        .map_err(|e| e.to_string())?;
    kube::Client::try_from(config).map_err(|e| e.to_string())
}

fn set_readiness(env: &Env, cluster: &str, node: &Node) {
    let Some(name) = node.metadata.name.clone() else { return };
    let condition = node
        .status
        .as_ref()
        .and_then(|s| s.conditions.as_ref())
        .and_then(|c| c.iter().find(|c| c.type_ == "Ready"));
    let ready = match condition {
        Some(c) if c.status == "True" => Readiness::Ready,
        Some(c) => Readiness::NotReady {
            reason: [c.reason.as_deref(), c.message.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(": "),
        },
        None => Readiness::Unknown,
    };
    env.update(|s| {
        if let Some(n) = s.cluster_mut(cluster).and_then(|c| c.nodes.iter_mut().find(|n| n.name == name)) {
            n.ready = ready;
        }
    });
}

/// Build the exam images in the background when they are missing (first
/// run, or an update changed them), so starting an exam does not wait.
async fn prepare_images(docker: Docker, infra: Arc<Infra>, activities: Arc<Activities>) {
    let missing = infra.missing_images(&docker).await;
    if missing.is_empty() {
        let quiet = |line: String| tracing::info!("{line}");
        if let Err(e) = infra.ensure(&docker, &quiet).await {
            tracing::warn!(error = %e, "preparing the exam infrastructure");
        }
        return;
    }
    let op = activities.begin("Preparing the exam images", vec![format!("Getting {}", missing.join(", "))]);
    op.detail("First run or after an update: pulled when published, built here otherwise");
    let result = infra.ensure(&docker, &|line| op.log(line)).await;
    let _ = op.end(result);
}
