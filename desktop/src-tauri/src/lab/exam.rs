//! The exam engine: one attempt at a time, from preparing clusters to the
//! result. Its state is pushed to the UI on every change (ExamChanged).
//!
//! Exam mode is the real thing: no hints, no checking, no solutions until the
//! result. Practice mode adds hints, per-question checks and solutions, and
//! has no time limit. Hidden material never leaves Rust in exam mode.

use super::checks::{self, CheckResult};
use super::load::LoadedPack;
use super::model::{Exam, Question, Solution};
use super::render;
use crate::cluster::{kind::Kind, lifecycle};
use crate::error::{AppError, AppResult};
use crate::runtime::jumphost::{self, Jumphost};
use crate::runtime::{docker, infra::Infra};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Exam,
    Practice,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ExamSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub certification: String,
    pub questions: u32,
    pub duration_minutes: u32,
    pub pass_score: u32,
}

/// What the candidate sees of a question.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct QuestionView {
    pub id: String,
    pub title: String,
    pub cluster: String,
    pub namespace: Option<String>,
    /// Share of the exam's points, in percent
    pub weight: f64,
    pub statement: String,
    /// Practice mode only
    pub hints: Vec<String>,
    pub references: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Attempt {
    pub id: String,
    pub exam_id: String,
    pub title: String,
    pub certification: String,
    pub mode: Mode,
    pub pass_score: u32,
    pub questions: Vec<QuestionView>,
    /// Clusters the attempt runs on (deleted when it ends)
    pub clusters: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct QuestionResult {
    pub id: String,
    pub title: String,
    pub points: u32,
    pub max_points: u32,
    pub checks: Vec<CheckResult>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ExamResult {
    pub score: f64,
    pub passed: bool,
    /// Unix milliseconds
    pub started_at: f64,
    pub finished_at: f64,
    pub questions: Vec<QuestionResult>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum ExamState {
    #[default]
    Idle,
    Preparing { attempt: Attempt, step: String, done: u32, total: u32 },
    /// `ends_at` is unset in practice mode (no time limit)
    Running { attempt: Attempt, started_at: f64, ends_at: Option<f64> },
    Grading { attempt: Attempt, done: u32, total: u32 },
    Finished { attempt: Attempt, result: ExamResult },
    Failed { attempt: Option<Attempt>, message: String },
}

impl ExamState {
    fn attempt(&self) -> Option<&Attempt> {
        match self {
            ExamState::Idle => None,
            ExamState::Preparing { attempt, .. }
            | ExamState::Running { attempt, .. }
            | ExamState::Grading { attempt, .. }
            | ExamState::Finished { attempt, .. } => Some(attempt),
            ExamState::Failed { attempt, .. } => attempt.as_ref(),
        }
    }
}

/// History entry, one JSON file per finished attempt.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntry {
    pub attempt_id: String,
    pub exam_id: String,
    pub title: String,
    pub mode: Mode,
    pub pass_score: u32,
    pub result: ExamResult,
}

pub struct Exams {
    pack: LoadedPack,
    kind: Arc<Kind>,
    infra: Arc<Infra>,
    jumphost: Arc<Jumphost>,
    history_dir: PathBuf,
    state: Mutex<ExamState>,
    /// Rendered questions of the current attempt (with solutions)
    session: Mutex<Vec<(String, Question)>>,
    cancel: Mutex<CancellationToken>,
    publish: Box<dyn Fn(&ExamState) + Send + Sync>,
}

impl Exams {
    pub fn new(
        pack: LoadedPack,
        kind: Arc<Kind>,
        infra: Arc<Infra>,
        jumphost: Arc<Jumphost>,
        history_dir: PathBuf,
        publish: impl Fn(&ExamState) + Send + Sync + 'static,
    ) -> Self {
        Self {
            pack,
            kind,
            infra,
            jumphost,
            history_dir,
            state: Mutex::new(ExamState::Idle),
            session: Mutex::new(Vec::new()),
            cancel: Mutex::new(CancellationToken::new()),
            publish: Box::new(publish),
        }
    }

    pub fn state(&self) -> ExamState {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    fn set(&self, state: ExamState) {
        *self.state.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
        (self.publish)(&state);
    }

    pub fn catalog(&self) -> Vec<ExamSummary> {
        self.pack
            .exams
            .iter()
            .filter_map(|(id, e)| {
                let cert = self.pack.pack.certifications.get(&e.value.certification)?;
                let fixed = e
                    .value
                    .questions
                    .iter()
                    .filter(|id| self.pack.questions.get(*id).is_some_and(|q| q.value.runnable()))
                    .count() as u32;
                Some(ExamSummary {
                    id: id.clone(),
                    title: e.value.title.clone(),
                    description: e.value.description.clone(),
                    certification: e.value.certification.clone(),
                    questions: fixed + e.value.random.as_ref().map_or(0, |r| r.count),
                    duration_minutes: (e.value.duration.as_ref().unwrap_or(&cert.duration).seconds().unwrap_or(0) / 60) as u32,
                    pass_score: e.value.pass_score.unwrap_or(cert.pass_score),
                })
            })
            .collect()
    }

    /// Start an attempt. Clusters with the names the exam needs must not exist
    /// unless `replace` (they are deleted).
    pub async fn start(self: &Arc<Self>, exam_id: &str, mode: Mode, replace: bool) -> AppResult<()> {
        if matches!(self.state(), ExamState::Preparing { .. } | ExamState::Running { .. } | ExamState::Grading { .. }) {
            return Err(AppError::invalid("an exam is already in progress"));
        }
        let exam = self.pack.exams.get(exam_id).ok_or_else(|| AppError::not_found(format!("no exam '{exam_id}'")))?;
        let exam = exam.value.clone();
        let cert = self.pack.pack.certifications.get(&exam.certification).cloned().ok_or_else(|| AppError::invalid("unknown certification"))?;

        let questions = self.draw(&exam);
        let clusters = topology(&questions);
        let existing = self.kind.all_clusters().await?;
        let taken: Vec<&String> = clusters.keys().filter(|c| existing.contains(*c)).collect();
        if !taken.is_empty() && !replace {
            return Err(AppError::invalid(format!(
                "cluster {} already exists; starting the exam replaces it",
                taken.iter().map(|c| c.as_str()).collect::<Vec<_>>().join(", ")
            )));
        }

        let total_points: u32 = questions.iter().map(|(_, q)| q.checks.iter().map(|c| c.weight).sum::<u32>()).sum();
        let attempt = Attempt {
            id: format!("{}", now_ms() as u64),
            exam_id: exam_id.into(),
            title: exam.title.clone(),
            certification: exam.certification.clone(),
            mode,
            pass_score: exam.pass_score.unwrap_or(cert.pass_score),
            questions: questions
                .iter()
                .map(|(id, q)| QuestionView {
                    id: id.clone(),
                    title: q.title.clone(),
                    cluster: q.cluster.clone(),
                    namespace: q.namespace.clone(),
                    weight: if total_points == 0 { 0.0 } else {
                        f64::from(q.checks.iter().map(|c| c.weight).sum::<u32>()) * 100.0 / f64::from(total_points)
                    },
                    statement: q.statement.clone(),
                    hints: if mode == Mode::Practice { q.hints.clone() } else { Vec::new() },
                    references: q.references.clone(),
                })
                .collect(),
            clusters: clusters.keys().cloned().collect(),
        };
        *self.session.lock().unwrap_or_else(|p| p.into_inner()) = questions;
        let token = CancellationToken::new();
        *self.cancel.lock().unwrap_or_else(|p| p.into_inner()) = token.clone();
        let duration = exam.duration.as_ref().unwrap_or(&cert.duration).seconds().unwrap_or(7200);

        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let prepared = tokio::select! {
                result = this.prepare(&attempt, &clusters, replace) => result,
                _ = token.cancelled() => Err(AppError::Cancelled { message: "preparation cancelled".into() }),
            };
            match prepared {
                Ok(()) => {
                    let started_at = now_ms();
                    let ends_at = (mode == Mode::Exam).then(|| started_at + duration as f64 * 1000.0);
                    this.set(ExamState::Running { attempt: attempt.clone(), started_at, ends_at });
                    if let Some(ends_at) = ends_at {
                        this.submit_at(attempt.id.clone(), ends_at);
                    }
                }
                Err(AppError::Cancelled { .. }) => {
                    this.remove_clusters(&attempt.clusters).await;
                    this.set(ExamState::Idle);
                }
                Err(e) => this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string() }),
            }
        });
        Ok(())
    }

    fn draw(&self, exam: &Exam) -> Vec<(String, Question)> {
        let mut ids = exam.questions.clone();
        if let Some(draw) = &exam.random {
            let cert = &self.pack.pack.certifications[&exam.certification];
            let weights = draw.weights.as_ref().unwrap_or(&cert.domains);
            let mut rng = rand::rng();
            let mut drawn = Vec::new();
            for (domain, count) in allocate(draw.count, weights) {
                let mut pool: Vec<&String> = self
                    .pack
                    .questions
                    .iter()
                    .filter(|(id, q)| {
                        q.value.certifications.get(&exam.certification) == Some(&domain)
                            && q.value.runnable()
                            && !ids.contains(id)
                    })
                    .map(|(id, _)| id)
                    .collect();
                pool.shuffle(&mut rng);
                drawn.extend(pool.into_iter().take(count as usize).cloned());
            }
            drawn.shuffle(&mut rng);
            ids.extend(drawn);
        }
        ids.into_iter()
            .filter_map(|id| {
                let q = &self.pack.questions.get(&id)?.value;
                if !q.runnable() {
                    tracing::info!(question = %id, "left out: needs {:?}", q.requires);
                    return None;
                }
                // The app's clusters keep their logical names
                Some((id, render::render(q, &render::pick(q, false), &q.cluster)))
            })
            .collect()
    }

    async fn prepare(&self, attempt: &Attempt, clusters: &BTreeMap<String, u8>, replace: bool) -> AppResult<()> {
        let questions = self.session.lock().unwrap_or_else(|p| p.into_inner()).clone();
        let setups: Vec<&(String, Question)> = questions.iter().filter(|(_, q)| q.setup.is_some()).collect();
        let total = (clusters.len() + 1 + setups.len()) as u32;
        let mut done = 0;
        let step = |step: String, done: u32| {
            self.set(ExamState::Preparing { attempt: attempt.clone(), step, done, total });
        };
        let log = |line: String| tracing::info!(attempt = %attempt.id, "{line}");

        for (name, workers) in clusters {
            if replace && self.kind.all_clusters().await?.contains(name) {
                step(format!("Removing the old cluster {name}"), done);
                lifecycle::delete(&self.kind, name, &log).await?;
            }
            step(format!("Creating cluster {name} (1 control plane, {workers} workers)"), done);
            lifecycle::create(&self.kind, &self.infra, name, *workers, &log, &Default::default()).await?;
            done += 1;
        }
        let docker = docker::connect().await?;
        step("Preparing the jumphost".into(), done);
        self.jumphost.reset(&docker, &log).await?;
        self.jumphost.refresh_access(&docker, &self.kind, &jumphost::app_placement(&self.kind)).await?;
        done += 1;
        for (i, (id, q)) in setups.iter().enumerate() {
            step(format!("Setting up question {} of {}", i + 1, setups.len()), done);
            let (exit, output) =
                checks::run_script(
                    &docker,
                    &self.jumphost.name,
                    &q.cluster,
                    q.setup.as_deref().unwrap_or_default(),
                    checks::SCRIPT_TIMEOUT_SECS,
                )
                .await?;
            if exit != 0 {
                return Err(AppError::invalid(format!(
                    "setup of {id} failed: {}",
                    output.lines().last().unwrap_or_default()
                )));
            }
            done += 1;
        }
        Ok(())
    }

    /// Submit automatically when the time is up (if still that attempt).
    fn submit_at(self: &Arc<Self>, attempt_id: String, ends_at: f64) {
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let wait = (ends_at - now_ms()).max(0.0) as u64;
            tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            if matches!(this.state(), ExamState::Running { attempt, .. } if attempt.id == attempt_id) {
                tracing::info!(%attempt_id, "time is up, submitting");
                let _ = this.submit();
            }
        });
    }

    /// Grade every question and finish the attempt.
    pub fn submit(self: &Arc<Self>) -> AppResult<()> {
        let ExamState::Running { attempt, started_at, .. } = self.state() else {
            return Err(AppError::invalid("no exam is running"));
        };
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            match this.grade(&attempt, started_at).await {
                Ok(result) => {
                    this.save_history(&attempt, &result);
                    this.set(ExamState::Finished { attempt, result });
                }
                Err(e) => this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string() }),
            }
        });
        Ok(())
    }

    async fn grade(&self, attempt: &Attempt, started_at: f64) -> AppResult<ExamResult> {
        let questions = self.session.lock().unwrap_or_else(|p| p.into_inner()).clone();
        let total = questions.iter().map(|(_, q)| q.checks.len() as u32).sum();
        let docker = docker::connect().await?;
        self.set(ExamState::Grading { attempt: attempt.clone(), done: 0, total });
        let done = std::sync::atomic::AtomicU32::new(0);
        let all: Vec<_> = questions.iter().flat_map(|(_, q)| q.checks.iter().map(|c| (q.cluster.as_str(), c))).collect();
        let mut graded = checks::run_checks(&docker, &self.jumphost.name, all, || {
            let done = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            self.set(ExamState::Grading { attempt: attempt.clone(), done, total });
        })
        .await?
        .into_iter();
        let mut results = Vec::new();
        for (id, q) in &questions {
            let check_results: Vec<_> = graded.by_ref().take(q.checks.len()).collect();
            results.push(QuestionResult {
                id: id.clone(),
                title: q.title.clone(),
                points: check_results.iter().filter(|c| c.passed).map(|c| c.weight).sum(),
                max_points: check_results.iter().map(|c| c.weight).sum(),
                checks: check_results,
            });
        }
        // Each question counts by its share of the exam, like on the real exam
        let score: f64 = results
            .iter()
            .zip(&attempt.questions)
            .map(|(r, view)| if r.max_points == 0 { 0.0 } else { view.weight * f64::from(r.points) / f64::from(r.max_points) })
            .sum();
        let score = (score * 10.0).round() / 10.0;
        Ok(ExamResult {
            score,
            passed: score >= f64::from(attempt.pass_score),
            started_at,
            finished_at: now_ms(),
            questions: results,
        })
    }

    /// Practice mode: grade one question now.
    pub async fn check_question(&self, question_id: &str) -> AppResult<Vec<CheckResult>> {
        let ExamState::Running { attempt, .. } = self.state() else {
            return Err(AppError::invalid("no exam is running"));
        };
        if attempt.mode != Mode::Practice {
            return Err(AppError::invalid("checking answers is only available in practice mode"));
        }
        let question = self.question(question_id)?;
        let docker = docker::connect().await?;
        checks::run_checks(&docker, &self.jumphost.name, question.checks.iter().map(|c| (question.cluster.as_str(), c)), || {})
            .await
    }

    /// The reference answer: in practice mode, or once the result is in.
    pub fn solution(&self, question_id: &str) -> AppResult<Solution> {
        match self.state() {
            ExamState::Running { attempt, .. } if attempt.mode == Mode::Practice => {}
            ExamState::Finished { .. } => {}
            _ => return Err(AppError::invalid("solutions are shown after the exam")),
        }
        Ok(self.question(question_id)?.solution)
    }

    fn question(&self, id: &str) -> AppResult<Question> {
        self.session
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .iter()
            .find(|(qid, _)| qid == id)
            .map(|(_, q)| q.clone())
            .ok_or_else(|| AppError::not_found(format!("no question '{id}' in this exam")))
    }

    /// Stop preparing, or close the attempt and delete its clusters.
    pub async fn end(&self) -> AppResult<()> {
        let state = self.state();
        if let ExamState::Preparing { .. } = state {
            self.cancel.lock().unwrap_or_else(|p| p.into_inner()).cancel();
            return Ok(());
        }
        if let ExamState::Grading { .. } = state {
            return Err(AppError::invalid("wait for grading to finish"));
        }
        if let Some(attempt) = state.attempt() {
            self.remove_clusters(&attempt.clusters).await;
        }
        self.session.lock().unwrap_or_else(|p| p.into_inner()).clear();
        self.set(ExamState::Idle);
        Ok(())
    }

    async fn remove_clusters(&self, clusters: &[String]) {
        let log = |line: String| tracing::info!("{line}");
        for name in clusters {
            if self.kind.owned_clusters().contains(name) {
                if let Err(e) = lifecycle::delete(&self.kind, name, &log).await {
                    tracing::warn!(cluster = %name, error = %e, "deleting exam cluster");
                }
            }
        }
        if let Ok(docker) = docker::connect().await {
            let _ = self.jumphost.refresh_access(&docker, &self.kind, &jumphost::app_placement(&self.kind)).await;
        }
    }

    fn save_history(&self, attempt: &Attempt, result: &ExamResult) {
        let entry = HistoryEntry {
            attempt_id: attempt.id.clone(),
            exam_id: attempt.exam_id.clone(),
            title: attempt.title.clone(),
            mode: attempt.mode,
            pass_score: attempt.pass_score,
            result: result.clone(),
        };
        let write = || -> std::io::Result<()> {
            std::fs::create_dir_all(&self.history_dir)?;
            std::fs::write(self.history_dir.join(format!("{}.json", attempt.id)), serde_json::to_vec_pretty(&entry)?)
        };
        if let Err(e) = write() {
            tracing::warn!(error = %e, "saving exam history");
        }
    }

    pub fn history(&self) -> Vec<HistoryEntry> {
        let Ok(entries) = std::fs::read_dir(&self.history_dir) else { return Vec::new() };
        let mut history: Vec<HistoryEntry> = entries
            .flatten()
            .filter_map(|e| serde_json::from_slice(&std::fs::read(e.path()).ok()?).ok())
            .collect();
        history.sort_by(|a, b| b.attempt_id.cmp(&a.attempt_id));
        history
    }
}

/// One cluster per name, as large as its most demanding question.
fn topology(questions: &[(String, Question)]) -> BTreeMap<String, u8> {
    let mut clusters = BTreeMap::new();
    for (_, q) in questions {
        let workers: &mut u8 = clusters.entry(q.cluster.clone()).or_default();
        *workers = (*workers).max(q.workers);
    }
    clusters
}

/// Split `count` questions across domains by weight (largest remainder).
fn allocate(count: u32, weights: &BTreeMap<String, u32>) -> Vec<(String, u32)> {
    let total: u32 = weights.values().sum();
    if total == 0 {
        return Vec::new();
    }
    let mut shares: Vec<(String, u32, u32)> = weights
        .iter()
        .map(|(d, w)| (d.clone(), count * w / total, (count * w) % total))
        .collect();
    let mut left = count - shares.iter().map(|s| s.1).sum::<u32>();
    shares.sort_by(|a, b| b.2.cmp(&a.2));
    for share in shares.iter_mut() {
        if left == 0 {
            break;
        }
        share.1 += 1;
        left -= 1;
    }
    shares.into_iter().map(|(d, n, _)| (d, n)).collect()
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}
