//! Create with Claude: exams built in a chat, proven whole on a cluster
//! made for the proof (`proof`), then saved to the candidate's pack. The conversation itself is the coach's (`ai::studio`).

pub mod draft;
pub mod proof;
pub mod rules;

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
use crate::sync::MutexExt;
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

/// Change a conversation's draft, not saved yet (a saved one is an exam
/// now) nor being proven (`proving`, asked again as the change is written:
/// a proof begun after it reads the draft as changed; its results would be
/// thrown away at its end otherwise): the candidate's changes and the
/// assistant's alike. `f` may run again, on the draft as another change
/// left it. The draft as kept, and what `f` returns
pub fn edit<T>(store: &Store, session: i32, proving: impl Fn() -> bool, mut f: impl FnMut(&mut ExamDraft) -> AppResult<T>) -> AppResult<(ExamDraft, T)> {
    let not_proving = || {
        if proving() {
            Err(AppError::busy("the exam is being proven: wait for the proof to end, or stop it, before changing the exam"))
        } else {
            Ok(())
        }
    };
    ExamDraft::update_unless(store, session, not_proving, |draft| {
        not_proving()?;
        if draft.saved.is_some() {
            return Err(AppError::invalid("this exam is saved; start a new conversation for another"));
        }
        let before: Vec<(String, String)> = draft.items.iter().map(|i| { let (a, b) = i.content(); (a.to_string(), b.to_string()) }).collect();
        let result = f(draft)?;
        if !draft.items.iter().map(DraftItem::content).eq(before.iter().map(|(a, b)| (a.as_str(), b.as_str()))) {
            draft.together = false;
        }
        Ok(result)
    })
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
    let mut staging = crate::lab::mine::staging(bank, data_dir, new);
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
pub fn plan(store: &Store, exams: &Exams, data_dir: &Path, session: i32, fits: impl Fn(u32) -> AppResult<()>) -> AppResult<ProofPlan> {
    let draft = ExamDraft::load(store, session)?;
    let bank = exams.bank();
    Ok(ProofPlan::of(&draft, &bank, staged(&bank, data_dir, &draft)?.workers, fits))
}

/// Prove the exam (the candidate's go: its scripts run there) on a cluster
/// made for it as big as its questions need, removed after: its questions
/// together and in order as in an exam, every setup first, then each check
/// must fail before its solution and pass after; all of them, or those not
/// proven (`scope`). Where it is shows as it goes (`proofs`), and the
/// candidate can stop it. Their results, in the draft returned; none if
/// the exam changed meanwhile, or it was stopped
pub async fn verify(app: Proving<'_>, session: i32, scope: Scope, fits: impl Fn(u32) -> AppResult<()>) -> AppResult<ExamDraft> {
    // Proven against the questions as they are on disk now (not if a proof
    // runs: then `begin` below refuses this one)
    let mut draft = opened(app.store, app.exams, app.data_dir, session, || app.proofs.proving(session))?;
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
    let bank = app.exams.bank();
    draft.complete(&bank)?;
    draft.disrupting()?;
    let Staged { pack: staging, ids, workers } = staged(&bank, app.data_dir, &draft)?;
    let mb = proof::run_mb(workers);
    fits(mb)?;

    // The plan: a cluster, the setups, then each question checked
    let steps: Vec<String> = [format!("Make a cluster with {workers} worker{}", if workers == 1 { "" } else { "s" }), "Set up every question".into()]
        .into_iter()
        .chain(checking.iter().filter_map(|k| draft.title_of(k).map(str::to_string)))
        .collect();
    let title = if draft.title.is_empty() { "Prove the exam".to_string() } else { format!("Prove {}", draft.title) };
    let started = now_ms();
    let proof = Proof {
        activity: 0,
        started_at: started,
        checking: checking.clone(),
        stage: ProofStage::Cluster { workers },
        results: Vec::new(),
        marks: vec![started],
        ended_at: None,
        stopped: false,
    };
    // One at a time per conversation: refused before anything is begun
    let Some(cancel) = app.proofs.begin(session, proof, mb, || app.exams.assistant_allowed())? else {
        return Err(AppError::busy("this exam is being proven already"));
    };
    // Changed between being read and the proof begun (edits are refused from
    // here): not proven as it was read
    let now = ExamDraft::load(app.store, session);
    if !now.as_ref().is_ok_and(|now| now.items.iter().map(DraftItem::content).eq(draft.items.iter().map(DraftItem::content))) {
        app.proofs.end(session);
        now?;
        return Err(AppError::invalid("the exam changed as the proof began: prove it again"));
    }
    let op = app.activities.begin(title, steps);
    app.proofs.update(session, |p| p.activity = op.id());
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
                    // Stopped as it started: no setup begins
                    biased;
                    () = cancel.cancelled() => Err(stopped()),
                    reports = run.check(&staging, &order, Some(&only), &log, &on) => reports,
                }
            }
        };
        // It lives as long as the proof
        run.finish(&log).await;
        reports
    }
    .await;
    // The proof ends once its results are kept: edits wait till then
    let kept = op.end(proved).and_then(|reports| keep(app.store, session, scope, &draft, &ids, &reports));
    app.proofs.end(session);
    kept
}

/// Keep a proof's results in the draft: not if it changed meanwhile
fn keep(store: &Store, session: i32, scope: Scope, draft: &ExamDraft, ids: &[(String, String)], reports: &[Report]) -> AppResult<ExamDraft> {
    let (now, ()) = ExamDraft::update(store, session, |now| {
        if !now.items.iter().map(DraftItem::content).eq(draft.items.iter().map(DraftItem::content)) {
            return Err(AppError::invalid("the exam changed while it was proven: prove it again"));
        }
        if scope == Scope::All {
            now.unprove();
        }
        for report in reports {
            let Some((_, key)) = ids.iter().find(|(id, _)| *id == report.question) else { continue };
            if let Some(status) = now.status_mut(key) {
                *status = status_of(report);
            }
        }
        now.together = scope == Scope::All && now.proven();
        Ok(())
    })?;
    Ok(now)
}

fn status_of(report: &Report) -> DraftStatus {
    if report.ok { DraftStatus::Proven } else { DraftStatus::Failed { problems: report.problems.clone() } }
}

/// Save the draft as an exam of the candidate's pack: its new questions
/// (all proven) as theirs, then the exam listing every question in order.
/// Its id
pub fn save(store: &Store, exams: &Exams, data_dir: &Path, session: i32, proving: impl Fn() -> bool) -> AppResult<String> {
    // One save at a time: two would write the same exam twice
    static SAVING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _one = SAVING.locked();
    // Saved as the questions are on disk now: one changed since its proof is
    // not proven any more
    let draft = opened(store, exams, data_dir, session, &proving)?;
    if proving() {
        return Err(AppError::busy("the exam is being proven: save it once the proof ends"));
    }
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
    draft.complete(&bank)?;
    let cert_title = bank.pack.certifications.get(&draft.certification).map(|c| c.title.clone()).unwrap_or_default();
    // The files first, then the draft marked saved if it is still the one
    // they were written from; any step failing takes back the files written
    let mut ids = Vec::new();
    let mut written = Vec::new();
    let files = (|| {
        for item in &draft.items {
            match item {
                DraftItem::Existing { id, .. } => ids.push(id.clone()),
                DraftItem::New(q) => {
                    let (id, path) = mine::new_question(data_dir, &draft.certification, &q.title);
                    let yaml = format!("# Written with Claude in Create and proven by `ckpro lab verify`\n{}", q.yaml);
                    mine::write_question(data_dir, &path, &yaml)?;
                    written.push(path);
                    ids.push(id);
                }
            }
        }
        if !written.is_empty() {
            mine::relist(data_dir, &draft.certification, &cert_title)?;
        }
        mine::save_exam(data_dir, &draft.title, &draft.certification, draft.duration_minutes, &ids)
    })();
    let marked = files.and_then(|id| {
        written.extend(mine::file_of(data_dir, &id));
        ExamDraft::update(store, session, |now| {
            if now.saved.is_some() || !now.items.iter().map(DraftItem::content).eq(draft.items.iter().map(DraftItem::content)) {
                return Err(AppError::invalid("the exam changed while it was saved: save it again"));
            }
            // Its new questions are the candidate's now: saved again (the exam
            // deleted), it lists them, not new copies
            for (item, id) in now.items.iter_mut().zip(&ids) {
                if let DraftItem::New(q) = item {
                    *item = DraftItem::Existing {
                        id: id.clone(),
                        title: q.title.clone(),
                        domain: q.domain.clone(),
                        minutes: q.minutes,
                        status: q.status.clone(),
                        disrupts: q.disrupts,
                        // Taken from the file as the packs read it, next it is opened
                        version: String::new(),
                        written: Some(q.yaml.clone()),
                    };
                }
            }
            now.saved = Some(id.clone());
            Ok(id.clone())
        })
    });
    let id = match marked {
        Ok((_, id)) => id,
        Err(e) => {
            for path in &written {
                let _ = std::fs::remove_file(path);
            }
            if draft.items.iter().any(|i| matches!(i, DraftItem::New(_))) {
                let _ = mine::relist(data_dir, &draft.certification, &cert_title);
            }
            return Err(e);
        }
    };
    exams.reload_mine(data_dir);
    Ok(id)
}

/// Exams were deleted (their files gone): what pointed at them goes, in one
/// transaction (`Store::exams_deleted`). The conversations that saved them
/// hold drafts again, to change and save anew; the questions any draft
/// wrote that went with them (`on_disk` says which files are still there)
/// new ones again. A draft being proven (`proving`) is left as the proof
/// read it
pub fn exams_deleted(store: &Store, exam_ids: &[String], on_disk: impl Fn(&str) -> bool, proving: impl Fn(i32) -> bool) -> AppResult<()> {
    store.exams_deleted(exam_ids, |session, text| {
        let Ok(mut draft) = serde_json::from_str::<ExamDraft>(text) else { return Ok(None) };
        if proving(session) {
            return Ok(None);
        }
        let unsaved = draft.saved.as_ref().is_some_and(|id| exam_ids.contains(id));
        if unsaved {
            draft.saved = None;
        }
        let rewritten = draft.saved.is_none() && draft.rewrite_gone(&on_disk);
        if rewritten {
            draft.together = false;
        }
        if !unsaved && !rewritten {
            return Ok(None);
        }
        serde_json::to_string(&draft).map(Some).map_err(|e| AppError::internal("keeping the draft", e))
    })
}

/// A conversation's draft as it is opened, proven or saved, over the packs
/// read again (if their files changed): saved as an exam whose file is gone,
/// it is a draft again; the questions it wrote whose files are gone are new
/// ones again; a question changed on disk is taken as it is, to prove
/// again. A draft being proven (`proving`, asked as the change is made)
/// stays as the proof read it
pub fn opened(store: &Store, exams: &Exams, data_dir: &Path, session: i32, proving: impl Fn() -> bool) -> AppResult<ExamDraft> {
    exams.reload_if_changed(data_dir);
    let bank = exams.bank();
    let on_disk = |id: &str| mine::on_disk(data_dir, id);
    let current = |draft: &mut ExamDraft| {
        let gone = draft.saved.as_ref().is_some_and(|id| !on_disk(id));
        if gone {
            draft.saved = None;
        }
        if draft.saved.is_none() && (draft.rewrite_gone(on_disk) | draft.refresh(&bank) || gone) {
            draft.together = false;
        }
    };
    let draft = ExamDraft::load(store, session)?;
    let mut check = draft.clone();
    current(&mut check);
    // As it was (a first version noted counts: it is kept)
    if check == draft {
        return Ok(draft);
    }
    ExamDraft::update(store, session, |draft| {
        if !proving() {
            current(draft);
        }
        Ok(())
    })
    .map(|(draft, ())| draft)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A conversation that saved an exam deleted since holds a draft again;
    /// the others keep theirs
    #[test]
    fn a_deleted_exam_gives_its_draft_back() {
        let store = Store::open(&std::env::temp_dir().join(format!("ckpro-studio-deleted-{}.db", std::process::id()))).unwrap();
        let (a, b) = (store.studio_new().unwrap(), store.studio_new().unwrap());
        // A question it wrote went with the candidate's questions; one of the packs stays
        let wrote = |id: &str, yaml: Option<&str>| DraftItem::Existing {
            id: id.into(),
            title: id.into(),
            domain: "storage".into(),
            minutes: Some(5),
            status: DraftStatus::Proven,
            disrupts: false,
            version: String::new(),
            written: yaml.map(String::from),
        };
        for (session, saved) in [(a, "mine/custom/gone"), (b, "mine/custom/kept")] {
            ExamDraft {
                title: "Mock".into(),
                saved: Some(saved.into()),
                items: vec![wrote("mine/cka/mine-1", Some("title: Mine\n")), wrote("core/cka/kept", None)],
                ..Default::default()
            }
            .save(&store, session)
            .unwrap();
        }
        exams_deleted(&store, &["mine/custom/gone".into(), "mine/cka".into()], |id| id.starts_with("core/"), |_| false).unwrap();
        let back = ExamDraft::load(&store, a).unwrap();
        assert_eq!(back.saved, None);
        assert!(
            matches!(back.items.as_slice(), [DraftItem::New(q), DraftItem::Existing { .. }] if q.yaml == "title: Mine\n" && q.status == DraftStatus::Linted && q.key == "n1"),
            "{:?}",
            back.items
        );
        assert_eq!(ExamDraft::load(&store, b).unwrap().saved.as_deref(), Some("mine/custom/kept"));
    }

    /// Being proven, a draft is not changed, by the candidate or the assistant
    #[test]
    fn a_draft_being_proven_stays_as_it_is() {
        let store = Store::open(&std::env::temp_dir().join(format!("ckpro-studio-proving-{}.db", std::process::id()))).unwrap();
        let session = store.studio_new().unwrap();
        ExamDraft { title: "Mock".into(), ..Default::default() }.save(&store, session).unwrap();
        let rename = |d: &mut ExamDraft| {
            d.edit(Some("Other"), None, false);
            Ok(())
        };
        let refused = edit(&store, session, || true, rename).unwrap_err();
        assert!(refused.to_string().contains("being proven"), "{refused}");
        assert_eq!(ExamDraft::load(&store, session).unwrap().title, "Mock");
        assert!(edit(&store, session, || false, rename).is_ok());
    }

    /// A saved exam is not changed by edits; a draft that cannot be read is
    /// an error, not taken for an empty one (it would be saved over)
    #[test]
    fn drafts_are_kept_safe() {
        let store = Store::open(&std::env::temp_dir().join(format!("ckpro-studio-safe-{}.db", std::process::id()))).unwrap();
        let session = store.studio_new().unwrap();
        ExamDraft { title: "Mock".into(), saved: Some("mine/custom/mock".into()), ..Default::default() }.save(&store, session).unwrap();
        assert!(
            edit(&store, session, || false, |d| {
                d.edit(Some("Other"), None, false);
                Ok(())
            })
            .is_err()
        );
        assert_eq!(ExamDraft::load(&store, session).unwrap().title, "Mock");
        store.studio_update_draft(session, || Ok(()), |_| Ok(("{not json".to_string(), ()))).unwrap();
        assert!(ExamDraft::load(&store, session).is_err());
        assert!(edit(&store, session, || false, |_| Ok(())).is_err());
        assert_eq!(store.studio_draft(session).unwrap(), "{not json", "left as it was");
    }
}
