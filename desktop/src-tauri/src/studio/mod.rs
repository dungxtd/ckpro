//! Create with Claude: exams built in a chat, their new questions proven on
//! a verify cluster made ahead (`workspace`), then saved to the candidate's
//! pack. The conversation itself is the coach's (`ai::studio`).

pub mod draft;
pub mod tools;
pub mod workspace;

use crate::error::{AppError, AppResult};
use crate::lab::exam::Exams;
use crate::lab::mine;
use crate::lab::model::Question;
use crate::runtime::activity::Activities;
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

/// Prove the draft's new questions not proven yet on the workspace's cluster
/// (the candidate's go: their scripts run there): each check must fail
/// before its solution and pass after. Their results, in the draft returned
pub async fn verify(
    store: &Store,
    exams: &Exams,
    workspace: &Arc<Workspace>,
    activities: &Arc<Activities>,
    data_dir: &Path,
    session: i32,
    take: impl FnOnce() -> Option<Arc<crate::lab::verify::Run>>,
) -> AppResult<ExamDraft> {
    let mut draft = ExamDraft::load(store, session)?;
    let bank = exams.bank();
    let mut questions = Vec::new();
    for q in draft.new_questions().filter(|q| q.status != DraftStatus::Proven) {
        let question: Question = serde_saphyr::from_str(&q.yaml).map_err(|e| AppError::invalid(format!("{}: {e}", q.key)))?;
        let id = proving_id(&draft.certification, &q.key);
        questions.push((id.clone(), data_dir.join("runs").join(format!("{id}.yaml")), question));
    }
    if questions.is_empty() {
        return Ok(draft);
    }
    let Some(run) = take() else {
        return Err(AppError::invalid(match workspace.state() {
            workspace::WorkspaceState::Preparing => "the verify cluster is still being made".to_string(),
            workspace::WorkspaceState::Failed { reason } => reason,
            _ => "there is no verify cluster: prepare one first".to_string(),
        }));
    };
    let ids: Vec<String> = questions.iter().map(|(id, ..)| id.clone()).collect();
    let staging = crate::ai::generate::staging_of(&bank, data_dir, questions);
    let op = activities.begin(format!("Prove {} new question{}", ids.len(), if ids.len() == 1 { "" } else { "s" }), vec!["Run them on the cluster".into()]);
    op.step(0, None);
    let handle = activities.handle(op.id());
    let log = move |line: String| handle.log(line);
    let reports = run.check(&staging, &ids, &log).await;
    // Their setups and solutions changed it: a fresh one is being made
    tauri::async_runtime::spawn(async move { run.finish(&|line| tracing::info!("{line}")).await });
    let reports = op.end(reports)?;
    for report in reports {
        let key = report.question.rsplit("draft-").next().unwrap_or_default().to_string();
        if let Some(q) = draft.find_new(&key) {
            q.status = if report.ok { DraftStatus::Proven } else { DraftStatus::Failed { problems: report.problems } };
        }
    }
    draft.save(store, session)?;
    Ok(draft)
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
    if let Some(q) = draft.new_questions().find(|q| q.status != DraftStatus::Proven) {
        return Err(AppError::invalid(format!("prove the new questions first: {} is not proven", q.title)));
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
