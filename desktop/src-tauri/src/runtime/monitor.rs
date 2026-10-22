//! Keeps `EnvState` in step with reality, event-driven:
//! - Docker: connect (retrying while it is down), then follow container events
//!   for kind nodes; a slow sweep doubles as a liveness check.
//! - Kubernetes: one node watch per running cluster for Ready/NotReady.

use super::model::{ClusterState, ContainerStatus, DockerState, Env, NodeRole, NodeState, Readiness};
use super::{docker, reconcile};
use crate::cluster::kind::Kind;
use bollard::Docker;
use bollard::query_parameters::{EventsOptions, ListContainersOptions};
use futures_util::{FutureExt, StreamExt};
use k8s_openapi::api::core::v1::Node;
use kube::runtime::{WatchStreamExt, watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;

const CLUSTER_LABEL: &str = "io.x-k8s.kind.cluster";
const ROLE_LABEL: &str = "io.x-k8s.kind.role";

pub fn start(env: Arc<Env>, kind: Arc<Kind>) {
    tauri::async_runtime::spawn(run(env, kind));
}

async fn run(env: Arc<Env>, kind: Arc<Kind>) {
    let mut watchers: HashMap<String, JoinHandle<()>> = HashMap::new();
    let mut reconciled = false;
    loop {
        let docker = match docker::connect().await {
            Ok(docker) => docker,
            Err(e) => {
                env.update(|s| s.docker = DockerState::Down { reason: e.to_string() });
                stop_watchers(&mut watchers);
                tokio::time::sleep(Duration::from_secs(3)).await;
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
            reconcile::on_startup(&docker, &kind).await;
            reconciled = true;
        }
        sync(&docker, &env, &kind, &mut watchers).await;

        let filters = HashMap::from([
            ("type".to_string(), vec!["container".to_string()]),
            ("label".to_string(), vec![CLUSTER_LABEL.to_string()]),
        ]);
        let mut events =
            docker.events(Some(EventsOptions { filters: Some(filters), ..Default::default() })).boxed();
        let mut sweep = tokio::time::interval(Duration::from_secs(30));
        sweep.tick().await;
        loop {
            tokio::select! {
                event = events.next() => match event {
                    Some(Ok(_)) => {
                        // Coalesce a burst (create/start/... of every node)
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        while let Some(Some(_)) = events.next().now_or_never() {}
                        sync(&docker, &env, &kind, &mut watchers).await;
                    }
                    _ => break,
                },
                _ = env.resync_requested() => sync(&docker, &env, &kind, &mut watchers).await,
                _ = sweep.tick() => {
                    if docker.ping().await.is_err() {
                        break;
                    }
                    sync(&docker, &env, &kind, &mut watchers).await;
                }
            }
        }
        tracing::warn!("lost connection to docker");
        env.update(|s| s.docker = DockerState::Down { reason: "Lost connection to Docker".into() });
        stop_watchers(&mut watchers);
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Rebuild the cluster list from the kind containers this app owns.
async fn sync(
    docker: &Docker,
    env: &Arc<Env>,
    kind: &Kind,
    watchers: &mut HashMap<String, JoinHandle<()>>,
) {
    let containers = match docker
        .list_containers(Some(ListContainersOptions {
            all: true,
            filters: Some(HashMap::from([("label".to_string(), vec![CLUSTER_LABEL.to_string()])])),
            ..Default::default()
        }))
        .await
    {
        Ok(containers) => containers,
        Err(e) => {
            tracing::warn!(error = %e, "listing kind containers");
            return;
        }
    };
    let owned = kind.owned_clusters();
    let previous = env.snapshot();

    let mut clusters: Vec<ClusterState> = Vec::new();
    let mut foreign: Vec<String> = Vec::new();
    for c in containers {
        let labels = c.labels.unwrap_or_default();
        let Some(cluster) = labels.get(CLUSTER_LABEL) else { continue };
        if !owned.contains(cluster) {
            if !foreign.contains(cluster) {
                foreign.push(cluster.clone());
            }
            continue;
        }
        let name = c.names.and_then(|n| n.first().cloned()).unwrap_or_default();
        let name = name.trim_start_matches('/').to_string();
        let container = match c.state.map(|s| s.to_string()).as_deref() {
            Some("running") => ContainerStatus::Running,
            Some("exited") => ContainerStatus::Stopped,
            other => ContainerStatus::Other { status: other.unwrap_or("unknown").to_string() },
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
        let role = match labels.get(ROLE_LABEL).map(String::as_str) {
            Some("control-plane") => NodeRole::ControlPlane,
            _ => NodeRole::Worker,
        };
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

    // One node watch per cluster whose control plane runs
    let watched: Vec<String> = clusters
        .iter()
        .filter(|c| {
            c.nodes.iter().any(|n| n.role == NodeRole::ControlPlane && n.container == ContainerStatus::Running)
        })
        .map(|c| c.name.clone())
        .collect();
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

    foreign.sort();
    env.update(|s| {
        s.clusters = clusters;
        s.foreign_clusters = foreign;
    });
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
