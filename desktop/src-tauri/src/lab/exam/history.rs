//! The finished attempts: kept as each is graded, read for History, the
//! figures, readiness and the draw.

use super::{Attempt, ExamResult, Exams, Mode};
use serde::{Deserialize, Serialize};

/// A finished attempt, as History keeps it
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntry {
    pub attempt_id: String,
    pub exam_id: String,
    pub title: String,
    /// Its exam's certification: kept, the exam may be deleted since
    pub certification: String,
    pub mode: Mode,
    pub pass_score: u32,
    pub result: ExamResult,
}

impl Exams {
    pub(super) fn save_history(&self, attempt: &Attempt, result: &ExamResult) {
        let entry = HistoryEntry {
            attempt_id: attempt.id.clone(),
            exam_id: attempt.exam_id.clone(),
            title: attempt.title.clone(),
            certification: attempt.certification.clone(),
            mode: attempt.mode,
            pass_score: attempt.pass_score,
            result: result.clone(),
        };
        if let Err(e) = self.store.add_history(&attempt.id, &attempt.exam_id, result.finished_at, &entry) {
            tracing::warn!(error = %e, "saving exam history");
        }
    }

    /// Every finished attempt, newest first (none when they cannot be read,
    /// which the log tells): read once per request, the caller passes them on
    pub fn history(&self) -> Vec<HistoryEntry> {
        self.store.history().unwrap_or_else(|e| {
            tracing::warn!(error = %e, "reading exam history");
            Vec::new()
        })
    }

    /// One finished attempt, by its id
    pub fn history_entry(&self, attempt_id: &str) -> crate::error::AppResult<Option<HistoryEntry>> {
        self.store.history_entry(attempt_id)
    }
}
