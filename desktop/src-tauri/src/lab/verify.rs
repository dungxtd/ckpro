//! `ckpro lab verify`: prove a pack grades correctly. Each run is isolated:
//! its own kind clusters (`<logical>-v<run>`), kubeconfigs, jumphost and
//! Docker network (`ckpro-run-<run>`), so runs go in parallel and neither
//! touch nor reach the app's exam clusters.
//!
//! For the selected questions a run builds their clusters, runs every setup
//! like an exam does, then per question: all checks must FAIL, the solution
//! must succeed, and all checks must PASS. A check that passes before the
//! solution cannot tell a solved task from an unsolved one.

use super::checks::{self, CheckResult};
use super::load::LoadedPack;
use super::model::Question;
use super::render;
use crate::cluster::{kind::Kind, lifecycle};
use crate::error::{AppError, AppResult};
use crate::sync::MutexExt;
use crate::runtime::jumphost::{self, Jumphost, Placement};
use crate::runtime::{docker, infra::{self, Infra}};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;
use std::time::{Duration, Instant};

#[derive(Serialize)]
pub struct Report {
    pub question: String,
    pub ok: bool,
    pub problems: Vec<String>,
    pub before: Vec<CheckResult>,
    pub after: Vec<CheckResult>,
}

pub type Log<'a> = &'a (dyn Fn(String) + Sync);

/// Where a run of questions is, as it goes
pub enum Stage<'a> {
    /// Every question's setup, as an exam's
    SettingUp,
    /// The question at this index (of the ids given) is being proven
    Proving(usize),
    /// It was: its report
    Proved(usize, &'a Report),
}

pub type OnStage<'a> = &'a (dyn Fn(Stage) + Sync);

/// Verify `ids` in a run of their own. `keep` leaves the run's clusters and
/// jumphost for inspection.
pub async fn verify(
    pack: &LoadedPack,
    ids: &[String],
    data_dir: &Path,
    infra: &Infra,
    keep: bool,
    log: Log<'_>,
) -> AppResult<Vec<Report>> {
    // One cluster per logical name, as large as its most demanding question
    let mut topology = Topology::new();
    for id in ids {
        let q = &pack.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?.value;
        let workers = topology.entry(q.cluster.clone()).or_default();
        *workers = (*workers).max(q.workers);
    }
    let run = Run::new(data_dir)?;
    let result = async {
        run.start(infra, &topology, &CancellationToken::new(), log).await?;
        run.check(pack, ids, None, log, &|_| {}).await
    }
    .await;
    if keep {
        run.keep(log);
    } else {
        run.finish(log).await;
    }
    result
}

/// Clusters by logical name, with their worker count
pub type Topology = BTreeMap<String, u8>;

/// A verify run: its clusters (`<logical>-v<run>`) and jumphost, made once
/// and checked against as many times as wanted, then finished. Its directory
/// (with the process's pid) marks it in use until then, so `sweep_stale`
/// leaves it alone
pub struct Run {
    id: String,
    dir: PathBuf,
    kind: Kind,
    jumphost: Jumphost,
    placement: std::sync::Mutex<Placement>,
}

impl Run {
    pub fn new(data_dir: &Path) -> AppResult<Self> {
        // A directory of its own, made only if it was not there: two runs at
        // once never share an id (their cluster names, their network)
        let runs = data_dir.join("runs");
        std::fs::create_dir_all(&runs).map_err(|e| AppError::io("creating run dir", e))?;
        let (id, dir) = loop {
            let id = format!("{:04x}", rand::random::<u16>());
            let dir = runs.join(&id);
            match std::fs::create_dir(&dir) {
                Ok(()) => break (id, dir),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(AppError::io("creating run dir", e)),
            }
        };
        std::fs::write(dir.join("pid"), std::process::id().to_string()).map_err(|e| AppError::io("creating run dir", e))?;
        Ok(Self {
            kind: Kind::scoped(data_dir.to_path_buf(), dir.join("kind"), jumphost::run_network(&id)),
            jumphost: Jumphost::for_run(data_dir, &id),
            id,
            dir,
            placement: Default::default(),
        })
    }

    /// Make the clusters of `topology` and the run's jumphost; stops (and
    /// removes the cluster being made) when `cancel` fires
    pub async fn start(&self, infra: &Infra, topology: &Topology, cancel: &CancellationToken, log: Log<'_>) -> AppResult<()> {
        let placement: Placement = topology.keys().map(|c| (c.clone(), format!("{c}-v{}", self.id))).collect();
        *self.placement.locked() = placement.clone();
        let docker = docker::connect().await?;
        // A network of its own: its scripts do not see the app's clusters,
        // nor other runs'; the registry mirror joins it for the nodes' pulls
        infra.ensure(&docker, log).await?;
        let network = jumphost::run_network(&self.id);
        if docker.inspect_network(&network, None::<bollard::query_parameters::InspectNetworkOptions>).await.is_err() {
            let labels = docker::compose_labels(&network).into_iter().collect();
            docker.create_network(bollard::models::NetworkCreateRequest { name: network.clone(), labels: Some(labels), ..Default::default() }).await?;
        }
        let mirror = bollard::models::NetworkConnectRequest { container: infra::MIRROR.into(), ..Default::default() };
        if let Err(e) = docker.connect_network(&network, mirror).await
            && !e.to_string().contains("already exists")
        {
            return Err(e.into());
        }
        for (logical, workers) in topology {
            let physical = &placement[logical];
            log(format!("[{}] creating cluster {logical} ({physical}) with {workers} workers", self.id));
            lifecycle::create(&self.kind, infra, physical, *workers, log, cancel).await?;
        }
        self.jumphost.ensure(&docker, log).await?;
        let needed: Vec<String> = placement.keys().cloned().collect();
        self.jumphost.give_access(&docker, &self.kind, &placement, &needed).await
    }

    /// Run `ids` on the run's clusters: every setup, then per question the
    /// checks before and after its solution; only for those in `only` when
    /// given (the others' setups still run)
    pub async fn check(
        &self,
        pack: &LoadedPack,
        ids: &[String],
        only: Option<&std::collections::HashSet<String>>,
        log: Log<'_>,
        on: OnStage<'_>,
    ) -> AppResult<Vec<Report>> {
        let placement = self.placement.locked().clone();
        let mut questions = Vec::new();
        for id in ids {
            let q = &pack.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?.value;
            let physical = placement
                .get(&q.cluster)
                .ok_or_else(|| AppError::invalid(format!("'{id}' needs cluster {}, which this run does not have", q.cluster)))?;
            questions.push((id.clone(), render::render(q, &render::pick(q, true), physical)));
        }
        let docker = docker::connect().await?;
        run_questions(&docker, &self.jumphost.name, &questions, only, &self.id, log, on).await
    }

    /// Leave the clusters and jumphost for inspection
    pub fn keep(&self, log: Log<'_>) {
        let _ = std::fs::write(self.dir.join("keep"), "");
        let placement = self.placement.locked().clone();
        log(format!("[{}] kept clusters {:?} and {}", self.id, placement.values().collect::<Vec<_>>(), self.jumphost.name));
    }

    /// Remove the clusters' nodes and the jumphost from a process of their
    /// own (the app quits); the next `sweep_stale` takes the run's network
    /// and files
    pub fn remove_detached(&self) {
        let clusters: Vec<String> = self.placement.locked().values().cloned().collect();
        docker::on_quit(docker::OnQuit::Remove, &clusters, std::slice::from_ref(&self.jumphost.name));
    }

    /// Remove the clusters, the jumphost and the run's files
    pub async fn finish(&self, log: Log<'_>) {
        let placement = self.placement.locked().clone();
        for physical in placement.values() {
            if let Err(e) = lifecycle::delete(&self.kind, physical, log).await {
                log(format!("[{}] could not delete cluster {physical}: {e}", self.id));
            }
        }
        if let Ok(docker) = docker::connect().await {
            let _ = self.jumphost.remove(&docker).await;
            remove_network(&docker, &jumphost::run_network(&self.id)).await;
        }
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Remove what verify runs left behind when their process was killed or
/// crashed: clusters (with their node volumes, ~1 GB per node), jumphosts and
/// files. Runs still in progress and `--keep` runs are left alone.
pub async fn sweep_stale(data_dir: &Path, log: Log<'_>) {
    let runs = data_dir.join("runs");
    let in_use = |run: &str| {
        let dir = runs.join(run);
        dir.join("keep").exists()
            || std::fs::read_to_string(dir.join("pid"))
                .ok()
                .and_then(|pid| pid.trim().parse::<u32>().ok())
                .is_some_and(crate::platform::process_alive)
    };

    // The runs ckpro left a trace of (their directory, their task host): a
    // kind cluster only looks like a run's by its name, and may be the user's
    let docker = docker::connect().await.ok();
    let mut jumphosts = Vec::new();
    if let Some(docker) = &docker {
        jumphosts = docker
            .list_containers(Some(bollard::query_parameters::ListContainersOptions {
                all: true,
                filters: Some(std::collections::HashMap::from([("name".to_string(), vec![jumphost::RUN_PREFIX.to_string()])])),
                ..Default::default()
            }))
            .await
            .unwrap_or_default()
            .into_iter()
            .flat_map(|c| c.names.unwrap_or_default())
            .map(|name| name.trim_start_matches('/').to_string())
            .collect();
    }
    let ours = |run: &str| {
        runs.join(run).is_dir() || jumphosts.iter().any(|name| name.strip_prefix(jumphost::RUN_PREFIX) == Some(run))
    };

    let kind = Kind::new(data_dir.to_path_buf());
    let app_clusters = kind.owned_clusters();
    for cluster in kind.all_clusters().await.unwrap_or_default() {
        let Some(run) = run_of_cluster(&cluster) else { continue };
        if !app_clusters.contains(&cluster) && ours(run) && !in_use(run) {
            log(format!("removing cluster {cluster} left by an interrupted verify run"));
            if let Err(e) = lifecycle::delete(&kind, &cluster, log).await {
                log(format!("could not remove {cluster}: {e}"));
            }
        }
    }
    if let Some(docker) = &docker {
        for name in &jumphosts {
            if let Some(run) = name.strip_prefix(jumphost::RUN_PREFIX).filter(|run| !in_use(run)) {
                log(format!("removing {name} left by an interrupted verify run"));
                let _ = Jumphost::for_run(data_dir, run).remove(docker).await;
            }
        }
    }
    if let Some(docker) = &docker {
        let networks = docker
            .list_networks(Some(bollard::query_parameters::ListNetworksOptions {
                filters: Some(std::collections::HashMap::from([("name".to_string(), vec![jumphost::RUN_NETWORK_PREFIX.to_string()])])),
            }))
            .await
            .unwrap_or_default();
        for name in networks.into_iter().filter_map(|n| n.name) {
            if let Some(run) = name.strip_prefix(jumphost::RUN_NETWORK_PREFIX).filter(|run| !in_use(run)) {
                log(format!("removing network {name} left by an interrupted verify run ({run})"));
                remove_network(docker, &name).await;
            }
        }
    }
    for entry in std::fs::read_dir(&runs).into_iter().flatten().flatten() {
        let run = entry.file_name().to_string_lossy().into_owned();
        if !in_use(&run) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Remove a run's network, the registry mirror taken off it first
async fn remove_network(docker: &bollard::Docker, network: &str) {
    let mirror = bollard::models::NetworkDisconnectRequest { container: infra::MIRROR.into(), force: Some(true) };
    let _ = docker.disconnect_network(network, mirror).await;
    let _ = docker.remove_network(network).await;
}

/// `k8s-v1a2b` → `1a2b`
fn run_of_cluster(cluster: &str) -> Option<&str> {
    let (_, run) = cluster.rsplit_once("-v")?;
    (run.len() == 4 && run.bytes().all(|b| b.is_ascii_hexdigit())).then_some(run)
}


async fn run_questions(
    docker: &bollard::Docker,
    jumphost: &str,
    questions: &[(String, Question)],
    only: Option<&std::collections::HashSet<String>>,
    run: &str,
    log: Log<'_>,
    on: OnStage<'_>,
) -> AppResult<Vec<Report>> {
    // Like an exam: every task is set up before the candidate starts
    on(Stage::SettingUp);
    let mut setup_failed = BTreeMap::new();
    for (id, q) in questions {
        if let Some(setup) = &q.setup {
            log(format!("[{run}] setting up {id}"));
            let (exit, output) = checks::run_script(docker, jumphost, &q.cluster, setup, checks::SCRIPT_TIMEOUT_SECS).await?;
            if exit != 0 {
                setup_failed.insert(id.clone(), tail(&output));
            }
        }
    }

    let mut reports = Vec::new();
    for (index, (id, q)) in questions.iter().enumerate() {
        if only.is_some_and(|only| !only.contains(id)) {
            continue;
        }
        on(Stage::Proving(index));
        log(format!("[{run}] verifying {id}"));
        let mut problems = Vec::new();
        if let Some(output) = setup_failed.get(id) {
            problems.push(format!("setup failed: {output}"));
        }
        let all = || q.checks.iter().map(|c| (q.cluster.as_str(), c));
        let before = checks::run_checks(docker, jumphost, all(), |_, _| {}).await?;
        for c in before.iter().filter(|c| c.passed) {
            problems.push(format!("check passes before the solution: {}", c.name));
        }
        let (exit, output) =
            checks::run_script(docker, jumphost, &q.cluster, &q.solution.run, checks::SCRIPT_TIMEOUT_SECS).await?;
        if exit != 0 {
            problems.push(format!("solution failed (exit {exit}): {}", tail(&output)));
        }
        // Grading happens minutes after the candidate's last command: give
        // pods, rollouts and mirror pods up to a minute to settle, re-running
        // only the checks that still fail
        let mut after = checks::run_checks(docker, jumphost, all(), |_, _| {}).await?;
        let deadline = Instant::now() + Duration::from_secs(60);
        while after.iter().any(|c| !c.passed) && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let failing: Vec<usize> = (0..after.len()).filter(|&i| !after[i].passed).collect();
            let rerun = failing.iter().map(|&i| (q.cluster.as_str(), &q.checks[i]));
            for (i, result) in failing.iter().zip(checks::run_checks(docker, jumphost, rerun, |_, _| {}).await?) {
                after[*i] = result;
            }
        }
        for c in after.iter().filter(|c| !c.passed) {
            problems.push(format!("check fails after the solution: {} ({})", c.name, c.detail));
        }
        let report = Report { question: id.clone(), ok: problems.is_empty(), problems, before, after };
        on(Stage::Proved(index, &report));
        reports.push(report);
    }
    Ok(reports)
}

/// Last few lines of a script's output
fn tail(output: &str) -> String {
    let lines: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(3)..].join(" | ")
}
