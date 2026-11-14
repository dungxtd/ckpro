//! An attempt from start to end: preparing its clusters, task host and
//! desktop, resuming it after the app reopened, closing it and removing
//! what it made. Grading is `grade`'s.

use super::draw::topology;
use super::{Attempt, ExamState, Exams, Mode, QuestionView, SavedAttempt};
use crate::cluster::lifecycle;
use crate::error::{AppError, AppResult};
use crate::lab::checks;
use crate::lab::model::Question;
use crate::runtime::activity::now_ms;
use crate::runtime::jumphost;
use crate::runtime::{desktop, docker};
use crate::sync::MutexExt;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

impl Exams {
    /// Resume the attempt that was running when the app quit: start its
    /// clusters, task host and desktop again and wait for the clusters. An
    /// exam whose time ran out meanwhile is graded then.
    pub fn restore(self: &Arc<Self>) {
        let Some(saved) = self.store.attempt::<SavedAttempt>().ok().flatten() else { return };
        let ExamState::Running { attempt, started_at, ends_at } = saved.state else { return };
        tracing::info!(attempt = %attempt.id, "resuming the running attempt");
        *self.session.locked() = saved.questions;

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
                        this.grade_and_finish(attempt, started_at, Some("Time ran out while ckpro was closed".into())).await
                    }
                    _ => {
                        let attempt_id = attempt.id.clone();
                        this.set(ExamState::Running { attempt, started_at, ends_at });
                        if let Some(ends_at) = ends_at {
                            this.submit_at(attempt_id, ends_at);
                        }
                    }
                },
                Err(e) => {
                    this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string(), activity: Some(id), resumable: true })
                }
            }
        });
    }

    /// Try a failed resume or grade again: the kept attempt is resumed (and
    /// graded, when its time is up), as when the app opens
    pub fn retry(self: &Arc<Self>) -> AppResult<()> {
        let Ok(_busy) = self.busy.try_lock() else {
            return Err(AppError::invalid("wait for the exam to finish what it is doing"));
        };
        if !matches!(self.state(), ExamState::Failed { resumable: true, .. }) {
            return Err(AppError::invalid("there is nothing to try again"));
        }
        self.restore();
        Ok(())
    }

    async fn resume(&self, attempt: &Attempt, activity: u32) -> AppResult<()> {
        let op = self.activities.handle(activity);
        // The app may start before Docker does (both at login, or after a restart)
        let docker = docker::wait(std::time::Duration::from_secs(120), || op.detail("Waiting for Docker to start…")).await?;
        // Removed while the app was closed: nothing to wait for
        let existing = self.kind.all_clusters().await?;
        if let Some(gone) = attempt.clusters.iter().find(|c| !existing.contains(c)) {
            return Err(AppError::cluster(format!(
                "cluster {gone} no longer exists (removed while ckpro was closed): close this exam and start it again"
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
        self.jumphost.give_access(&docker, &self.kind, &jumphost::app_placement(&self.kind), &attempt.clusters).await?;
        step += 1;
        op.step(step, None);
        if !crate::runtime::infra::start_existing(&docker, &self.desktop).await? {
            op.log("the desktop was removed: making a new one".to_string());
            let questions = self.session.locked().clone();
            let allowed = self.allowed_docs(&attempt.certification, &questions);
            self.start_desktop(&docker, &allowed, &attempt.clusters).await?;
        }
        step += 1;
        op.step(step, None);
        // One deadline for them all, as the error says
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
        for cluster in &attempt.clusters {
            op.detail(format!("Waiting for the API server of {cluster}"));
            let mut ready = false;
            while tokio::time::Instant::now() < deadline {
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

    /// Start an attempt. Clusters with the names the exam needs must not exist
    /// unless `replace` (they are deleted).
    pub async fn start(self: &Arc<Self>, exam_id: &str, mode: Mode, replace: bool) -> AppResult<()> {
        // Until it is Preparing: a second start (a double click) is refused
        let Ok(_busy) = self.busy.try_lock() else {
            return Err(AppError::busy("an exam is already in progress"));
        };
        let pack = self.pack();
        if matches!(
            self.state(),
            ExamState::Preparing { .. }
                | ExamState::Resuming { .. }
                | ExamState::Running { .. }
                | ExamState::Grading { .. }
                | ExamState::Ending { .. }
        ) {
            return Err(AppError::busy("an exam is already in progress"));
        }
        // Whatever a guard noted before belongs to an earlier attempt
        self.guard.take_outside();
        let exam = pack.exams.get(exam_id).ok_or_else(|| AppError::not_found(format!("no exam '{exam_id}'")))?;
        let exam = exam.value.clone();
        let cert = pack.pack.certifications.get(&exam.certification).cloned().ok_or_else(|| AppError::invalid("unknown certification"))?;

        let questions = self.draw(&exam);
        let clusters = topology(&questions);
        let existing = self.kind.all_clusters().await?;
        let taken: Vec<&String> = clusters.keys().filter(|c| existing.contains(*c)).collect();
        if !taken.is_empty() && !replace {
            return Err(AppError::ClustersExist {
                message: format!(
                    "cluster {} already exists; starting the exam replaces it",
                    taken.iter().map(|c| c.as_str()).collect::<Vec<_>>().join(", ")
                ),
            });
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
                    weight: if total_points == 0 {
                        0.0
                    } else {
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
        *self.session.locked() = questions;
        let token = CancellationToken::new();
        *self.cancel.locked() = token.clone();
        let duration = exam.duration.as_ref().unwrap_or(&cert.duration).seconds().unwrap_or(7200);

        // The whole plan up front, so the candidate sees what is coming
        let setups = self.session.locked().iter().filter(|(_, q)| q.setup.is_some()).count();
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
                    let ends_at = (mode == Mode::Exam).then_some(started_at + duration as f64 * 1000.0);
                    this.set(ExamState::Running { attempt: attempt.clone(), started_at, ends_at });
                    if let Some(ends_at) = ends_at {
                        this.submit_at(attempt.id.clone(), ends_at);
                    }
                }
                Err(AppError::Cancelled { .. }) => {
                    this.cleanup(&attempt).await;
                    this.set(ExamState::Idle);
                }
                Err(e) => {
                    this.set(ExamState::Failed { attempt: Some(attempt), message: e.to_string(), activity: Some(id), resumable: false })
                }
            }
        });
        Ok(())
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
        let questions = self.session.locked().clone();
        let setups: Vec<&(String, Question)> = questions.iter().filter(|(_, q)| q.setup.is_some()).collect();
        let mut step = 0;
        let mut next = |detail: Option<String>| {
            op.step(step, detail);
            step += 1;
        };

        let docker = docker::connect().await?;
        // Built when the app started; waits here if that is still running
        next(Some("Built when ckpro starts; waits for that build if it is still running".into()));
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
        self.jumphost.give_access(&docker, &self.kind, &jumphost::app_placement(&self.kind), &attempt.clusters).await?;
        next(None);
        self.start_desktop(&docker, allowed, &attempt.clusters).await?;
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
                return Err(AppError::invalid(format!("setup of {id} failed: {}", output.lines().last().unwrap_or_default())));
            }
        }
        Ok(())
    }

    /// Stop preparing, or close the attempt and delete its clusters.
    pub async fn end(&self) -> AppResult<()> {
        let Ok(_busy) = self.busy.try_lock() else {
            return Err(AppError::invalid("wait for the exam to finish what it is doing"));
        };
        let state = self.state();
        match &state {
            // Its task cleans up once cancelled
            ExamState::Preparing { .. } => {
                self.cancel.locked().cancel();
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
        self.session.locked().clear();
        self.set(ExamState::Idle);
        Ok(())
    }

    /// Remove the attempt's clusters and desktop, shown as the Ending phase.
    /// Best effort: what cannot be removed stays listed under Environment.
    async fn cleanup(&self, attempt: &Attempt) {
        let owned = self.kind.owned_clusters();
        // Also those kind was still creating (a cancelled preparation): no
        // kubeconfig yet, but their nodes run. The names were the attempt's
        // own from its start (one there before was replaced or refused)
        let existing = self.kind.all_clusters().await.unwrap_or_default();
        let clusters: Vec<&String> = attempt.clusters.iter().filter(|c| owned.contains(c) || existing.contains(c)).collect();
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
}
