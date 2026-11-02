//! `cktry lab verify`: prove a pack grades correctly. Each run is isolated:
//! its own kind clusters (`<logical>-v<run>`), kubeconfigs and jumphost, so
//! runs go in parallel and never touch the app's exam clusters.
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
use crate::runtime::jumphost::{self, Jumphost, Placement};
use crate::runtime::{docker, infra::Infra};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;
use std::time::{Duration, Instant};

#[derive(Serialize)]
pub struct Report {
    pub question: String,
    pub ok: bool,
    pub problems: Vec<String>,
    pub before: Vec<CheckResult>,
    pub after: Vec<CheckResult>,
}

type Log<'a> = &'a (dyn Fn(String) + Sync);

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
    let run = format!("{:04x}", rand::random::<u16>());
    let run_dir = data_dir.join("runs").join(&run);
    let kind = Kind::scoped(data_dir.to_path_buf(), run_dir.join("kind"));
    let jumphost = Jumphost::for_run(data_dir, &run);
    // Marks the run as in use; `sweep_stale` cleans up after a run whose
    // process is gone, `keep` ones excepted
    std::fs::create_dir_all(&run_dir).map_err(|e| AppError::io("creating run dir", e))?;
    std::fs::write(run_dir.join("pid"), std::process::id().to_string()).map_err(|e| AppError::io("creating run dir", e))?;

    // One cluster per logical name, as large as its most demanding question
    let mut topology: BTreeMap<String, u8> = BTreeMap::new();
    for id in ids {
        let q = &pack.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?.value;
        let workers = topology.entry(q.cluster.clone()).or_default();
        *workers = (*workers).max(q.workers);
    }
    let placement: Placement = topology.keys().map(|c| (c.clone(), format!("{c}-v{run}"))).collect();
    let questions: Vec<(String, Question)> = ids
        .iter()
        .map(|id| {
            let q = &pack.questions[id].value;
            (id.clone(), render::render(q, &render::pick(q, true), &placement[&q.cluster]))
        })
        .collect();

    let docker = docker::connect().await?;
    let result = async {
        for (logical, workers) in &topology {
            let physical = &placement[logical];
            log(format!("[{run}] creating cluster {logical} ({physical}) with {workers} workers"));
            lifecycle::create(&kind, infra, physical, *workers, log, &Default::default()).await?;
        }
        jumphost.ensure(&docker, log).await?;
        jumphost.refresh_access(&docker, &kind, &placement).await?;
        run_questions(&docker, &jumphost.name, &questions, &run, log).await
    }
    .await;

    if keep {
        let _ = std::fs::write(run_dir.join("keep"), "");
        log(format!("[{run}] kept clusters {:?} and {}", placement.values().collect::<Vec<_>>(), jumphost.name));
    } else {
        for physical in placement.values() {
            if let Err(e) = lifecycle::delete(&kind, physical, log).await {
                log(format!("[{run}] could not delete cluster {physical}: {e}"));
            }
        }
        let _ = jumphost.remove(&docker).await;
        let _ = std::fs::remove_dir_all(&run_dir);
    }
    result
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
                .is_some_and(process_alive)
    };

    // The runs cktry left a trace of (their directory, their task host): a
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
    for entry in std::fs::read_dir(&runs).into_iter().flatten().flatten() {
        let run = entry.file_name().to_string_lossy().into_owned();
        if !in_use(&run) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// `k8s-v1a2b` → `1a2b`
fn run_of_cluster(cluster: &str) -> Option<&str> {
    let (_, run) = cluster.rsplit_once("-v")?;
    (run.len() == 4 && run.bytes().all(|b| b.is_ascii_hexdigit())).then_some(run)
}

fn process_alive(pid: u32) -> bool {
    pid == std::process::id()
        || std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
}

async fn run_questions(
    docker: &bollard::Docker,
    jumphost: &str,
    questions: &[(String, Question)],
    run: &str,
    log: Log<'_>,
) -> AppResult<Vec<Report>> {
    // Like an exam: every task is set up before the candidate starts
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
    for (id, q) in questions {
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
        reports.push(Report { question: id.clone(), ok: problems.is_empty(), problems, before, after });
    }
    Ok(reports)
}

/// Last few lines of a script's output
fn tail(output: &str) -> String {
    let lines: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(3)..].join(" | ")
}
