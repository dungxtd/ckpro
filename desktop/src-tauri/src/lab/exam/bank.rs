//! The question bank: the bundled pack plus the candidate's own questions,
//! read again when they change, and the candidate's exams deleted.

use super::{Attempt, ExamState, Exams};
use crate::error::{AppError, AppResult};
use crate::lab::load::LoadedPack;
use crate::sync::{MutexExt, RwLockExt};
use std::sync::Arc;

impl Exams {
    pub(super) fn pack(&self) -> Arc<LoadedPack> {
        self.pack.read_ok().clone()
    }

    /// Swap in a new question bank (a question was added); a running attempt
    /// keeps its rendered questions
    pub fn replace_pack(&self, pack: LoadedPack) {
        *self.pack.write_ok() = Arc::new(pack);
    }

    /// The YAML files under `roots`: how many, their size, the newest change
    fn files_as(roots: &[std::path::PathBuf]) -> (usize, u64, Option<std::time::SystemTime>) {
        let mut seen = (0, 0, None);
        let mut dirs: Vec<std::path::PathBuf> = roots.to_vec();
        while let Some(dir) = dirs.pop() {
            for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                let path = entry.path();
                let Ok(meta) = entry.metadata() else { continue };
                if meta.is_dir() {
                    dirs.push(path);
                } else if path.extension().is_some_and(|e| e == "yaml") {
                    seen.0 += 1;
                    seen.1 += meta.len();
                    seen.2 = seen.2.max(meta.modified().ok());
                }
            }
        }
        seen
    }

    /// The question bank as it is now
    pub fn bank(&self) -> Arc<LoadedPack> {
        self.pack()
    }

    /// Read the candidate's questions again (one was added or deleted), over
    /// the bundled pack read again from where it came from
    pub fn reload_mine(&self, data_dir: &std::path::Path) {
        let _one = self.reloading.locked();
        self.reload(data_dir);
    }

    /// Read the packs again if their files changed since they were read (a
    /// question edited on disk): a look at the files, not a parse, otherwise
    pub fn reload_if_changed(&self, data_dir: &std::path::Path) {
        let _one = self.reloading.locked();
        let now = Self::files_as(&[self.bank().root.clone(), crate::lab::mine::root(data_dir)]);
        let mut read_as = self.read_as.locked();
        // The first look reads them too: they may have changed since the start
        if *read_as != Some(now) {
            *read_as = Some(now);
            drop(read_as);
            self.reload(data_dir);
        }
    }

    fn reload(&self, data_dir: &std::path::Path) {
        match crate::lab::load::load(&self.bank().root).0 {
            Some(core) => self.replace_pack(crate::lab::mine::merged(core, data_dir)),
            None => tracing::warn!("could not reload the bundled pack: the change shows after a restart"),
        }
    }

    /// Delete one of the candidate's own exams (and its questions, and the
    /// custom exams using them); not while an attempt of any of them, or of
    /// their questions, is open. Their files go, the bank is read again,
    /// then what pointed at them goes in one transaction: their plans, their
    /// places in the sidebar, and Create conversations that saved them hold
    /// drafts again (one being proven, `proving`, is left as it is). The
    /// exams gone
    pub fn delete_exam(&self, exam_id: &str, data_dir: &std::path::Path, proving: impl Fn(i32) -> bool) -> AppResult<Vec<String>> {
        let deletion = crate::lab::mine::deletion(data_dir, exam_id)?;
        let state = self.state();
        let touches = |a: &Attempt| {
            deletion.exams.contains(&a.exam_id)
                || deletion.questions.as_ref().is_some_and(|prefix| a.questions.iter().any(|q| q.id.starts_with(prefix.as_str())))
        };
        if !matches!(state, ExamState::Idle | ExamState::Finished { .. }) && state.attempt().is_some_and(touches) {
            return Err(AppError::invalid("an attempt using this exam or its questions is open; close it first"));
        }
        crate::lab::mine::delete(&deletion)?;
        self.reload_mine(data_dir);
        let gone = deletion.exams;
        crate::studio::exams_deleted(&self.store, &gone, |id| crate::lab::mine::on_disk(data_dir, id), proving)?;
        Ok(gone)
    }
}
