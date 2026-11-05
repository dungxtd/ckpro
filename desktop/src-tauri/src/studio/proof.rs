//! Exams being proven, by conversation. A proof makes a cluster as big as
//! its exam needs, runs its questions on it as in an exam, and removes it:
//! the cluster lives as long as the proof, no longer. Where each is (its
//! cluster, the setups, the question running) and its results as they
//! come, for the screen to show; how to stop one. Several run at once, a
//! conversation one at a time.

use super::draft::{DraftStatus, ExamDraft};
use crate::lab::verify::Run;
use crate::sync::MutexExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

/// The cluster questions of Create run on (the generator's rule)
pub const CLUSTER: &str = "k8s";
/// Workers a question may need: the most the packs' questions do
pub const MAX_WORKERS: u8 = 3;

/// Memory a proof's run takes: a cluster with `workers` workers and its
/// task host
pub fn run_mb(workers: u8) -> u32 {
    crate::runtime::preflight::run_memory_mb(workers)
}

/// Which questions a proof checks: all, or those not proven (new or
/// changed since the last proof; every setup still runs, as in the exam)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    All,
    Changed,
}

/// What proving the exam takes, before it starts
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ProofPlan {
    /// Workers of its cluster
    pub workers: u8,
    /// Memory it takes, in MB
    pub mb: u32,
    /// Questions not proven (new or changed), of `total`
    pub changed: u32,
    pub total: u32,
    /// Minutes it takes, about: every question, or the changed ones
    pub minutes_all: u32,
    pub minutes_changed: u32,
    /// Why it cannot run now (questions deleted, two that change the
    /// nodes, too little memory)
    pub problem: Option<String>,
    /// Its questions that were deleted, by id
    pub missing: Vec<String>,
}

impl ProofPlan {
    /// The plan for `draft` (its questions in `bank`), its workers by
    /// question; `fits` says whether Docker has room for so many megabytes
    pub fn of(draft: &ExamDraft, bank: &crate::lab::load::LoadedPack, workers: u8, fits: impl Fn(u32) -> Result<(), String>) -> Self {
        let total = draft.items.len() as u32;
        let changed = draft.statuses().filter(|(_, s)| **s != DraftStatus::Proven).count() as u32;
        let mb = run_mb(workers);
        // A cluster in two minutes, a setup in a quarter, a question in half
        // (as measured on the packs, rounded up)
        let minutes = |checked: u32| (8 + total + 2 * checked).div_ceil(4);
        Self {
            workers,
            mb,
            changed,
            total,
            minutes_all: minutes(total),
            minutes_changed: minutes(changed),
            problem: draft.complete(bank).err().or_else(|| draft.disrupting().err()).or_else(|| fits(mb).err()),
            missing: draft.missing(bank).into_iter().map(|(id, _)| id).collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Proof {
    /// Its activity: the plan and the log
    pub activity: u32,
    /// When it started (ms since the epoch)
    pub started_at: f64,
    /// The questions it checks, by id or key, in the order they run
    pub checking: Vec<String>,
    pub stage: ProofStage,
    /// The questions checked so far, and how
    pub results: Vec<ProofResult>,
    /// When each step of its activity began (ms since the epoch): the
    /// cluster, the setups, then each question checked
    pub marks: Vec<f64>,
    /// When it ended (ms since the epoch)
    pub ended_at: Option<f64>,
    /// The candidate stopped it
    #[serde(default)]
    pub stopped: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "stage", rename_all = "snake_case")]
pub enum ProofStage {
    /// Its cluster is being made
    Cluster { workers: u8 },
    /// Every question's setup, as an exam's
    SettingUp,
    /// The question `key` is being checked, since (ms since the epoch)
    Proving { key: String, since: f64 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ProofResult {
    pub key: String,
    pub status: DraftStatus,
}

type Changed = Box<dyn Fn(i32, Option<&Proof>) + Send + Sync>;

struct Running {
    proof: Proof,
    /// Memory its run takes, in MB
    mb: u32,
    cancel: CancellationToken,
    /// Its run, once made: removed if the app quits meanwhile
    run: Option<Arc<Run>>,
}

pub struct Proofs {
    running: Mutex<HashMap<i32, Running>>,
    changed: Changed,
}

impl Proofs {
    pub fn new(changed: impl Fn(i32, Option<&Proof>) + Send + Sync + 'static) -> Self {
        Self { running: Mutex::default(), changed: Box::new(changed) }
    }

    /// Start proving the conversation's exam; how to stop it, or none if it
    /// is being proven already
    pub fn begin(&self, session: i32, proof: Proof, mb: u32) -> Option<CancellationToken> {
        let mut running = self.running.locked();
        if running.contains_key(&session) {
            return None;
        }
        let cancel = CancellationToken::new();
        (self.changed)(session, Some(&proof));
        running.insert(session, Running { proof, mb, cancel: cancel.clone(), run: None });
        Some(cancel)
    }

    /// Its run, being made
    pub fn set_run(&self, session: i32, run: Arc<Run>) {
        if let Some(r) = self.running.locked().get_mut(&session) {
            r.run = Some(run);
        }
    }

    pub fn update(&self, session: i32, f: impl FnOnce(&mut Proof)) {
        let mut running = self.running.locked();
        if let Some(r) = running.get_mut(&session) {
            f(&mut r.proof);
            (self.changed)(session, Some(&r.proof));
        }
    }

    /// It ended: as it stood last (its end time), then none
    pub fn end(&self, session: i32) {
        let ended = self.running.locked().remove(&session);
        if let Some(mut r) = ended {
            r.proof.ended_at = Some(crate::runtime::activity::now_ms());
            (self.changed)(session, Some(&r.proof));
            (self.changed)(session, None);
        }
    }

    /// The candidate stopped it: its cluster goes
    pub fn stop(&self, session: i32) {
        if let Some(r) = self.running.locked().get_mut(&session) {
            r.proof.stopped = true;
            r.cancel.cancel();
        }
    }

    /// Memory the proofs running take, in MB: their clusters are not among
    /// the app's that Docker's free memory is reckoned with
    pub fn reserved_mb(&self) -> u32 {
        self.running.locked().values().map(|r| r.mb).sum()
    }

    /// Those running, for a screen opening
    pub fn list(&self) -> Vec<(i32, Proof)> {
        self.running.locked().iter().map(|(session, r)| (*session, r.proof.clone())).collect()
    }

    /// The app quits: the proofs' clusters and task hosts go with it, handed
    /// to a detached `docker rm` so quitting stays instant (the next start
    /// sweeps what is left of the runs)
    pub fn on_exit(&self) {
        for r in self.running.locked().values() {
            r.cancel.cancel();
            if let Some(run) = &r.run {
                run.remove_detached();
            }
        }
    }
}
