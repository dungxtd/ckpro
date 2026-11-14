//! Submitting and grading an attempt, and checking a question on demand.

use super::history::HistoryEntry;
use super::{Attempt, ExamResult, ExamState, Exams, Mode, Prediction, QuestionResult, QuestionScore, QuestionView};
use crate::error::{AppError, AppResult};
use crate::lab::checks::{self, CheckResult};
use crate::lab::model::Solution;
use crate::runtime::activity::now_ms;
use crate::runtime::docker;
use crate::runtime::preflight::Footprint;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};

impl Exams {
    /// Submit automatically when the time is up (if still that attempt).
    pub(super) fn submit_at(self: &Arc<Self>, attempt_id: String, ends_at: f64) {
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

    pub(super) async fn grade_and_finish(&self, attempt: Attempt, started_at: f64, note: Option<String>) {
        // Graded once: the timer and the candidate may both submit, and
        // closing waits for the grade
        let busy = self.busy.lock().await;
        let current = matches!(
            self.state(),
            ExamState::Running { attempt: ref a, .. } | ExamState::Resuming { attempt: ref a, .. } if a.id == attempt.id
        );
        if !current {
            return;
        }
        let op = self.activities.begin(format!("Grading {}", attempt.title), vec!["Running every check".into()]);
        let id = op.id();
        match op.end(self.grade(&attempt, started_at, note, id).await) {
            Ok(mut result) => {
                self.save_history(&attempt, &result);
                result.prediction = self.prediction(&attempt);
                let clusters = attempt.clusters.clone();
                self.set(ExamState::Finished { attempt, result });
                // Closing it need not wait for this
                drop(busy);
                self.measure_footprint(&clusters).await;
            }
            Err(e) => self.set(ExamState::Failed {
                attempt: Some(attempt),
                message: e.to_string(),
                activity: Some(id),
                resumable: true,
            }),
        }
    }

    /// The certification's predicted score without `attempt` and with it
    /// (it is in the history now): the history read once, readiness worked
    /// out on it both ways
    fn prediction(&self, attempt: &Attempt) -> Option<Prediction> {
        let (pack, history) = (self.pack(), self.history());
        let now = now_ms();
        let without: Vec<HistoryEntry> = history.iter().filter(|h| h.attempt_id != attempt.id).cloned().collect();
        let after = super::plan::readiness(&pack, &history, &attempt.certification, now).ok()?.predicted;
        let before = super::plan::readiness(&pack, &without, &attempt.certification, now).ok()?.predicted;
        Some(Prediction { before, after })
    }

    /// Note what the graded attempt's nodes take on this machine: the
    /// catalog's minimum follows it
    async fn measure_footprint(&self, clusters: &[String]) {
        let Ok(docker) = docker::connect().await else { return };
        let Some(new) = Footprint::measure(&docker, clusters).await else { return };
        let footprint = self.store.footprint().unwrap_or_default().blend(new);
        tracing::info!(?footprint, "measured the exam nodes");
        if let Err(e) = self.store.save_footprint(&footprint) {
            tracing::warn!(error = %e, "saving the node footprint");
        }
    }

    pub(super) async fn grade(&self, attempt: &Attempt, started_at: f64, note: Option<String>, activity: u32) -> AppResult<ExamResult> {
        let op = self.activities.handle(activity);
        let questions = self.session.locked().clone();
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
            let mut state = progress.locked();
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
        let score = weighted_score(&results, &attempt.questions);
        op.log(format!("Score {score}% (pass {}%)", attempt.pass_score));
        Ok(ExamResult {
            score,
            passed: score >= f64::from(attempt.pass_score),
            started_at,
            finished_at: now_ms(),
            questions: results,
            outside: self.guard.take_outside(),
            assisted: self.store.assisted(&attempt.id).unwrap_or_else(|e| {
                tracing::warn!(error = %e, "reading what the assistant helped with");
                Default::default()
            }),
            prediction: None,
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
        let started = std::time::Instant::now();
        let results =
            checks::run_checks(&docker, &self.jumphost.name, question.checks.iter().map(|c| (question.cluster.as_str(), c)), |_, _| {})
                .await?;
        let passed = results.iter().filter(|c| c.passed).count();
        tracing::info!(question = question_id, passed, of = results.len(), ms = started.elapsed().as_millis() as u64, "checked");
        self.saw(&attempt.id, |seen| {
            seen.checks.insert(question_id.to_string(), results.clone());
        });
        Ok(results)
    }

    /// The reference answer: in practice mode, or once the result is in.
    pub fn solution(&self, question_id: &str) -> AppResult<Solution> {
        match self.state() {
            ExamState::Running { attempt, .. } if attempt.mode == Mode::Practice => {
                self.saw(&attempt.id, |seen| {
                    seen.solutions.insert(question_id.to_string());
                });
            }
            ExamState::Finished { .. } => {}
            _ => return Err(AppError::invalid("solutions are shown after the exam")),
        }
        Ok(self.question(question_id)?.solution)
    }
}

/// The attempt's score in percent, to a tenth: each question counts by its
/// share of the exam (its `weight` in the attempt), like on the real exam.
/// Results find their question by id; one the attempt does not list counts
/// nothing
pub(super) fn weighted_score(results: &[QuestionResult], questions: &[QuestionView]) -> f64 {
    let score: f64 = results
        .iter()
        .filter(|r| r.max_points > 0)
        .filter_map(|r| questions.iter().find(|q| q.id == r.id).map(|q| q.weight * f64::from(r.points) / f64::from(r.max_points)))
        .sum();
    (score * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(id: &str, weight: f64) -> QuestionView {
        QuestionView {
            id: id.into(),
            title: String::new(),
            cluster: String::new(),
            host: String::new(),
            namespace: None,
            tags: Vec::new(),
            weight,
            statement: String::new(),
            hints: Vec::new(),
            references: Vec::new(),
        }
    }

    fn result(id: &str, points: u32, max_points: u32) -> QuestionResult {
        QuestionResult { id: id.into(), title: String::new(), points, max_points, checks: Vec::new() }
    }

    /// Each question weighs its share of the exam, whatever its points;
    /// results are matched to questions by id, not by order
    #[test]
    fn the_score_weighs_each_question_by_its_share() {
        let questions = [view("a", 25.0), view("b", 75.0)];
        // Half of a (12.5) and all of b (75), listed the other way round
        assert_eq!(weighted_score(&[result("b", 3, 3), result("a", 1, 2)], &questions), 87.5);
        // A question without points, or one not in the attempt, adds nothing
        assert_eq!(weighted_score(&[result("a", 0, 0), result("x", 5, 5), result("b", 1, 3)], &questions), 25.0);
        // To a tenth
        assert_eq!(weighted_score(&[result("a", 1, 3)], &[view("a", 100.0)]), 33.3);
        assert_eq!(weighted_score(&[], &questions), 0.0);
    }
}
