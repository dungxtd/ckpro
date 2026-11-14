//! The finished attempts: kept as each is graded, read for History, the
//! figures, readiness and the draw.

use super::{Attempt, ExamResult, Exams, Mode};
use crate::lab::load::LoadedPack;
use crate::store::Store;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A finished attempt, as History keeps it
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntry {
    pub attempt_id: String,
    pub exam_id: String,
    pub title: String,
    /// Its exam's certification: kept, the exam may be deleted since
    /// (entries from before it was kept got it once, `certify_history`)
    #[serde(default)]
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

/// Entries kept before an entry kept its certification get it, once: from
/// their exam, else from their questions, and are kept so. Read after that,
/// every entry has its own
pub fn certify_history(store: &Store, pack: &LoadedPack) {
    let entries: Vec<HistoryEntry> = store.history_without_certification().unwrap_or_else(|e| {
        tracing::warn!(error = %e, "reading exam history");
        Vec::new()
    });
    for mut entry in entries {
        let Some(certification) = certification_of(pack, &entry) else { continue };
        entry.certification = certification;
        if let Err(e) = store.add_history(&entry.attempt_id, &entry.exam_id, entry.result.finished_at, &entry) {
            tracing::warn!(error = %e, "keeping an attempt's certification");
        }
    }
}

/// An entry's certification, for one kept before it was: its exam's, else
/// the one most of its questions belong to (its exam deleted)
fn certification_of(pack: &LoadedPack, entry: &HistoryEntry) -> Option<String> {
    if let Some(exam) = pack.exams.get(&entry.exam_id) {
        return Some(exam.value.certification.clone());
    }
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for q in &entry.result.questions {
        for certification in pack.questions.get(&q.id).into_iter().flat_map(|l| l.value.certifications.keys()) {
            *counts.entry(certification).or_default() += 1;
        }
    }
    counts.into_iter().max_by_key(|(_, n)| *n).map(|(c, _)| c.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An entry kept without its certification gets its exam's, once, and
    /// keeps it; one that has its own is left as it is
    #[test]
    fn entries_without_their_certification_get_it_once() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        let pack = crate::lab::load::load(&root).0.expect("the core pack loads");
        let exam = pack.exams.iter().find(|(_, e)| e.value.certification == "ckad").map(|(id, _)| id.clone()).unwrap();
        let store = Store::in_memory().unwrap();
        let entry = |id: &str, certification: Option<&str>| {
            let mut json = serde_json::json!({
                "attempt_id": id, "exam_id": exam, "title": "CKAD", "mode": "practice", "pass_score": 66,
                "result": { "score": 50.0, "passed": false, "started_at": 1.0, "finished_at": 2.0, "questions": [] },
            });
            if let Some(c) = certification {
                json["certification"] = c.into();
            }
            store.add_history(id, &exam, 2.0, &json).unwrap();
        };
        entry("old", None);
        entry("kept", Some("cka"));
        certify_history(&store, &pack);
        let certification = |id: &str| store.history_entry::<HistoryEntry>(id).unwrap().unwrap().certification;
        assert_eq!((certification("old"), certification("kept")), ("ckad".to_string(), "cka".to_string()));
        assert!(store.history_without_certification::<HistoryEntry>().unwrap().is_empty());
    }
}
