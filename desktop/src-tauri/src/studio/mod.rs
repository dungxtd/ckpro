//! Create with Claude: exams built in a chat, proven whole on a verify
//! cluster made ahead (`workspace`), then saved to the candidate's pack. The conversation itself is the coach's (`ai::studio`).

pub mod draft;
pub mod tools;
pub mod workspace;

use crate::error::{AppError, AppResult};
use crate::lab::exam::Exams;
use crate::lab::load::Loaded;
use crate::lab::mine;
use crate::lab::model::Question;
use crate::runtime::activity::Activities;
use crate::runtime::infra::Infra;
use crate::store::Store;
use draft::{DraftItem, DraftStatus, ExamDraft};
use std::path::Path;
use std::sync::Arc;
use workspace::Workspace;

/// The id a new question has while it is proven: under the candidate's
/// pack, by its key
fn proving_id(certification: &str, key: &str) -> String {
    format!("{}/{certification}/draft-{key}", mine::PACK_ID)
}

/// Prove the exam on a cluster (the candidate's go: its scripts run there),
/// its questions together and in order as in an exam: every setup first,
/// then each check must fail before its solution and pass after. On the
/// made cluster, or one as big as its questions need. Their results, in the
/// draft returned; none if the exam changed meanwhile (that one is not proven)
#[allow(clippy::too_many_arguments)]
pub async fn verify(
    store: &Store,
    exams: &Exams,
    workspace: &Arc<Workspace>,
    activities: &Arc<Activities>,
    infra: Arc<Infra>,
    data_dir: &Path,
    session: i32,
    fits: impl Fn(u32) -> Result<(), String>,
) -> AppResult<ExamDraft> {
    let draft = ExamDraft::load(store, session)?;
    if draft.saved.is_some() || draft.items.is_empty() || draft.proven() {
        return Ok(draft);
    }
    let bank = exams.bank();
    // The new questions under the candidate's pack, the others as they are
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
    let mut staging = crate::ai::generate::staging_of(&bank, data_dir, new);
    for (id, _) in &ids {
        if let Some(q) = bank.questions.get(id) {
            staging.questions.insert(id.clone(), Loaded { path: q.path.clone(), value: q.value.clone() });
        }
    }
    let workers = staging.questions.values().map(|q| q.value.workers).max().unwrap_or(workspace::WORKERS);

    let n = ids.len();
    let mut steps = vec![format!("Run its {n} question{} on the cluster", if n == 1 { "" } else { "s" })];
    if workers > workspace::WORKERS {
        steps.insert(0, format!("Make a cluster with {workers} workers"));
    }
    let op = activities.begin("Prove the exam".to_string(), steps);
    let handle = activities.handle(op.id());
    let log = move |line: String| handle.log(line);
    op.step(0, None);
    let run = match workspace.run_for(workers, infra, fits, &log).await {
        Ok(run) => run,
        Err(e) => return op.end(Err(e)),
    };
    if workers > workspace::WORKERS {
        op.step(1, None);
    }
    let order: Vec<String> = ids.iter().map(|(id, _)| id.clone()).collect();
    let reports = run.check(&staging, &order, &log).await;
    // Their setups and solutions changed it
    tauri::async_runtime::spawn(async move { run.finish(&|line| tracing::info!("{line}")).await });
    let reports = op.end(reports)?;

    // The conversation went on meanwhile: the results are of the exam proven
    let mut now = ExamDraft::load(store, session)?;
    if now.items != draft.items {
        return Err(AppError::invalid("the exam changed while it was proven: prove it again"));
    }
    for report in reports {
        let Some((_, key)) = ids.iter().find(|(id, _)| *id == report.question) else { continue };
        if let Some(status) = now.status_mut(key) {
            *status = if report.ok { DraftStatus::Proven } else { DraftStatus::Failed { problems: report.problems } };
        }
    }
    now.save(store, session)?;
    Ok(now)
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
