//! Create with Claude: exams built in a chat, proven whole on a cluster
//! made for the proof (`proof`), then saved to the candidate's pack. The conversation itself is the coach's (`ai::studio`).

pub mod draft;
pub mod proof;
pub mod tools;

use crate::error::{AppError, AppResult};
use crate::lab::exam::Exams;
use crate::lab::load::Loaded;
use crate::lab::mine;
use crate::lab::model::Question;
use crate::lab::load::LoadedPack;
use crate::lab::verify::{Report, Run, Stage, Topology};
use crate::runtime::activity::{Activities, now_ms};
use crate::runtime::infra::Infra;
use crate::store::Store;
use draft::{DraftItem, DraftStatus, ExamDraft};
use proof::{Proof, ProofPlan, ProofResult, ProofStage, Proofs, Scope};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

/// The id a new question has while it is proven: under the candidate's
/// pack, by its key
fn proving_id(certification: &str, key: &str) -> String {
    format!("{}/{certification}/draft-{key}", mine::PACK_ID)
}

/// What proving an exam takes from the app
pub struct Proving<'a> {
    pub store: &'a Store,
    pub exams: &'a Exams,
    pub proofs: &'a Proofs,
    pub activities: &'a Arc<Activities>,
    pub infra: Arc<Infra>,
    pub data_dir: &'a Path,
}

/// The draft's questions as a run takes them
struct Staged {
    /// The new ones under the candidate's pack, the others as they are
    pack: LoadedPack,
    /// Each one's id in the run, and its id or key in the draft, in order
    ids: Vec<(String, String)>,
    /// The most workers they need
    workers: u8,
}

fn staged(bank: &LoadedPack, data_dir: &Path, draft: &ExamDraft) -> AppResult<Staged> {
    let mut new = Vec::new();
    let mut ids = Vec::new();
    for item in &draft.items {
        match item {
            DraftItem::Existing { id, .. } => ids.push((id.clone(), id.clone())),
            DraftItem::New(q) => {
                let question: Question =
                    serde_saphyr::from_str(&q.yaml).map_err(|e| AppError::invalid(format!("{}: {e}", q.key)))?;
                let id = proving_id(&draft.certification, &q.key);
                new.push((id.clone(), data_dir.join("runs").join(format!("{id}.yaml")), question));
                ids.push((id, q.key.clone()));
            }
        }
    }
    let mut staging = crate::ai::generate::staging_of(bank, data_dir, new);
    for (id, _) in &ids {
        if let Some(q) = bank.questions.get(id) {
            staging.questions.insert(id.clone(), Loaded { path: q.path.clone(), value: q.value.clone() });
        }
    }
    let workers = staging.questions.values().map(|q| q.value.workers).max().unwrap_or(1);
    Ok(Staged { pack: staging, ids, workers })
}

/// What proving the conversation's exam takes: its cluster, the time, and
/// why it cannot run now if so
pub fn plan(store: &Store, exams: &Exams, data_dir: &Path, session: i32, fits: impl Fn(u32) -> Result<(), String>) -> AppResult<ProofPlan> {
    let draft = ExamDraft::load(store, session)?;
    Ok(ProofPlan::of(&draft, staged(&exams.bank(), data_dir, &draft)?.workers, fits))
}

/// Prove the exam (the candidate's go: its scripts run there) on a cluster
/// made for it as big as its questions need, removed after: its questions
/// together and in order as in an exam, every setup first, then each check
/// must fail before its solution and pass after; all of them, or those not
/// proven (`scope`). Where it is shows as it goes (`proofs`), and the
/// candidate can stop it. Their results, in the draft returned; none if
/// the exam changed meanwhile, or it was stopped
pub async fn verify(app: Proving<'_>, session: i32, scope: Scope, fits: impl Fn(u32) -> Result<(), String>) -> AppResult<ExamDraft> {
    let mut draft = ExamDraft::load(app.store, session)?;
    if draft.saved.is_some() || draft.items.is_empty() {
        return Ok(draft);
    }
    if scope == Scope::All {
        draft.unprove();
    }
    let checking: Vec<String> = draft.statuses().filter(|(_, s)| **s != DraftStatus::Proven).map(|(key, _)| key.to_string()).collect();
    if checking.is_empty() {
        return Ok(draft);
    }
    draft.disrupting().map_err(AppError::invalid)?;
    let bank = app.exams.bank();
    let Staged { pack: staging, ids, workers } = staged(&bank, app.data_dir, &draft)?;
    fits(proof::run_mb(workers)).map_err(AppError::invalid)?;
    let title_of = |key: &str| {
        draft.items.iter().find_map(|i| match i {
            DraftItem::Existing { id, title, .. } if id == key => Some(if title.is_empty() { id.clone() } else { title.clone() }),
            DraftItem::New(q) if q.key == key => Some(q.title.clone()),
            _ => None,
        })
    };

    // The plan: a cluster, the setups, then each question checked
    let steps: Vec<String> = [format!("Make a cluster with {workers} worker{}", if workers == 1 { "" } else { "s" }), "Set up every question".into()]
        .into_iter()
        .chain(checking.iter().filter_map(|k| title_of(k)))
        .collect();
    let title = if draft.title.is_empty() { "Prove the exam".to_string() } else { format!("Prove {}", draft.title) };
    let op = app.activities.begin(title, steps);
    let started = now_ms();
    let proof = Proof {
        activity: op.id(),
        started_at: started,
        checking: checking.clone(),
        stage: ProofStage::Cluster { workers },
        results: Vec::new(),
        marks: vec![started],
        ended_at: None,
    };
    let Some(cancel) = app.proofs.begin(session, proof) else {
        return op.end(Err(AppError::invalid("this exam is being proven already")));
    };
    let handle = app.activities.handle(op.id());
    let log = move |line: String| handle.log(line);
    let stopped = || AppError::Cancelled { message: "you stopped proving the exam".into() };

    let proved = async {
        let run = Arc::new(Run::new(app.data_dir)?);
        app.proofs.set_run(session, run.clone());
        let topology = Topology::from([(proof::CLUSTER.to_string(), workers)]);
        let reports = match run.start(&app.infra, &topology, &cancel, &log).await {
            Err(e) => Err(e),
            Ok(()) => {
                let at = |index: usize| ids[index].1.clone();
                let on = |stage: Stage| match stage {
                    Stage::SettingUp => {
                        op.step(1, None);
                        app.proofs.update(session, |p| {
                            p.stage = ProofStage::SettingUp;
                            p.marks.push(now_ms());
                        });
                    }
                    Stage::Proving(index) => {
                        let key = at(index);
                        let step = checking.iter().position(|k| *k == key).unwrap_or(0);
                        op.step(step as u32 + 2, None);
                        let since = now_ms();
                        app.proofs.update(session, |p| {
                            p.stage = ProofStage::Proving { key, since };
                            p.marks.push(since);
                        });
                    }
                    Stage::Proved(index, report) => {
                        app.proofs.update(session, |p| p.results.push(ProofResult { key: at(index), status: status_of(report) }));
                    }
                };
                let order: Vec<String> = ids.iter().map(|(id, _)| id.clone()).collect();
                let only: HashSet<String> = ids.iter().filter(|(_, key)| checking.contains(key)).map(|(id, _)| id.clone()).collect();
                tokio::select! {
                    reports = run.check(&staging, &order, Some(&only), &log, &on) => reports,
                    () = cancel.cancelled() => Err(stopped()),
                }
            }
        };
        // It lives as long as the proof
        run.finish(&log).await;
        reports
    }
    .await;
    app.proofs.end(session);
    let reports = op.end(proved)?;

    // The conversation went on meanwhile: the results are of the exam proven
    let mut now = ExamDraft::load(app.store, session)?;
    if !now.items.iter().map(DraftItem::content).eq(draft.items.iter().map(DraftItem::content)) {
        return Err(AppError::invalid("the exam changed while it was proven: prove it again"));
    }
    if scope == Scope::All {
        now.unprove();
    }
    for report in &reports {
        let Some((_, key)) = ids.iter().find(|(id, _)| *id == report.question) else { continue };
        if let Some(status) = now.status_mut(key) {
            *status = status_of(report);
        }
    }
    now.save(app.store, session)?;
    Ok(now)
}

fn status_of(report: &Report) -> DraftStatus {
    if report.ok { DraftStatus::Proven } else { DraftStatus::Failed { problems: report.problems.clone() } }
}

/// Save the draft as an exam of the candidate's pack: its new questions
/// (all proven) as theirs, then the exam listing every question in order.
/// Its id
pub fn save(store: &Store, exams: &Exams, data_dir: &Path, session: i32) -> AppResult<String> {
    let mut draft = ExamDraft::load(store, session)?;
    if let Some(id) = &draft.saved {
        return Ok(id.clone());
    }
    if draft.title.trim().is_empty() || draft.certification.is_empty() {
        return Err(AppError::invalid("the exam has no title or certification yet"));
    }
    if draft.items.is_empty() {
        return Err(AppError::invalid("the exam has no questions yet"));
    }
    if !draft.proven() {
        return Err(AppError::invalid("prove the exam on a cluster first: every question, together"));
    }
    let bank = exams.bank();
    let cert_title = bank.pack.certifications.get(&draft.certification).map(|c| c.title.clone()).unwrap_or_default();
    let mut ids = Vec::new();
    for item in &draft.items {
        match item {
            DraftItem::Existing { id, .. } => ids.push(id.clone()),
            DraftItem::New(q) => {
                let (id, path) = mine::new_question(data_dir, &draft.certification, &q.title);
                let yaml = format!("# Written with Claude in Create and proven by `cktry lab verify`\n{}", q.yaml);
                mine::save(data_dir, &draft.certification, &cert_title, &path, &yaml)?;
                ids.push(id);
            }
        }
    }
    let id = mine::save_exam(data_dir, &draft.title, &draft.certification, draft.duration_minutes, &ids)?;
    exams.reload_mine(data_dir);
    draft.saved = Some(id.clone());
    draft.save(store, session)?;
    Ok(id)
}
