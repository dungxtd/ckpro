//! `ckdry lab verify`: prove a pack grades correctly. Each run is isolated:
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
use crate::runtime::jumphost::{Jumphost, Placement};
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
        let mut before = Vec::new();
        for check in &q.checks {
            before.push(checks::run_check(docker, jumphost, &q.cluster, check).await?);
        }
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
        let mut after = Vec::new();
        for check in &q.checks {
            after.push(checks::run_check(docker, jumphost, &q.cluster, check).await?);
        }
        let deadline = Instant::now() + Duration::from_secs(60);
        while after.iter().any(|c| !c.passed) && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_secs(5)).await;
            for (result, check) in after.iter_mut().zip(&q.checks) {
                if !result.passed {
                    *result = checks::run_check(docker, jumphost, &q.cluster, check).await?;
                }
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
