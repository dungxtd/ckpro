//! The exam engine: one attempt at a time, from preparing clusters to the
//! result. Its state is pushed to the UI on every change (ExamChanged).
//!
//! Exam mode is the real thing: no hints, no checking, no solutions until the
//! result. Practice mode adds hints, per-question checks and solutions, and
//! has no time limit. Hidden material never leaves Rust in exam mode.
//!
//! Here: the attempt's types and its state; `attempt` moves it from start to
//! end, `grade` grades it, `desktop` keeps its exam desktop, `bank` the
//! question bank, `history` the finished attempts, `plan` the calendar and
//! readiness, `insights` what the coach and the figures read.

use super::checks::CheckResult;
use super::load::LoadedPack;
use super::model::Question;
use crate::cluster::kind::Kind;
use crate::error::{AppError, AppResult};
use crate::runtime::activity::Activities;
use crate::runtime::guard::{Guard, Watch};
use crate::runtime::infra::{Infra, MIRROR};
use crate::runtime::jumphost::Jumphost;
use crate::store::Store;
use crate::sync::MutexExt;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

mod attempt;
mod bank;
mod desktop;
pub mod draw;
mod grade;
pub mod history;
pub mod insights;
pub mod plan;

pub use history::HistoryEntry;
pub use insights::{CoachSubject, StudyStats};

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
    /// Memory it runs comfortably in, worst case of its draw (MB)
    pub memory_mb: u32,
    /// Memory it cannot run without (MB); in between it runs, slower
    pub minimum_mb: u32,
    /// Its Kubernetes nodes (control planes and workers)
    pub nodes: u32,
    /// The clusters it runs on
    pub clusters: Vec<String>,
    /// The candidate's own (generated questions): it may be deleted
    pub custom: bool,
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
    /// What happened to the environment outside the exam desktop (the guard)
    #[serde(default)]
    pub outside: Vec<String>,
    /// Questions the assistant ran commands for (Agent): their points were helped
    #[serde(default)]
    pub assisted: Vec<String>,
    /// The certification's predicted score before this attempt and after it
    /// (as readiness gives it: none while too little is measured)
    #[serde(default)]
    pub prediction: Option<Prediction>,
}

/// A predicted score, before an attempt and after it
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Prediction {
    pub before: Option<f64>,
    pub after: Option<f64>,
}

impl ExamResult {
    /// Whether the attempt was worked: one ended before earning any point says
    /// nothing about the candidate, so readiness and plans leave it out
    pub fn worked(&self) -> bool {
        self.score > 0.0
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum ExamState {
    #[default]
    Idle,
    /// Creating its clusters, desktop and tasks; progress in `activity`
    Preparing {
        attempt: Attempt,
        activity: u32,
    },
    /// Starting its clusters and desktop again after the app reopened
    Resuming {
        attempt: Attempt,
        activity: u32,
    },
    /// `ends_at` is unset in practice mode (no time limit)
    Running {
        attempt: Attempt,
        started_at: f64,
        ends_at: Option<f64>,
    },
    /// `scores` fills in as each question is graded; `note` says why grading
    /// started when the candidate did not submit (time ran out while closed)
    Grading {
        attempt: Attempt,
        activity: u32,
        scores: Vec<Option<QuestionScore>>,
        note: Option<String>,
    },
    /// Removing the attempt's clusters and desktop
    Ending {
        attempt: Attempt,
        activity: u32,
    },
    Finished {
        attempt: Attempt,
        result: ExamResult,
    },
    /// `activity` has the log of what failed. `resumable`: the attempt is
    /// still kept (resuming or grading it failed) and can be tried again
    Failed {
        attempt: Option<Attempt>,
        message: String,
        activity: Option<u32>,
        #[serde(default)]
        resumable: bool,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
pub struct QuestionScore {
    pub points: u32,
    pub max_points: u32,
}

impl ExamState {
    pub(super) fn attempt(&self) -> Option<&Attempt> {
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

    /// An exam-mode attempt is under way, in any phase up to its result (a
    /// failed one may be retried): no assistant then, as on the real exam
    pub fn exam_in_progress(&self) -> bool {
        !matches!(self, ExamState::Finished { .. }) && self.attempt().is_some_and(|a| a.mode == Mode::Exam)
    }
}

#[derive(Serialize, Deserialize)]
struct SavedAttempt {
    state: ExamState,
    questions: Vec<(String, Question)>,
}

/// The running attempt as the app keeps it: the attempt and its questions as
/// rendered for it (the agent's tools read it)
pub fn saved_running(store: &Store) -> Option<(Attempt, Vec<(String, Question)>)> {
    match store.attempt::<SavedAttempt>().ok().flatten()? {
        SavedAttempt { state: ExamState::Running { attempt, .. }, questions } => Some((attempt, questions)),
        _ => None,
    }
}

pub struct Exams {
    /// The question bank: the core pack plus the candidate's own questions
    /// (replaced when a generated question is added)
    pack: std::sync::RwLock<Arc<LoadedPack>>,
    /// One reading of the packs at a time: one read before a change and
    /// swapped in after another's would put the change out again
    reloading: Mutex<()>,
    /// What the candidate saw in the attempt: each question's last checks,
    /// the solutions opened (the coach is told of them, not by the screen)
    seen: Mutex<Seen>,
    /// The desktop came up: who waits for its session (desk) is told
    desktop_up: tokio::sync::Notify,
    /// The packs' files as last read (how many, their size, the newest
    /// change): read again only once they differ
    read_as: Mutex<Option<(usize, u64, Option<std::time::SystemTime>)>>,
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
    /// Held while one step decides where the attempt goes (starting it,
    /// grading it, closing it): a second one waits or is refused instead of
    /// acting on the same state
    busy: tokio::sync::Mutex<()>,
    publish: Box<dyn Fn(&ExamState) + Send + Sync>,
    activities: Arc<Activities>,
    /// Keeps the running attempt's environment as ckpro set it up
    guard: Arc<Guard>,
    /// Exam-mode starts under way (`exam_starting`): the assistant refuses
    /// as if the exam ran already
    exam_starting: std::sync::atomic::AtomicUsize,
}

/// What the candidate saw in an attempt (`attempt`): each question's last
/// checks, and the solutions opened
#[derive(Default)]
struct Seen {
    attempt: String,
    checks: std::collections::HashMap<String, Vec<CheckResult>>,
    solutions: std::collections::HashSet<String>,
}

impl Exams {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pack: LoadedPack,
        kind: Arc<Kind>,
        infra: Arc<Infra>,
        jumphost: Arc<Jumphost>,
        desktop: &str,
        store: Arc<Store>,
        publish: impl Fn(&ExamState) + Send + Sync + 'static,
        activities: Arc<Activities>,
        guard: Arc<Guard>,
    ) -> Self {
        Self {
            pack: std::sync::RwLock::new(Arc::new(pack)),
            reloading: Mutex::default(),
            desktop_up: tokio::sync::Notify::new(),
            seen: Mutex::default(),
            read_as: Mutex::default(),
            kind,
            infra,
            jumphost,
            desktop: desktop.into(),
            store,
            state: Mutex::new(ExamState::Idle),
            session: Mutex::new(Vec::new()),
            cancel: Mutex::new(CancellationToken::new()),
            busy: Default::default(),
            publish: Box::new(publish),
            activities,
            guard,
            exam_starting: Default::default(),
        }
    }

    /// Note what the candidate saw in `attempt`: a question's checks, or
    /// its solution opened
    fn saw(&self, attempt: &str, f: impl FnOnce(&mut Seen)) {
        let mut seen = self.seen.locked();
        if seen.attempt != attempt {
            *seen = Seen { attempt: attempt.to_string(), ..Seen::default() };
        }
        f(&mut seen);
    }

    /// A question's checks the candidate saw: the result's once graded, the
    /// last "Check my work" while practising
    pub fn checks_seen(&self, question_id: &str) -> Vec<CheckResult> {
        match self.state() {
            ExamState::Finished { result, .. } => {
                result.questions.into_iter().find(|q| q.id == question_id).map(|q| q.checks).unwrap_or_default()
            }
            ExamState::Running { attempt, .. } => {
                let seen = self.seen.locked();
                if seen.attempt == attempt.id { seen.checks.get(question_id).cloned().unwrap_or_default() } else { Vec::new() }
            }
            _ => Vec::new(),
        }
    }

    /// Whether the candidate opened the question's solution in the attempt
    pub fn solution_seen(&self, attempt: &str, question_id: &str) -> bool {
        let seen = self.seen.locked();
        seen.attempt == attempt && seen.solutions.contains(question_id)
    }

    pub fn state(&self) -> ExamState {
        self.state.locked().clone()
    }

    fn set(&self, state: ExamState) {
        *self.state.locked() = state.clone();
        self.save_attempt(&state);
        (self.publish)(&state);
        // The guard watches a running attempt only
        self.guard.follow(match &state {
            ExamState::Running { attempt, .. } => Some(Watch {
                clusters: attempt.clusters.clone(),
                containers: vec![self.desktop.clone(), self.jumphost.name.clone(), MIRROR.to_string()],
            }),
            _ => None,
        });
    }

    /// Keep a running attempt; anything else has nothing to resume. While
    /// grading it stays: quitting then resumes the attempt, to submit again.
    fn save_attempt(&self, state: &ExamState) {
        let result = match state {
            ExamState::Running { .. } => {
                self.store.save_attempt(Some(&SavedAttempt { state: state.clone(), questions: self.session.locked().clone() }))
            }
            // Resumed (and graded) at the next start, or on Try Again
            ExamState::Grading { .. } | ExamState::Resuming { .. } | ExamState::Failed { resumable: true, .. } => Ok(()),
            _ => self.store.save_attempt::<SavedAttempt>(None),
        };
        if let Err(e) = result {
            tracing::warn!(error = %e, "saving the running attempt");
        }
    }

    fn question(&self, id: &str) -> AppResult<Question> {
        self.session
            .locked()
            .iter()
            .find(|(qid, _)| qid == id)
            .map(|(_, q)| q.clone())
            .ok_or_else(|| AppError::not_found(format!("no question '{id}' in this exam")))
    }
}

#[cfg(test)]
impl Exams {
    /// Exams on the bundled pack and `store`, with nothing behind them: for
    /// tests of what reaches no Docker
    pub fn for_test(store: Arc<Store>) -> Self {
        let dir = std::env::temp_dir().join(format!("ckpro-exams-{}", std::process::id()));
        let core = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        Exams::new(
            crate::lab::load::load(&core).0.expect("the core pack loads"),
            Arc::new(Kind::new(dir.clone())),
            Arc::new(Infra::new(dir.clone())),
            Arc::new(Jumphost::for_test(&dir, "exams")),
            "none",
            store,
            |_: &ExamState| {},
            Activities::silent(),
            Guard::new(|_| {}),
        )
    }
}

/// The attempt's state machine, as far as it goes without Docker: what each
/// phase lets through, refuses, and keeps to resume
#[cfg(test)]
mod tests {
    use super::*;

    fn exams() -> Arc<Exams> {
        Arc::new(Exams::for_test(Arc::new(Store::in_memory().unwrap())))
    }

    fn attempt(mode: Mode) -> Attempt {
        Attempt {
            id: "1".into(),
            exam_id: "core/cka-001".into(),
            title: "CKA".into(),
            certification: "cka".into(),
            mode,
            pass_score: 66,
            questions: Vec::new(),
            clusters: vec!["cka".into()],
        }
    }

    /// The state as it is, without the guard following it (it would reach Docker)
    fn put(exams: &Exams, state: ExamState) {
        *exams.state.locked() = state;
    }

    fn running(mode: Mode) -> ExamState {
        ExamState::Running { attempt: attempt(mode), started_at: 0.0, ends_at: None }
    }

    /// One of the bank's questions in the attempt, its id
    fn with_question(exams: &Exams) -> String {
        let (id, q) = exams.bank().questions.iter().next().map(|(id, q)| (id.clone(), q.value.clone())).unwrap();
        *exams.session.locked() = vec![(id.clone(), q)];
        id
    }

    #[tokio::test]
    async fn with_no_attempt_nothing_moves() {
        let exams = exams();
        assert!(matches!(exams.submit(), Err(AppError::Invalid { .. })));
        assert!(matches!(exams.retry(), Err(AppError::Invalid { .. })));
        assert!(matches!(exams.solution("any"), Err(AppError::Invalid { .. })));
        assert!(matches!(exams.check_question("any").await, Err(AppError::Invalid { .. })));
        assert!(matches!(exams.reset_desktop().await, Err(AppError::Invalid { .. })));
        // Closing nothing is fine, and leaves nothing
        exams.end().await.unwrap();
        assert!(matches!(exams.state(), ExamState::Idle));
    }

    /// An exam that is not in the bank is refused before anything is made,
    /// and a second try is not taken for a double click
    #[tokio::test]
    async fn a_start_of_no_exam_leaves_it_idle() {
        let exams = exams();
        for _ in 0..2 {
            assert!(matches!(exams.start("core/none", Mode::Practice, false).await, Err(AppError::NotFound { .. })));
            assert!(matches!(exams.state(), ExamState::Idle));
        }
    }

    /// One attempt at a time: another start is refused whatever phase it is
    /// in; closing waits for a step under way, and cancels a preparation
    #[tokio::test]
    async fn one_attempt_at_a_time() {
        let exams = exams();
        let phases = [
            ExamState::Preparing { attempt: attempt(Mode::Practice), activity: 0 },
            ExamState::Resuming { attempt: attempt(Mode::Practice), activity: 0 },
            running(Mode::Practice),
            ExamState::Grading { attempt: attempt(Mode::Practice), activity: 0, scores: Vec::new(), note: None },
            ExamState::Ending { attempt: attempt(Mode::Practice), activity: 0 },
        ];
        for phase in phases {
            put(&exams, phase);
            let id = exams.bank().exams.keys().next().unwrap().clone();
            assert!(matches!(exams.start(&id, Mode::Practice, false).await, Err(AppError::Busy { .. })));
        }
        for phase in [
            ExamState::Grading { attempt: attempt(Mode::Exam), activity: 0, scores: Vec::new(), note: None },
            ExamState::Resuming { attempt: attempt(Mode::Exam), activity: 0 },
            ExamState::Ending { attempt: attempt(Mode::Exam), activity: 0 },
        ] {
            put(&exams, phase);
            assert!(matches!(exams.end().await, Err(AppError::Invalid { .. })));
        }
        put(&exams, ExamState::Preparing { attempt: attempt(Mode::Exam), activity: 0 });
        let token = exams.cancel.locked().clone();
        exams.end().await.unwrap();
        assert!(token.is_cancelled(), "the preparation is cancelled; its task cleans up");
        assert!(matches!(exams.state(), ExamState::Preparing { .. }));
    }

    /// Exam mode keeps its material: no solution nor check until the result;
    /// practice shows them, and notes the solutions opened
    #[tokio::test]
    async fn exam_mode_shows_nothing_until_the_result() {
        let exams = exams();
        let id = with_question(&exams);
        put(&exams, running(Mode::Exam));
        assert!(matches!(exams.solution(&id), Err(AppError::Invalid { .. })));
        assert!(matches!(exams.check_question(&id).await, Err(AppError::Invalid { .. })));
        assert!(exams.state().exam_in_progress());
        put(&exams, running(Mode::Practice));
        assert!(!exams.solution_seen("1", &id));
        exams.solution(&id).unwrap();
        assert!(exams.solution_seen("1", &id));
        assert!(!exams.state().exam_in_progress());
        put(
            &exams,
            ExamState::Finished {
                attempt: attempt(Mode::Exam),
                result: ExamResult {
                    score: 0.0,
                    passed: false,
                    started_at: 0.0,
                    finished_at: 0.0,
                    questions: Vec::new(),
                    outside: Vec::new(),
                    assisted: Vec::new(),
                    prediction: None,
                },
            },
        );
        exams.solution(&id).unwrap();
        assert!(!exams.state().exam_in_progress(), "the result is in: the review is open");
        // A failed exam-mode attempt may be tried again: still under way
        put(&exams, ExamState::Failed { attempt: Some(attempt(Mode::Exam)), message: String::new(), activity: None, resumable: true });
        assert!(exams.state().exam_in_progress());
    }

    /// A running attempt is kept with its questions, to resume; one being
    /// graded or resumed, or that failed to, stays as it was kept; anything
    /// else has nothing to resume
    #[test]
    fn a_running_attempt_is_kept_to_resume() {
        let exams = exams();
        with_question(&exams);
        exams.save_attempt(&running(Mode::Practice));
        let (kept, questions) = saved_running(&exams.store).expect("kept");
        assert_eq!((kept.id.as_str(), questions.len()), ("1", 1));
        exams.save_attempt(&ExamState::Failed {
            attempt: Some(attempt(Mode::Practice)),
            message: String::new(),
            activity: None,
            resumable: true,
        });
        exams.save_attempt(&ExamState::Grading { attempt: attempt(Mode::Practice), activity: 0, scores: Vec::new(), note: None });
        assert!(saved_running(&exams.store).is_some());
        exams.save_attempt(&ExamState::Idle);
        assert!(saved_running(&exams.store).is_none());
        // Nothing kept: nothing to resume, and no retry of it
        exams.restore();
        assert!(matches!(exams.state(), ExamState::Idle));
    }
}
