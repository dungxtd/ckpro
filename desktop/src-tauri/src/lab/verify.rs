//! `ckdry lab verify`: prove a pack grades correctly. For the selected
//! questions it builds their clusters, runs every setup like an exam does,
//! then per question: all checks must FAIL, the solution must succeed, and
//! all checks must PASS. A check that passes before the solution cannot tell
//! a solved task from an unsolved one.

use super::checks::{self, CheckResult};
use super::load::LoadedPack;
use super::model::Question;
use super::render;
use crate::cluster::{kind::Kind, lifecycle};
use crate::error::{AppError, AppResult};
use crate::runtime::{docker, infra::Infra};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct Report {
    pub question: String,
    pub ok: bool,
    pub problems: Vec<String>,
    pub before: Vec<CheckResult>,
    pub after: Vec<CheckResult>,
}

pub struct Options {
    /// Keep the clusters afterwards for inspection
    pub keep: bool,
    /// Delete clusters that already use the questions' cluster names
    pub replace: bool,
}

type Log<'a> = &'a (dyn Fn(String) + Sync);

pub async fn verify(
    pack: &LoadedPack,
    ids: &[String],
    kind: &Kind,
    infra: &Infra,
    options: &Options,
    log: Log<'_>,
) -> AppResult<Vec<Report>> {
    let questions: Vec<(String, Question)> = ids
        .iter()
        .map(|id| {
            let q = pack.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?;
            Ok((id.clone(), render::render(&q.value, &render::pick(&q.value, true))))
        })
        .collect::<AppResult<_>>()?;

    // One cluster per name, as large as its most demanding question
    let mut clusters: BTreeMap<String, u8> = BTreeMap::new();
    for (_, q) in &questions {
        let workers = clusters.entry(q.cluster.clone()).or_default();
        *workers = (*workers).max(q.workers);
    }
    for name in clusters.keys() {
        if kind.owned_clusters().contains(name) {
            if !options.replace {
                return Err(AppError::invalid(format!(
                    "cluster '{name}' already exists (an exam in the app?). Delete it or pass --replace."
                )));
            }
            lifecycle::delete(kind, infra, name, log).await?;
        }
    }

    let docker = docker::connect().await?;
    let mut reports = Vec::new();
    let result = async {
        for (name, workers) in &clusters {
            log(format!("Creating cluster {name} with {workers} workers"));
            lifecycle::create(kind, infra, name, *workers, log, &Default::default()).await?;
        }
        infra.reset_jumphost(&docker, log).await?;

        // Like an exam: every task is set up before the candidate starts
        let mut setup_failed = BTreeMap::new();
        for (id, q) in &questions {
            if let Some(setup) = &q.setup {
                log(format!("Setting up {id}"));
                let (exit, output) = checks::run_script(&docker, &q.cluster, setup).await?;
                if exit != 0 {
                    setup_failed.insert(id.clone(), tail(&output));
                }
            }
        }

        for (id, q) in &questions {
            log(format!("Verifying {id}"));
            let mut problems = Vec::new();
            if let Some(output) = setup_failed.get(id) {
                problems.push(format!("setup failed: {output}"));
            }
            let mut before = Vec::new();
            for check in &q.checks {
                before.push(checks::run_check(&docker, &q.cluster, check).await?);
            }
            for c in before.iter().filter(|c| c.passed) {
                problems.push(format!("check passes before the solution: {}", c.name));
            }
            let (exit, output) = checks::run_script(&docker, &q.cluster, &q.solution.run).await?;
            if exit != 0 {
                problems.push(format!("solution failed (exit {exit}): {}", tail(&output)));
            }
            let mut after = Vec::new();
            for check in &q.checks {
                after.push(checks::run_check(&docker, &q.cluster, check).await?);
            }
            for c in after.iter().filter(|c| !c.passed) {
                problems.push(format!("check fails after the solution: {} ({})", c.name, c.detail));
            }
            reports.push(Report { question: id.clone(), ok: problems.is_empty(), problems, before, after });
        }
        Ok::<_, AppError>(())
    }
    .await;

    if !options.keep {
        for name in clusters.keys() {
            if let Err(e) = lifecycle::delete(kind, infra, name, log).await {
                log(format!("could not delete cluster {name}: {e}"));
            }
        }
    }
    result.map(|_| reports)
}

/// Last few lines of a script's output
fn tail(output: &str) -> String {
    let lines: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(3)..].join(" | ")
}
