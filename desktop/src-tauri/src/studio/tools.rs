//! The tools of a Create conversation, as MCP (served by `ai::mcp_http` at
//! `/studio/<session>`): what the app knows, read-only (the target, how
//! ready the candidate is, attempts and their failed checks, plans, exams
//! and questions), and the draft exam, the only thing Claude changes.
//!
//! Like every assistant tool, off while an exam-mode attempt runs.

use super::draft::ExamDraft;
use crate::error::{AppError, AppResult};
use crate::lab::exam::Exams;
use crate::runtime::activity::now_ms;
use crate::store::Store;
use serde_json::{Value, json};
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Arc;

/// A question file returned to the model, at most
const QUESTION_MAX_BYTES: usize = 24 * 1024;
/// Attempts listed by default, and at most
const ATTEMPTS: usize = 20;
const ATTEMPTS_MAX: usize = 100;

pub struct Tools {
    exams: Arc<Exams>,
    store: Arc<Store>,
    data_dir: PathBuf,
    /// The draft of a conversation changed
    changed: Box<dyn Fn(i32, &ExamDraft) + Send + Sync>,
}

impl Tools {
    pub fn new(exams: Arc<Exams>, store: Arc<Store>, data_dir: PathBuf, changed: impl Fn(i32, &ExamDraft) + Send + Sync + 'static) -> Self {
        Self { exams, store, data_dir, changed: Box::new(changed) }
    }

    /// The reply to an MCP message of conversation `session`
    pub async fn handle(&self, session: i32, message: &Value) -> Option<Value> {
        crate::ai::mcp::answer(message, list(), |name, args| async move { self.call(session, &name, &args) }).await
    }

    fn call(&self, session: i32, name: &str, args: &Value) -> AppResult<String> {
        if self.exams.exam_in_progress() {
            return Err(AppError::invalid("An exam-mode attempt is running in cktry: the assistant is off until it ends."));
        }
        let text = |key: &str| args[key].as_str().unwrap_or_default().to_string();
        match name {
            "get_profile" => self.profile(),
            "list_attempts" => self.attempts(args["limit"].as_u64(), args["certification"].as_str()),
            "get_attempt" => self.attempt(&text("id")),
            "list_exams" => Ok(pretty(&self.exams.catalog().iter().map(|e| json!({
                "id": e.id, "title": e.title, "certification": e.certification, "questions": e.questions,
                "duration_minutes": e.duration_minutes, "custom": e.custom,
            })).collect::<Vec<_>>())),
            "get_exam" => self.exam(&text("id")),
            "list_questions" => self.questions(&text("certification"), args["domain"].as_str()),
            "read_question" => self.read_question(&text("id")),
            "list_plans" => self.plans(&text("from"), &text("to")),
            "get_draft" => Ok(pretty(&ExamDraft::load(&self.store, session)?)),
            "set_exam" => self.edit(session, |draft, bank, _| {
                let minutes = args["duration_minutes"].as_u64().map(|m| m.clamp(10, 300) as u32);
                draft.set_exam(bank, &text("title"), &text("certification"), minutes)?;
                Ok("The draft exam is set.".into())
            }),
            "add_questions" => self.edit(session, |draft, bank, _| {
                let ids: Vec<String> = args["ids"].as_array().into_iter().flatten().filter_map(|v| v.as_str().map(String::from)).collect();
                let refused = draft.add_existing(bank, &ids);
                Ok(if refused.is_empty() { "Added.".into() } else { format!("Added the rest; not added:\n- {}", refused.join("\n- ")) })
            }),
            "propose_question" | "update_question" => self.edit(session, |draft, bank, data_dir| {
                let replacing = (name == "update_question").then(|| text("key"));
                if let Some(key) = &replacing
                    && draft.find_new(key).is_none()
                {
                    return Err(AppError::not_found(format!("no new question '{key}' in the draft")));
                }
                match draft.propose(bank, data_dir, &text("yaml"), replacing.as_deref()) {
                    Ok(key) => Ok(format!("In the draft as {key}: it lints. The candidate proves it on a cluster before the exam is saved.")),
                    Err(problems) => Err(AppError::invalid(format!("Not added; fix and propose it again:\n- {}", problems.join("\n- ")))),
                }
            }),
            "remove_question" => self.edit(session, |draft, _, _| {
                let id = text("id");
                if draft.remove(&id) { Ok("Removed.".into()) } else { Err(AppError::not_found(format!("'{id}' is not in the draft"))) }
            }),
            name => Err(AppError::invalid(format!("no tool named {name}"))),
        }
    }

    /// Change the draft with `f`, keep it and tell the screen
    fn edit(&self, session: i32, f: impl FnOnce(&mut ExamDraft, &crate::lab::load::LoadedPack, &std::path::Path) -> AppResult<String>) -> AppResult<String> {
        let mut draft = ExamDraft::load(&self.store, session)?;
        if draft.saved.is_some() {
            return Err(AppError::invalid("this exam is saved; ask the candidate to start a new conversation for another"));
        }
        let bank = self.exams.bank();
        let result = f(&mut draft, &bank, &self.data_dir)?;
        draft.save(&self.store, session)?;
        (self.changed)(session, &draft);
        Ok(result)
    }

    fn profile(&self) -> AppResult<String> {
        let settings = self.store.settings()?;
        let mut certifications: Vec<String> = self.exams.catalog().into_iter().map(|e| e.certification).collect();
        certifications.sort();
        certifications.dedup();
        let now = now_ms();
        let readiness: Vec<Value> = certifications
            .iter()
            .filter_map(|c| self.exams.readiness(c, now).ok())
            .filter(|r| r.coverage > 0)
            .map(|r| json!({
                "certification": r.certification, "predicted_percent": r.predicted.map(|p| p.round()), "pass_percent": r.pass_score,
                "measured_percent_of_exam": r.coverage, "from_last_days": r.window_days,
                "domains": r.domains.iter().map(|d| json!({
                    "domain": d.domain, "weight": d.weight,
                    "percent": (d.max_points > 0).then(|| (f64::from(d.points) * 100.0 / f64::from(d.max_points)).round()),
                })).collect::<Vec<_>>(),
            }))
            .collect();
        let history = self.exams.history();
        Ok(pretty(&json!({
            "today": day(now),
            "target": settings.target.map(|t| json!({ "certification": t.certification, "exam_day": t.date, "preparing_since": t.started })),
            "readiness": readiness,
            "attempts": history.len(),
            "attempts_with_points": history.iter().filter(|h| h.result.worked()).count(),
        })))
    }

    fn attempts(&self, limit: Option<u64>, certification: Option<&str>) -> AppResult<String> {
        let catalog = self.exams.catalog();
        let limit = limit.map_or(ATTEMPTS, |l| (l as usize).clamp(1, ATTEMPTS_MAX));
        let list: Vec<Value> = self
            .exams
            .history()
            .into_iter()
            .filter(|h| certification.is_none_or(|c| catalog.iter().any(|e| e.id == h.exam_id && e.certification == c)))
            .take(limit)
            .map(|h| json!({
                "id": h.attempt_id, "exam_id": h.exam_id, "exam": h.title, "mode": h.mode, "day": day(h.result.started_at),
                "score": h.result.score.round(), "passed": h.result.passed,
                "ended_before_any_point": !h.result.worked(),
            }))
            .collect();
        Ok(pretty(&list))
    }

    fn attempt(&self, id: &str) -> AppResult<String> {
        let h = self.exams.history().into_iter().find(|h| h.attempt_id == id).ok_or_else(|| AppError::not_found(format!("no attempt '{id}'")))?;
        let mut text = format!("{} ({:?}), {}: {}% ({})\n", h.title, h.mode, day(h.result.started_at), h.result.score.round(), if h.result.passed { "passed" } else { "failed" });
        for q in &h.result.questions {
            let _ = writeln!(text, "\n- {} [{}]: {}/{} points", q.title, q.id, q.points, q.max_points);
            for c in q.checks.iter().filter(|c| !c.passed) {
                let detail: String = c.detail.chars().take(200).collect();
                let _ = writeln!(text, "  - failed: {}{}", c.name, if detail.is_empty() { String::new() } else { format!(" ({detail})") });
            }
        }
        Ok(text)
    }

    fn exam(&self, id: &str) -> AppResult<String> {
        let bank = self.exams.bank();
        let exam = bank.exams.get(id).ok_or_else(|| AppError::not_found(format!("no exam '{id}'")))?;
        let questions: Vec<Value> = exam
            .value
            .questions
            .iter()
            .map(|q| json!({ "id": q, "title": bank.questions.get(q).map(|l| l.value.title.clone()) }))
            .collect();
        Ok(pretty(&json!({
            "id": id, "title": exam.value.title, "certification": exam.value.certification, "questions": questions,
            "drawn_at_random": exam.value.random.as_ref().map(|r| r.count),
        })))
    }

    fn questions(&self, certification: &str, domain: Option<&str>) -> AppResult<String> {
        let bank = self.exams.bank();
        let list: Vec<Value> = bank
            .questions
            .iter()
            .filter_map(|(id, q)| {
                let d = q.value.certifications.get(certification)?;
                (domain.is_none_or(|x| x == d) && q.value.runnable())
                    .then(|| json!({
                        "id": id, "title": q.value.title, "domain": d, "difficulty": q.value.difficulty,
                        "minutes": q.value.estimate.as_ref().and_then(|e| e.seconds()).map(|s| s.div_ceil(60)),
                    }))
            })
            .collect();
        if list.is_empty() && !bank.pack.certifications.contains_key(certification) {
            return Err(AppError::invalid(format!("no certification '{certification}'")));
        }
        Ok(pretty(&list))
    }

    fn read_question(&self, id: &str) -> AppResult<String> {
        let bank = self.exams.bank();
        let q = bank.questions.get(id).ok_or_else(|| AppError::not_found(format!("no question '{id}'")))?;
        let text = std::fs::read_to_string(&q.path).map_err(|e| AppError::io("reading the question", e))?;
        Ok(text.chars().take(QUESTION_MAX_BYTES).collect())
    }

    fn plans(&self, from: &str, to: &str) -> AppResult<String> {
        let plans = self.exams.plans_between(from, to, 0)?;
        Ok(pretty(&plans.iter().map(|p| json!({ "day": p.day, "exam": p.title, "mode": p.mode, "done_score": p.done })).collect::<Vec<_>>()))
    }
}

/// What a Create conversation may use
pub fn list() -> Value {
    let read = json!({ "readOnlyHint": true, "openWorldHint": false });
    let draft = json!({ "readOnlyHint": false, "destructiveHint": false, "openWorldHint": false });
    let none = json!({ "type": "object", "properties": {} });
    let id = |what: &str| json!({ "type": "object", "properties": { "id": { "type": "string", "description": what } }, "required": ["id"] });
    json!([
        { "name": "get_profile", "description": "The candidate: today, their exam target (certification, exam day), how ready they are per certification and domain (from their attempts), how many attempts.", "inputSchema": none, "annotations": read },
        { "name": "list_attempts", "description": "Their attempts, latest first: exam, mode, day, score, passed.", "inputSchema": { "type": "object", "properties": { "limit": { "type": "integer" }, "certification": { "type": "string" } } }, "annotations": read },
        { "name": "get_attempt", "description": "One attempt: each question's points and the checks that failed (what they got wrong).", "inputSchema": id("An attempt id from list_attempts"), "annotations": read },
        { "name": "list_exams", "description": "The exams in cktry: bundled ones and the candidate's own (custom).", "inputSchema": none, "annotations": read },
        { "name": "get_exam", "description": "An exam's questions.", "inputSchema": id("An exam id from list_exams"), "annotations": read },
        { "name": "list_questions", "description": "The questions of a certification (optionally one domain): id, title, domain, difficulty, suggested minutes.", "inputSchema": { "type": "object", "properties": { "certification": { "type": "string" }, "domain": { "type": "string" } }, "required": ["certification"] }, "annotations": read },
        { "name": "read_question", "description": "A question's YAML: its statement, setup, checks and solution.", "inputSchema": id("A question id"), "annotations": read },
        { "name": "list_plans", "description": "The exams they planned on days between two YYYY-MM-DD days (their calendar), and the score when done.", "inputSchema": { "type": "object", "properties": { "from": { "type": "string" }, "to": { "type": "string" } }, "required": ["from", "to"] }, "annotations": read },
        { "name": "get_draft", "description": "The exam being built in this conversation.", "inputSchema": none, "annotations": read },
        { "name": "set_exam", "description": "Set the draft exam's title, certification and length (minutes; else the certification's).", "inputSchema": { "type": "object", "properties": { "title": { "type": "string" }, "certification": { "type": "string" }, "duration_minutes": { "type": "integer" } }, "required": ["title", "certification"] }, "annotations": draft },
        { "name": "add_questions", "description": "Add questions of the packs to the draft, by id.", "inputSchema": { "type": "object", "properties": { "ids": { "type": "array", "items": { "type": "string" } } }, "required": ["ids"] }, "annotations": draft },
        { "name": "propose_question", "description": "Add a new question (its YAML, in the question format) to the draft. It is checked at once; the reply says what to fix.", "inputSchema": { "type": "object", "properties": { "yaml": { "type": "string" } }, "required": ["yaml"] }, "annotations": draft },
        { "name": "update_question", "description": "Replace a new question of the draft (by its key, n1…) with a fixed or changed YAML.", "inputSchema": { "type": "object", "properties": { "key": { "type": "string" }, "yaml": { "type": "string" } }, "required": ["key", "yaml"] }, "annotations": draft },
        { "name": "remove_question", "description": "Take a question out of the draft, by its id or key.", "inputSchema": id("A question id, or a new question's key"), "annotations": draft },
    ])
}

fn pretty(value: &impl serde::Serialize) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}

/// A moment (Unix ms) as YYYY-MM-DD, UTC
fn day(ms: f64) -> String {
    crate::lab::exam::plan::day_of(ms, 0)
}
