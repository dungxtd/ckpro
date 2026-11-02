//! The attempt's environment, kept as cktry set it up. The candidate owns
//! Docker, so nothing can be locked away; what can be closed is closed, the
//! rest is noticed at once, put back, and written on the result:
//! - The clusters' API servers refuse the host (the kind network's gateway,
//!   where the Mac's port forward arrives): `kubectl` from the Mac does not
//!   reach them during an attempt. The task host, the nodes and pods do.
//! - A container of the attempt (nodes, desktop, task host, mirror) stopped,
//!   killed or paused outside cktry is started again; removed, it is noted.
//! - A command run in one of them (`docker exec`) that cktry did not run, a
//!   container disconnected from the kind network (connected again) or a
//!   cktry volume removed is noted.
//! It follows the events the monitor already receives: nothing polls.

use crate::sync::MutexExt;
use super::exec;
use super::infra::NETWORK;
use bollard::Docker;
use bollard::models::{EventMessage, EventMessageTypeEnum, NetworkConnectRequest};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::cluster::kind::{CLUSTER_LABEL, node_containers};
/// Marks cktry's own firewall rule, to find and remove it again
const RULE_COMMENT: &str = "cktry-guard";

/// Execs cktry itself started (`exec::run`, terminals), and when: not
/// outside access. Each is judged once; one never judged is dropped after a
/// while
fn own_execs() -> &'static Mutex<HashMap<String, Instant>> {
    static OWN: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    OWN.get_or_init(Default::default)
}

/// How long an exec of cktry's waits to be judged (its event comes at once)
const OWN_EXEC_TTL: Duration = Duration::from_secs(600);

/// Note an exec cktry starts, before it starts
pub fn own_exec(id: &str) {
    let mut own = own_execs().locked();
    if own.len() > 1_000 {
        own.retain(|_, at| at.elapsed() < OWN_EXEC_TTL);
    }
    own.insert(id.to_string(), Instant::now());
}

/// Whether cktry started the exec (judged once)
fn is_own_exec(id: &str) -> bool {
    own_execs().locked().remove(id).is_some()
}

/// cktry's own operations that exec through a CLI (kind reads the
/// kubeconfig with `docker exec`): an exec while one runs, or just after, is
/// cktry's
static OWN_OPERATIONS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
fn own_until() -> &'static Mutex<Option<Instant>> {
    static UNTIL: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    UNTIL.get_or_init(Default::default)
}

/// Held while cktry runs a command that execs in containers (kind)
pub struct OwnOperation(());

pub fn own_operation() -> OwnOperation {
    OWN_OPERATIONS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    OwnOperation(())
}

impl Drop for OwnOperation {
    fn drop(&mut self) {
        OWN_OPERATIONS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        *own_until().locked() = Some(Instant::now() + Duration::from_secs(2));
    }
}

fn in_own_operation() -> bool {
    OWN_OPERATIONS.load(std::sync::atomic::Ordering::SeqCst) > 0
        || own_until().locked().is_some_and(|until| until > Instant::now())
}

/// What the attempt runs on
#[derive(Clone, PartialEq)]
pub struct Watch {
    /// The attempt's clusters (kind cluster names)
    pub clusters: Vec<String>,
    /// Its other containers: the desktop, the task host, the mirror
    pub containers: Vec<String>,
}

#[derive(Default)]
struct Active {
    clusters: HashSet<String>,
    containers: HashSet<String>,
    /// Container ids seen, for network events (they give ids, not names)
    ids: HashMap<String, String>,
    /// cktry's own restarts (Reset desktop): not outside
    expected: HashMap<String, Instant>,
    /// The kind network's gateway: where the host's traffic comes from
    gateway: Option<String>,
}

pub struct Guard {
    active: Mutex<Option<Active>>,
    /// What `follow` was last asked for, and what `active` was made from
    wanted: Mutex<Option<Watch>>,
    applied: Mutex<Option<Watch>>,
    /// Held while the guard is brought to what is wanted: one change at a
    /// time, so a quick start-and-end cannot activate after deactivating
    changing: tokio::sync::Mutex<()>,
    /// What happened outside cktry during the attempt
    outside: Mutex<Vec<String>>,
    notify: Box<dyn Fn(&str) + Send + Sync>,
}

impl Guard {
    pub fn new(notify: impl Fn(&str) + Send + Sync + 'static) -> Arc<Self> {
        Arc::new(Self {
            active: Mutex::new(None),
            wanted: Mutex::default(),
            applied: Mutex::default(),
            changing: Default::default(),
            outside: Mutex::default(),
            notify: Box::new(notify),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<Active>> {
        self.active.locked()
    }

    /// Guard `watch` (an attempt is running) or nothing; the guard follows
    /// in the background, a repeat does nothing
    pub fn follow(self: &Arc<Self>, watch: Option<Watch>) {
        {
            let mut wanted = self.wanted.locked();
            if *wanted == watch {
                return;
            }
            *wanted = watch;
        }
        let guard = self.clone();
        tauri::async_runtime::spawn(async move {
            let docker = super::docker::connect().await.ok();
            guard.converge(docker.as_ref()).await;
        });
    }

    /// Bring the guard to what is wanted now. Without Docker an activation
    /// waits: `recheck` makes it when Docker is back
    async fn converge(&self, docker: Option<&Docker>) {
        let _changing = self.changing.lock().await;
        let wanted = self.wanted.locked().clone();
        let applied = self.applied.locked().clone();
        if wanted == applied {
            return;
        }
        if applied.is_some() {
            self.deactivate(docker).await;
        }
        if let (Some(watch), Some(docker)) = (wanted.clone(), docker) {
            self.activate(docker, watch).await;
            *self.applied.locked() = wanted;
        }
    }

    /// Start guarding an attempt: close the host's way to its API servers
    async fn activate(&self, docker: &Docker, watch: Watch) {
        let gateway = docker
            .inspect_network(NETWORK, None::<bollard::query_parameters::InspectNetworkOptions>)
            .await
            .ok()
            .and_then(|n| n.ipam?.config?.into_iter().find_map(|c| c.gateway));
        *self.lock() = Some(Active {
            clusters: watch.clusters.iter().cloned().collect(),
            containers: watch.containers.into_iter().collect(),
            gateway: gateway.clone(),
            ..Default::default()
        });
        if let Some(gateway) = &gateway {
            for cluster in &watch.clusters {
                block_host(docker, &format!("{cluster}-control-plane"), gateway).await;
            }
        }
    }

    /// Stop guarding (the attempt ends): the host may reach the clusters again
    async fn deactivate(&self, docker: Option<&Docker>) {
        self.applied.locked().take();
        let Some(active) = self.lock().take() else { return };
        if let (Some(docker), Some(gateway)) = (docker, &active.gateway) {
            for cluster in &active.clusters {
                unblock_host(docker, &format!("{cluster}-control-plane"), gateway).await;
            }
        }
    }

    /// After a gap in the events (Docker reconnected): start what of the
    /// attempt is stopped or paused, and close the API servers to the host again
    pub async fn recheck(self: &Arc<Self>, docker: &Docker) {
        // An activation Docker was down for
        self.converge(Some(docker)).await;
        let Some((containers, clusters, gateway)) =
            self.lock().as_ref().map(|a| (a.containers.clone(), a.clusters.clone(), a.gateway.clone()))
        else {
            return;
        };
        let mut names: Vec<String> = containers.into_iter().collect();
        if let Ok(nodes) = node_containers(docker, None).await {
            names.extend(nodes.into_iter().filter(|n| clusters.contains(&n.cluster)).map(|n| n.name));
        }
        for name in names {
            let Ok(c) = docker.inspect_container(&name, None).await else { continue };
            let state = c.state.unwrap_or_default();
            if state.paused == Some(true) {
                self.record(format!("{name} was paused while cktry lost Docker: resumed"));
                let _ = docker.unpause_container(&name).await;
            } else if state.running != Some(true) {
                self.record(format!("{name} was not running when Docker came back: started again"));
                let _ = docker.start_container(&name, None::<bollard::query_parameters::StartContainerOptions>).await;
            }
        }
        if let Some(gateway) = gateway {
            for cluster in &clusters {
                block_host(docker, &format!("{cluster}-control-plane"), &gateway).await;
            }
        }
    }

    /// Stop reacting at once, without undoing anything (the app is quitting
    /// and stops the containers itself; a resume guards them again)
    pub fn suspend(&self) {
        self.wanted.locked().take();
        self.applied.locked().take();
        self.lock().take();
    }

    /// Whether the cluster is guarded (the host cannot reach its API server)
    pub fn guards(&self, cluster: &str) -> bool {
        self.lock().as_ref().is_some_and(|a| a.clusters.contains(cluster))
    }

    /// cktry is about to restart `container` itself (Reset desktop)
    pub fn expect(&self, container: &str) {
        if let Some(a) = self.lock().as_mut() {
            a.expected.insert(container.to_string(), Instant::now() + Duration::from_secs(60));
        }
    }

    /// What happened outside cktry so far
    #[cfg(test)]
    pub fn outside(&self) -> Vec<String> {
        self.outside.locked().clone()
    }

    /// What happened outside cktry, for the result; cleared
    pub fn take_outside(&self) -> Vec<String> {
        std::mem::take(&mut *self.outside.locked())
    }

    fn record(&self, what: String) {
        tracing::warn!(target: "guard", "{what}");
        (self.notify)(&what);
        let mut outside = self.outside.locked();
        if !outside.contains(&what) {
            outside.push(what);
        }
    }

    /// One Docker event (from the monitor's stream)
    pub fn on_event(self: &Arc<Self>, docker: &Docker, event: &EventMessage) {
        let action = event.action.as_deref().unwrap_or_default();
        let actor = event.actor.as_ref();
        let attr = |k: &str| actor.and_then(|a| a.attributes.as_ref()).and_then(|m| m.get(k)).cloned().unwrap_or_default();
        match event.typ {
            Some(EventMessageTypeEnum::CONTAINER) => {
                let name = attr("name");
                let id = actor.and_then(|a| a.id.clone()).unwrap_or_default();
                let (ours, expected, gateway) = {
                    let mut guard = self.lock();
                    let Some(a) = guard.as_mut() else { return };
                    let ours = a.containers.contains(&name) || a.clusters.contains(&attr(CLUSTER_LABEL));
                    if ours {
                        a.ids.insert(id.clone(), name.clone());
                    }
                    a.expected.retain(|_, until| *until > Instant::now());
                    (ours, a.expected.contains_key(&name), a.gateway.clone())
                };
                if !ours {
                    return;
                }
                let (this, docker) = (self.clone(), docker.clone());
                match action.split(':').next().unwrap_or_default() {
                    // Judged a moment later: cktry notes its own exec right after
                    // creating it, which can be after Docker reports it
                    "exec_create" if !in_own_operation() => {
                        let exec_id = attr("execID");
                        let command = action.trim_start_matches("exec_create:").trim().chars().take(80).collect::<String>();
                        tokio::spawn(async move {
                            tokio::time::sleep(Duration::from_secs(1)).await;
                            if !is_own_exec(&exec_id) {
                                this.record(format!("A command was run in {name} from outside the exam desktop: {command}"));
                            }
                        });
                    }
                    "die" if !expected => {
                        tokio::spawn(async move {
                            // `unless-stopped` brings a crash back by itself; a stop is put back here
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            let running = docker
                                .inspect_container(&name, None)
                                .await
                                .ok()
                                .and_then(|c| c.state?.running)
                                .unwrap_or(false);
                            if !running {
                                this.record(format!("{name} was stopped outside cktry: started again"));
                                let _ = docker.start_container(&name, None::<bollard::query_parameters::StartContainerOptions>).await;
                            }
                        });
                    }
                    "pause" => {
                        tokio::spawn(async move {
                            this.record(format!("{name} was paused outside cktry: resumed"));
                            let _ = docker.unpause_container(&name).await;
                        });
                    }
                    "destroy" if !expected => {
                        self.record(format!("{name} was removed outside cktry: end the exam and start it again"));
                    }
                    // A control plane started again lost its firewall rule
                    "start" if name.ends_with("-control-plane") => {
                        if let Some(gateway) = gateway {
                            tokio::spawn(async move { block_host(&docker, &name, &gateway).await });
                        }
                    }
                    _ => {}
                }
            }
            Some(EventMessageTypeEnum::NETWORK) if action == "disconnect" && attr("name") == NETWORK => {
                let id = attr("container");
                let name = self.lock().as_ref().and_then(|a| a.ids.get(&id).cloned());
                if let Some(name) = name {
                    let (this, docker) = (self.clone(), docker.clone());
                    tokio::spawn(async move {
                        // A stop or a restart disconnects too: only a running
                        // container left off the network was disconnected
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        let Ok(c) = docker.inspect_container(&id, None).await else { return };
                        let running = c.state.and_then(|s| s.running).unwrap_or(false);
                        let attached = c.network_settings.and_then(|n| n.networks).is_some_and(|n| n.contains_key(NETWORK));
                        if running && !attached {
                            this.record(format!("{name} was disconnected from the {NETWORK} network outside cktry: connected again"));
                            let request = NetworkConnectRequest { container: id, ..Default::default() };
                            let _ = docker.connect_network(NETWORK, request).await;
                        }
                    });
                }
            }
            Some(EventMessageTypeEnum::VOLUME) if action == "destroy" => {
                let name = actor.and_then(|a| a.id.clone()).unwrap_or_default();
                if self.lock().is_some() && name.starts_with("cktry") {
                    self.record(format!("Volume {name} was removed outside cktry"));
                }
            }
            _ => {}
        }
    }
}

/// Refuse the host's connections to the API server (port 6443 from the
/// gateway); idempotent
async fn block_host(docker: &Docker, node: &str, gateway: &str) {
    let rule = format!("INPUT -p tcp --dport 6443 -s {gateway} -m comment --comment {RULE_COMMENT} -j DROP");
    let script = format!("iptables -C {rule} 2>/dev/null || iptables -I {rule}");
    if let Err(e) = exec::run(docker, node, &["sh", "-c", &script], &[], None).await {
        tracing::warn!(%node, error = %e, "closing the API server to the host");
    }
}

async fn unblock_host(docker: &Docker, node: &str, gateway: &str) {
    let rule = format!("INPUT -p tcp --dport 6443 -s {gateway} -m comment --comment {RULE_COMMENT} -j DROP");
    let script = format!("while iptables -D {rule} 2>/dev/null; do :; done");
    let _ = exec::run(docker, node, &["sh", "-c", &script], &[], None).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_app_s_own_execs_are_judged_once() {
        own_exec("abc123own");
        assert!(is_own_exec("abc123own") && !is_own_exec("abc123own"));
        assert!(!is_own_exec("someone-else"));
    }
}
