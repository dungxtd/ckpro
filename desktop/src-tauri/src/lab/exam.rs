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
use crate::runtime::activity::Activities;
use crate::runtime::{desktop, docker, infra::Infra};
use crate::store::Store;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
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
    /// Where to solve it, from the exam desktop: `ssh <host>`
    pub host: String,
    pub namespace: Option<String>,
    /// What it is about ("Concepts"); absent in attempts saved before it
    #[serde(default)]
    pub tags: Vec<String>,
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
    /// Creating its clusters, desktop and tasks; progress in `activity`
    Preparing { attempt: Attempt, activity: u32 },
    /// Starting its clusters and desktop again after the app reopened
    Resuming { attempt: Attempt, activity: u32 },
    /// `ends_at` is unset in practice mode (no time limit)
    Running { attempt: Attempt, started_at: f64, ends_at: Option<f64> },
    /// `scores` fills in as each question is graded; `note` says why grading
    /// started when the candidate did not submit (time ran out while closed)
    Grading { attempt: Attempt, activity: u32, scores: Vec<Option<QuestionScore>>, note: Option<String> },
    /// Removing the attempt's clusters and desktop
    Ending { attempt: Attempt, activity: u32 },
    Finished { attempt: Attempt, result: ExamResult },
    /// `activity` has the log of what failed
    Failed { attempt: Option<Attempt>, message: String, activity: Option<u32> },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
pub struct QuestionScore {
    pub points: u32,
    pub max_points: u32,
}

impl ExamState {
    fn attempt(&self) -> Option<&Attempt> {
        match self {
            ExamState::Idle => None,
            ExamState::Preparing { attempt, .. }
            | ExamState::Resuming { attempt, .. }
            | ExamState::Running { attempt, .. }
            | ExamState::Grading { attempt, .. }
            | ExamState::Ending { attempt, .. }
            | ExamState::Finished { attempt, .. } => Some(attempt),
            ExamState::Failed { attempt, .. } => attempt.as_ref(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct SavedAttempt {
    state: ExamState,
    questions: Vec<(String, Question)>,
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
    /// The exam desktop's container (`desktop::NAME` for the app)
    desktop: String,
    /// The running attempt and history, kept between runs
    store: Arc<Store>,
    state: Mutex<ExamState>,
    /// Rendered questions of the current attempt (with solutions)
    session: Mutex<Vec<(String, Question)>>,
    cancel: Mutex<CancellationToken>,
    publish: Box<dyn Fn(&ExamState) + Send + Sync>,
    activities: Arc<Activities>,
}

impl Exams {
    pub fn new(
        pack: LoadedPack,
        kind: Arc<Kind>,
        infra: Arc<Infra>,
        jumphost: Arc<Jumphost>,
        desktop: &str,
        store: Arc<Store>,
        publish: impl Fn(&ExamState) + Send + Sync + 'static,
        activities: Arc<Activities>,
    ) -> Self {
        Self {
            pack,
            kind,
            infra,
            jumphost,
            desktop: desktop.into(),
            store,
            state: Mutex::new(ExamState::Idle),
            session: Mutex::new(Vec::new()),
            cancel: Mutex::new(CancellationToken::new()),
            publish: Box::new(publish),
            activities,
        }
    }

    pub fn state(&self) -> ExamState {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    fn set(&self, state: ExamState) {
        *self.state.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
        self.save_attempt(&state);
        (self.publish)(&state);
    }

    /// Keep a running attempt; anything else has nothing to resume. While
    /// grading it stays: quitting then resumes the attempt, to submit again.
    fn save_attempt(&self, state: &ExamState) {
        let result = match state {
            ExamState::Running { .. } => self.store.save_attempt(Some(&SavedAttempt {
                state: state.clone(),
                questions: self.session.lock().unwrap_or_else(|p| p.into_inner()).clone(),
            })),
            // Resumed (and graded) at the next start
            ExamState::Grading { .. } | ExamState::Resuming { .. } => Ok(()),
            _ => self.store.save_attempt::<SavedAttempt>(None),
        };
        if let Err(e) = result {
            tracing::warn!(error = %e, "saving the running attempt");
        }
    }

    /// Resume the attempt that was running when the app quit: start its
    /// clusters, task host and desktop again and wait for the clusters. An
    /// exam whose time ran out meanwhile is graded then.
    pub fn restore(self: &Arc<Self>) {
        let Some(saved) = self.store.attempt::<SavedAttempt>().ok().flatten() else { return };
        let ExamState::Running { attempt, started_at, ends_at } = saved.state else { return };
        tracing::info!(attempt = %attempt.id, "resuming the running attempt");
        *self.session.lock().unwrap_or_else(|p| p.into_inner()) = saved.questions;

        let mut steps: Vec<String> = attempt.clusters.iter().map(|c| format!("Starting cluster {c}")).collect();
        steps.extend(["Starting the task host", "Starting the exam desktop", "Waiting for the clusters"].map(String::from));
        let op = self.activities.begin("Resuming your exam", steps);
        self.set(ExamState::Resuming { attempt: attempt.clone(), activity: op.id() });
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let id = op.id();
            match op.end(this.resume(&attempt, id).await) {
                Ok(()) => match ends_at {
                    Some(ends_at) if ends_at <= now_ms() => {
                        this.grade_and_finish(attempt, started_at, Some("Time ran out while ckdry was closed".into())).await
                    }
                    _ => {
                        let attempt_id = attempt.id.clone();
                        this.set(ExamState::Running { attempt, started_at, ends_at });
                        if let Some(ends_at) = ends_at {
                            this.submit_at(attempt_id, ends_at);
                        }
                    }
                },
                Err(e) => this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string(), activity: Some(id) }),
            }
        });
    }

    async fn resume(&self, attempt: &Attempt, activity: u32) -> AppResult<()> {
        let op = self.activities.handle(activity);
        let docker = docker::connect().await?;
        // Removed while the app was closed: nothing to wait for
        let existing = self.kind.all_clusters().await?;
        if let Some(gone) = attempt.clusters.iter().find(|c| !existing.contains(c)) {
            return Err(AppError::cluster(format!(
                "cluster {gone} no longer exists (removed while ckdry was closed): close this exam and start it again"
            )));
        }
        let mut step = 0;
        for cluster in &attempt.clusters {
            op.step(step, None);
            // Startup reconciliation may be starting them too
            if let Err(e) = crate::runtime::reconcile::repair(&docker, cluster).await {
                op.log(format!("  {e}"));
            }
            step += 1;
        }
        // Started again as they were (the candidate's files are on them); made
        // again only if they were removed meanwhile. Never replaced: a newer
        // image would wipe the work on the task host
        op.step(step, None);
        if !crate::runtime::infra::start_existing(&docker, &self.jumphost.name).await? {
            op.log("the task host was removed: making a new one (files on it are lost)".to_string());
            let log = |line: String| op.log(line);
            self.jumphost.ensure(&docker, &log).await?;
        }
        self.jumphost.refresh_access(&docker, &self.kind, &jumphost::app_placement(&self.kind)).await?;
        step += 1;
        op.step(step, None);
        if !crate::runtime::infra::start_existing(&docker, &self.desktop).await? {
            op.log("the desktop was removed: making a new one".to_string());
            let questions = self.session.lock().unwrap_or_else(|p| p.into_inner()).clone();
            let allowed = self.allowed_docs(&attempt.certification, &questions);
            desktop::start(&docker, &self.desktop, &allowed, &attempt.clusters, &self.jumphost.name).await?;
        }
        step += 1;
        op.step(step, None);
        for cluster in &attempt.clusters {
            op.detail(format!("Waiting for the API server of {cluster}"));
            let mut ready = false;
            for _ in 0..60 {
                let (exit, _) =
                    checks::run_script(&docker, &self.jumphost.name, cluster, "kubectl get --raw=/readyz >/dev/null", 15).await?;
                if exit == 0 {
                    ready = true;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
            if !ready {
                return Err(AppError::cluster(format!("cluster {cluster} did not come back within 2 minutes")));
            }
        }
        Ok(())
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
        if matches!(
            self.state(),
            ExamState::Preparing { .. }
                | ExamState::Resuming { .. }
                | ExamState::Running { .. }
                | ExamState::Grading { .. }
                | ExamState::Ending { .. }
        ) {
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
                    host: q.cluster.clone(),
                    namespace: q.namespace.clone(),
                    tags: q.tags.clone(),
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
        let allowed = self.allowed_docs(&exam.certification, &questions);
        *self.session.lock().unwrap_or_else(|p| p.into_inner()) = questions;
        let token = CancellationToken::new();
        *self.cancel.lock().unwrap_or_else(|p| p.into_inner()) = token.clone();
        let duration = exam.duration.as_ref().unwrap_or(&cert.duration).seconds().unwrap_or(7200);

        // The whole plan up front, so the candidate sees what is coming
        let setups = self.session.lock().unwrap_or_else(|p| p.into_inner()).iter().filter(|(_, q)| q.setup.is_some()).count();
        let replacing: Vec<String> = clusters.keys().filter(|c| existing.contains(*c)).cloned().collect();
        let mut steps = vec!["Preparing images and the registry cache".to_string()];
        for (name, workers) in &clusters {
            if replacing.contains(name) {
                steps.push(format!("Removing the old cluster {name}"));
            }
            let plural = if *workers == 1 { "" } else { "s" };
            steps.push(format!("Creating cluster {name}: 1 control plane, {workers} worker{plural}"));
        }
        steps.push("Preparing the task host".into());
        steps.push("Starting the exam desktop".into());
        if setups > 0 {
            let plural = if setups == 1 { "" } else { "s" };
            steps.push(format!("Setting up {setups} task{plural}"));
        }
        let op = self.activities.begin(format!("Setting up {}", attempt.title), steps);
        self.set(ExamState::Preparing { attempt: attempt.clone(), activity: op.id() });

        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let id = op.id();
            let prepared = tokio::select! {
                result = this.prepare(&attempt, &clusters, &replacing, &allowed, id) => result,
                _ = token.cancelled() => Err(AppError::Cancelled { message: "preparation cancelled".into() }),
            };
            match op.end(prepared) {
                Ok(()) => {
                    let started_at = now_ms();
                    let ends_at = (mode == Mode::Exam).then(|| started_at + duration as f64 * 1000.0);
                    this.set(ExamState::Running { attempt: attempt.clone(), started_at, ends_at });
                    if let Some(ends_at) = ends_at {
                        this.submit_at(attempt.id.clone(), ends_at);
                    }
                }
                Err(AppError::Cancelled { .. }) => {
                    this.cleanup(&attempt).await;
                    this.set(ExamState::Idle);
                }
                Err(e) => this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string(), activity: Some(id) }),
            }
        });
        Ok(())
    }

    /// The certification's allowed docs plus the tasks' own references
    fn allowed_docs(&self, certification: &str, questions: &[(String, Question)]) -> Vec<String> {
        let mut allowed = self.pack.pack.certifications.get(certification).map(|c| c.resources.clone()).unwrap_or_default();
        allowed.extend(questions.iter().flat_map(|(_, q)| q.references.iter().cloned()));
        allowed.dedup();
        allowed
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

    /// Create the attempt's clusters, task host and desktop and set up its
    /// tasks, reporting into the activity `activity` (planned in `start`).
    async fn prepare(
        &self,
        attempt: &Attempt,
        clusters: &BTreeMap<String, u8>,
        replacing: &[String],
        allowed: &[String],
        activity: u32,
    ) -> AppResult<()> {
        let op = self.activities.handle(activity);
        let log = |line: String| op.log(line);
        let questions = self.session.lock().unwrap_or_else(|p| p.into_inner()).clone();
        let setups: Vec<&(String, Question)> = questions.iter().filter(|(_, q)| q.setup.is_some()).collect();
        let mut step = 0;
        let mut next = |detail: Option<String>| {
            op.step(step, detail);
            step += 1;
        };

        let docker = docker::connect().await?;
        // Built when the app started; waits here if that is still running
        next(Some("Built when ckdry starts; waits for that build if it is still running".into()));
        self.infra.ensure(&docker, &log).await?;
        for (name, workers) in clusters {
            if replacing.contains(name) {
                next(None);
                lifecycle::delete(&self.kind, name, &log).await?;
            }
            next(None);
            lifecycle::create(&self.kind, &self.infra, name, *workers, &log, &Default::default()).await?;
        }
        next(None);
        self.jumphost.reset(&docker, &log).await?;
        self.jumphost.refresh_access(&docker, &self.kind, &jumphost::app_placement(&self.kind)).await?;
        next(None);
        desktop::start(&docker, &self.desktop, allowed, &attempt.clusters, &self.jumphost.name).await?;
        if !setups.is_empty() {
            next(None);
        }
        for (i, (id, q)) in setups.iter().enumerate() {
            op.detail(format!("Task {} of {}: {}", i + 1, setups.len(), q.title));
            let (exit, output) = checks::run_script(
                &docker,
                &self.jumphost.name,
                &q.cluster,
                q.setup.as_deref().unwrap_or_default(),
                checks::SCRIPT_TIMEOUT_SECS,
            )
            .await?;
            if exit != 0 {
                for line in output.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev() {
                    op.log(format!("  {line}"));
                }
                return Err(AppError::invalid(format!(
                    "setup of {id} failed: {}",
                    output.lines().last().unwrap_or_default()
                )));
            }
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
        tauri::async_runtime::spawn(async move { this.grade_and_finish(attempt, started_at, None).await });
        Ok(())
    }

    async fn grade_and_finish(&self, attempt: Attempt, started_at: f64, note: Option<String>) {
        let op = self.activities.begin(format!("Grading {}", attempt.title), vec!["Running every check".into()]);
        let id = op.id();
        match op.end(self.grade(&attempt, started_at, note, id).await) {
            Ok(result) => {
                self.save_history(&attempt, &result);
                self.set(ExamState::Finished { attempt, result });
            }
            Err(e) => self.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string(), activity: Some(id) }),
        }
    }

    async fn grade(&self, attempt: &Attempt, started_at: f64, note: Option<String>, activity: u32) -> AppResult<ExamResult> {
        let op = self.activities.handle(activity);
        let questions = self.session.lock().unwrap_or_else(|p| p.into_inner()).clone();
        let docker = docker::connect().await?;
        let grading = |scores: Vec<Option<QuestionScore>>| ExamState::Grading {
            attempt: attempt.clone(),
            activity,
            scores,
            note: note.clone(),
        };
        self.set(grading(vec![None; questions.len()]));
        if let Some(note) = &note {
            op.log(note.clone());
        }

        // Every check at once; a question's score shows as soon as its last
        // check is in
        let owner: Vec<usize> = questions.iter().enumerate().flat_map(|(i, (_, q))| q.checks.iter().map(move |_| i)).collect();
        let progress = Mutex::new((
            questions.iter().map(|(_, q)| vec![None; q.checks.len()]).collect::<Vec<Vec<Option<(bool, u32)>>>>(),
            vec![None; questions.len()],
        ));
        let starts: Vec<usize> = questions
            .iter()
            .scan(0, |next, (_, q)| {
                let start = *next;
                *next += q.checks.len();
                Some(start)
            })
            .collect();
        let all: Vec<_> = questions.iter().flat_map(|(_, q)| q.checks.iter().map(|c| (q.cluster.as_str(), c))).collect();
        let mut graded = checks::run_checks(&docker, &self.jumphost.name, all, |index, result| {
            let question = owner[index];
            let mut state = progress.lock().unwrap_or_else(|p| p.into_inner());
            state.0[question][index - starts[question]] = Some((result.passed, result.weight));
            if state.0[question].iter().all(Option::is_some) {
                let (points, max_points) = state.0[question]
                    .iter()
                    .flatten()
                    .fold((0, 0), |(p, m), (passed, w)| (p + if *passed { *w } else { 0 }, m + w));
                state.1[question] = Some(QuestionScore { points, max_points });
                let mark = if points == max_points { "✓" } else { "✗" };
                op.log(format!("{mark} {}: {points}/{max_points}", questions[question].1.title));
                let done = state.1.iter().filter(|s| s.is_some()).count();
                self.set(grading(state.1.clone()));
                drop(state);
                op.detail(format!("{done} of {} questions graded", questions.len()));
            }
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
        op.log(format!("Score {score}% (pass {}%)", attempt.pass_score));
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
        checks::run_checks(&docker, &self.jumphost.name, question.checks.iter().map(|c| (question.cluster.as_str(), c)), |_, _| {})
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
        match &state {
            // Its task cleans up once cancelled
            ExamState::Preparing { .. } => {
                self.cancel.lock().unwrap_or_else(|p| p.into_inner()).cancel();
                return Ok(());
            }
            ExamState::Grading { .. } | ExamState::Resuming { .. } | ExamState::Ending { .. } => {
                return Err(AppError::invalid("wait for the exam to finish what it is doing"));
            }
            _ => {}
        }
        if let Some(attempt) = state.attempt() {
            self.cleanup(attempt).await;
        }
        self.session.lock().unwrap_or_else(|p| p.into_inner()).clear();
        self.set(ExamState::Idle);
        Ok(())
    }

    /// Remove the attempt's clusters and desktop, shown as the Ending phase.
    /// Best effort: what cannot be removed stays listed under Environment.
    async fn cleanup(&self, attempt: &Attempt) {
        let owned = self.kind.owned_clusters();
        let clusters: Vec<&String> = attempt.clusters.iter().filter(|c| owned.contains(c)).collect();
        let mut steps: Vec<String> = clusters.iter().map(|c| format!("Removing cluster {c}")).collect();
        steps.extend(["Removing the exam desktop", "Updating the task host"].map(String::from));
        let op = self.activities.begin("Cleaning up", steps);
        self.set(ExamState::Ending { attempt: attempt.clone(), activity: op.id() });
        let log = |line: String| op.log(line);
        let mut step = 0;
        for name in clusters {
            op.step(step, None);
            if let Err(e) = lifecycle::delete(&self.kind, name, &log).await {
                op.log(format!("could not remove {name}: {e}"));
            }
            step += 1;
        }
        op.step(step, None);
        match docker::connect().await {
            Ok(docker) => {
                if let Err(e) = desktop::remove(&docker, &self.desktop).await {
                    op.log(format!("could not remove the desktop: {e}"));
                }
                op.step(step + 1, None);
                if let Err(e) = self.jumphost.refresh_access(&docker, &self.kind, &jumphost::app_placement(&self.kind)).await {
                    op.log(format!("could not update the task host: {e}"));
                }
                op.done();
            }
            Err(e) => op.fail(e),
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
        if let Err(e) = self.store.add_history(&attempt.id, &attempt.exam_id, result.finished_at, &entry) {
            tracing::warn!(error = %e, "saving exam history");
        }
    }

    pub fn history(&self) -> Vec<HistoryEntry> {
        self.store.history().unwrap_or_else(|e| {
            tracing::warn!(error = %e, "reading exam history");
            Vec::new()
        })
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
