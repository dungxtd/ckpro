//! The practice coach: help with the current question, the way a tutor would.
//! It reads the question as the candidate sees it, their last "Check my work",
//! the documentation the exam allows and, when checks fail, a read-only look
//! at the cluster; the reference answer only once the candidate opened it.
//! Never during an exam-mode attempt (`Exams::coach_subject` refuses).

mod acp;
pub mod agent;
pub mod generate;

use crate::error::{AppError, AppResult};
use crate::lab::checks::{self, CheckResult};
use crate::lab::exam::{CoachSubject, Exams, StudySubject};
use crate::runtime::docker;
use crate::store::{CoachMessage, Role, Store};
use agent::{Agent, ContextUsage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// The coach's default model; the candidate can switch (`agent::MODELS`)
pub const DEFAULT_MODEL: &str = "sonnet";
/// Writing a question that has to pass on a cluster needs the most capable one
const GENERATOR_MODEL: &str = "opus";
/// What a cluster snapshot may add to the prompt
const SNAPSHOT_CHARS: usize = 6_000;
/// Earlier turns a new session is given (the oldest are left out)
const HISTORY_CHARS: usize = 12_000;
/// Study plans are kept like conversations, under this "attempt"
const STUDY_PLANS: &str = "study-plan";

/// The coach's answer as it is written
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoachEvent {
    Text { text: String },
}

/// Whether the coach can run here
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachStatus {
    pub ready: bool,
    /// What to install when it cannot
    pub problem: Option<String>,
}

/// What goes with a question besides the task (the panel's context chips)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachContext {
    /// The last "Check my work"
    pub checks: bool,
    /// A read-only look at the task's namespace, taken now
    pub cluster: bool,
}

/// An answer and how much of the model's context the conversation uses
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachReply {
    pub text: String,
    pub usage: Option<ContextUsage>,
}

/// A conversation of the attempt (the panel's history)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachThread {
    pub question_id: String,
    /// Its first question
    pub title: String,
    pub messages: u32,
}

/// The practice coach: one ACP session per question's conversation, one
/// answer at a time (a new one stops the one being written)
pub struct Coach {
    agent: Agent,
    running: Mutex<Option<CancellationToken>>,
    /// Open conversations: (attempt, question) → (ACP session, model)
    sessions: tokio::sync::Mutex<HashMap<(String, String), (String, String)>>,
}

impl Coach {
    pub fn new(data_dir: &std::path::Path) -> Self {
        Self { agent: Agent::new(data_dir), running: Mutex::new(None), sessions: Default::default() }
    }

    pub fn status() -> CoachStatus {
        match agent::npx() {
            Some(_) => CoachStatus { ready: true, problem: None },
            None => CoachStatus {
                ready: false,
                problem: Some("Install Node.js (nodejs.org): the assistant runs Claude through npx, signed in with your Claude account".into()),
            },
        }
    }

    pub fn history(exams: &Exams, store: &Store, question_id: &str) -> AppResult<Vec<CoachMessage>> {
        let subject = exams.coach_subject(question_id, false)?;
        store.coach_messages(&subject.attempt_id, question_id)
    }

    /// The attempt's conversations, one per question asked about
    pub fn threads(exams: &Exams, store: &Store) -> AppResult<Vec<CoachThread>> {
        let Some(attempt) = exams.coach_attempt() else { return Ok(Vec::new()) };
        Ok(store
            .coach_threads(&attempt)?
            .into_iter()
            .map(|(question_id, title, messages)| CoachThread { question_id, title, messages })
            .collect())
    }

    /// Answer `text` about the question in its conversation; the answer
    /// streams to `on_event` and is kept with the question once complete.
    #[allow(clippy::too_many_arguments)]
    pub async fn ask(
        &self,
        exams: &Exams,
        store: &Store,
        question_id: &str,
        text: &str,
        checks: &[CheckResult],
        solution_opened: bool,
        model: &str,
        context: CoachContext,
        on_event: impl Fn(CoachEvent) + Sync,
    ) -> AppResult<CoachReply> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AppError::invalid("ask the coach something"));
        }
        let subject = exams.coach_subject(question_id, solution_opened)?;
        let cancel = self.start();
        let checks = if context.checks { checks } else { &[] };
        let snapshot = if context.cluster { snapshot(&subject).await } else { None };
        let key = (subject.attempt_id.clone(), question_id.to_string());
        let open = self.sessions.lock().await.get(&key).cloned();
        let (session, prompt) = match open {
            Some((session, current)) => {
                if current != model {
                    self.agent.set_model(&session, model).await?;
                }
                (session, followup(checks, snapshot.as_deref(), text))
            }
            // A new session (or the app restarted): the task, and what was said before
            None => {
                let session = self.agent.new_session(&system(&subject), model).await?;
                let history = store.coach_messages(&subject.attempt_id, question_id)?;
                (session, prompt(&subject, checks, snapshot.as_deref(), &history, text))
            }
        };
        self.sessions.lock().await.insert(key.clone(), (session.clone(), model.to_string()));
        let answer = self
            .agent
            .prompt(&session, &prompt, &cancel, &|t| on_event(CoachEvent::Text { text: t.to_string() }))
            .await;
        let answer = match answer {
            Ok(a) => a,
            Err(e) => {
                // A session the agent lost is started again next time
                if !matches!(e, AppError::Cancelled { .. }) {
                    self.sessions.lock().await.remove(&key);
                }
                return Err(e);
            }
        };
        store.add_coach_messages(
            &subject.attempt_id,
            question_id,
            &[
                CoachMessage { role: Role::User, text: text.to_string() },
                CoachMessage { role: Role::Assistant, text: answer.text.clone() },
            ],
        )?;
        Ok(CoachReply { text: answer.text, usage: answer.usage })
    }

    /// Start the question's conversation over (the panel's New Thread)
    pub async fn clear(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id, false)?;
        if let Some((session, _)) = self.sessions.lock().await.remove(&(subject.attempt_id.clone(), question_id.to_string())) {
            self.agent.close(&session).await;
        }
        store.clear_coach_messages(&subject.attempt_id, question_id)
    }

    /// A study plan for a certification from the history; it streams to
    /// `on_event` and is kept as the latest plan
    pub async fn study_plan(
        &self,
        exams: &Exams,
        store: &Store,
        certification: &str,
        on_event: impl Fn(CoachEvent) + Sync,
    ) -> AppResult<String> {
        let subject = exams.study_subject(certification)?;
        let cancel = self.start();
        let answer = self
            .agent
            .ask_once(&study_system(&subject), &study_prompt(&subject), DEFAULT_MODEL, &cancel, &|t| {
                on_event(CoachEvent::Text { text: t.to_string() })
            })
            .await?;
        store.add_coach_messages(STUDY_PLANS, certification, &[CoachMessage { role: Role::Assistant, text: answer.clone() }])?;
        Ok(answer)
    }

    /// The latest study plan written for a certification
    pub fn last_study_plan(store: &Store, certification: &str) -> AppResult<Option<String>> {
        Ok(store.coach_messages(STUDY_PLANS, certification)?.pop().map(|m| m.text))
    }

    /// Generate a question and prove it; stopped by `cancel` while the model writes
    pub async fn generate(
        &self,
        exams: &Exams,
        infra: &crate::runtime::infra::Infra,
        activities: &std::sync::Arc<crate::runtime::activity::Activities>,
        data_dir: &std::path::Path,
        request: &generate::GenerateRequest,
    ) -> AppResult<generate::Generated> {
        if exams.exam_in_progress() {
            return Err(AppError::invalid("the coach is not available during an exam"));
        }
        let bank = exams.bank();
        let cancel = self.start();
        let generated = generate::generate(&self.agent, GENERATOR_MODEL, &bank, infra, activities, data_dir, request, &cancel).await?;
        // The catalog shows it from now on
        match crate::lab::load::load(&bank.root).0 {
            Some(core) => exams.replace_pack(crate::lab::mine::merged(core, data_dir)),
            None => tracing::warn!("could not reload the bundled pack: the new question shows after a restart"),
        }
        Ok(generated)
    }

    /// A new answer stops the one being written
    fn start(&self) -> CancellationToken {
        let cancel = CancellationToken::new();
        if let Some(previous) = self.running.lock().unwrap_or_else(|p| p.into_inner()).replace(cancel.clone()) {
            previous.cancel();
        }
        cancel
    }

    pub fn cancel(&self) {
        if let Some(token) = self.running.lock().unwrap_or_else(|p| p.into_inner()).take() {
            token.cancel();
        }
    }
}

/// A later turn: what changed (the last check, the cluster now) and the question
fn followup(checks: &[CheckResult], snapshot: Option<&str>, text: &str) -> String {
    let mut p = String::new();
    if !checks.is_empty() {
        let _ = writeln!(p, "# Their last \"Check my work\"");
        for c in checks {
            let mark = if c.passed { "PASS" } else { "FAIL" };
            let detail = if c.detail.is_empty() { String::new() } else { format!(" ({})", c.detail) };
            let _ = writeln!(p, "- {mark} {}{detail}", c.name);
        }
        p.push('\n');
    }
    if let Some(snapshot) = snapshot {
        let _ = writeln!(p, "# Cluster snapshot (read-only, just taken)\n```\n{snapshot}\n```\n");
    }
    if p.is_empty() {
        text.to_string()
    } else {
        format!("{p}# The candidate asks\n{text}")
    }
}

fn system(subject: &CoachSubject) -> String {
    let mut s = String::from(if subject.review { REVIEW } else { PRACTICE });
    let _ = write!(
        s,
        "\nExam: {} (Kubernetes {}).\nAllowed documentation:\n",
        subject.certification, subject.kubernetes
    );
    for url in &subject.docs {
        let _ = writeln!(s, "- {url}");
    }
    s
}

/// How the coach helps while the candidate practises
const PRACTICE: &str = concat!(
        "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
The candidate is practising one exam task on a real cluster and asks you for help.\n\n\
How to help:\n\
- Teach, do not solve. Give the smallest help that unblocks them: a nudge, the concept, \
or where to look. Give the full commands only if they ask for the solution, or if the \
reference answer is included below (they already opened it).\n\
- They work in a terminal on the exam desktop: `ssh <host>` first, then kubectl. Commands go \
in ```bash blocks, manifests in ```yaml blocks; they copy them with one click.\n\
- Documentation: the exam only allows the sites listed below. Link only pages under them \
(kubernetes.io/docs/... paths you are sure exist). When pointing to docs, also give the \
keywords to type in the kubernetes.io search box, as `Search: <keywords>`: finding the \
page fast is the skill the exam tests.\n\
- When checks fail, explain what the failing check means and what in the cluster snapshot \
shows the cause.\n\
- Be brief: short paragraphs and lists, Markdown. No preamble.\n",
);

/// How the coach helps once the attempt has its result
const REVIEW: &str = "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
The candidate finished an exam and reviews one task with you; the exam is over, so explain fully.\n\n\
How to help:\n\
- Start with what went wrong: each failing check, and what it means. If the cluster snapshot \
is included, point at what in it shows the cause.\n\
- Then the fastest way to solve it on the exam: the steps and the commands (```bash blocks, \
manifests in ```yaml blocks), using the reference answer below.\n\
- Then where it is in the documentation the exam allows (links only under the sites listed \
below, pages you are sure exist) and the keywords to type in the kubernetes.io search box, \
as `Search: <keywords>`.\n\
- End with one takeaway to remember for the exam.\n\
- Be brief: short paragraphs and lists, Markdown. No preamble.\n";

/// A study plan from the candidate's results, against the curriculum
const STUDY: &str = "You are a Kubernetes certification coach inside ckdry, an exam simulator. \
From the candidate's results per curriculum domain, write a short study plan.\n\n\
- Rank the domains to work on by weight in the exam times how much they are missing; say why \
in one line each.\n\
- For each, name 2-3 concrete skills to drill (kubectl commands, objects, troubleshooting \
steps), the documentation pages (links only under the sites listed below, pages you are sure \
exist) and the keywords to type in the kubernetes.io search box, as `Search: <keywords>`.\n\
- Point to practice questions and exams from the lists given, by title.\n\
- End with a plan for the next sessions (what to do, in order) and when to take a full exam \
again. Markdown, brief, no preamble.\n";

fn study_system(subject: &StudySubject) -> String {
    let mut s = String::from(STUDY);
    let _ = write!(s, "\nExam: {} (Kubernetes {}).\nAllowed documentation:\n", subject.stats.title, subject.kubernetes);
    for url in &subject.docs {
        let _ = writeln!(s, "- {url}");
    }
    s
}

fn study_prompt(subject: &StudySubject) -> String {
    let st = &subject.stats;
    let mut p = String::new();
    let scores: Vec<String> = st.scores.iter().map(|s| format!("{s:.0}%")).collect();
    let _ = writeln!(p, "# Results\n{} attempt(s), scores oldest to newest: {}\n", st.scores.len(), scores.join(", "));
    let _ = writeln!(p, "| Domain | Exam weight | Score | Questions answered |\n|---|---|---|---|");
    for d in &st.domains {
        let score = if d.max_points == 0 { "not tested yet".to_string() } else { format!("{:.0}%", f64::from(d.points) * 100.0 / f64::from(d.max_points)) };
        let _ = writeln!(p, "| {} | {}% | {score} | {} |", d.domain, d.weight, d.questions);
    }
    let _ = writeln!(p, "\n# Practice questions in ckdry, by domain");
    for (domain, titles) in &subject.practice {
        let _ = writeln!(p, "- {domain}: {}", titles.join("; "));
    }
    let _ = writeln!(p, "\n# Practice exams in ckdry\n{}", subject.exams.join("; "));
    p
}

fn prompt(
    subject: &CoachSubject,
    checks: &[CheckResult],
    snapshot: Option<&str>,
    history: &[CoachMessage],
    text: &str,
) -> String {
    let q = &subject.view;
    let mut p = String::new();
    let _ = writeln!(p, "# The task\n\n## {}", q.title);
    let _ = writeln!(p, "Solve on: `ssh {}`", q.host);
    if let Some(ns) = &q.namespace {
        let _ = writeln!(p, "Namespace: `{ns}`");
    }
    if let Some(domain) = &subject.domain {
        let _ = writeln!(p, "Curriculum domain: {domain}");
    }
    let _ = writeln!(p, "Weight: {}%\n\n{}\n", q.weight, q.statement.trim());
    if !q.references.is_empty() {
        let _ = writeln!(p, "Task references: {}\n", q.references.join(", "));
    }
    if !q.hints.is_empty() {
        let _ = writeln!(p, "The task's own hints (the candidate may not have opened them):");
        for hint in &q.hints {
            let _ = writeln!(p, "- {hint}");
        }
        p.push('\n');
    }
    if !checks.is_empty() {
        let _ = writeln!(p, "# Their last \"Check my work\"");
        for c in checks {
            let mark = if c.passed { "PASS" } else { "FAIL" };
            let detail = if c.detail.is_empty() { String::new() } else { format!(" ({})", c.detail) };
            let _ = writeln!(p, "- {mark} {}{detail}", c.name);
        }
        p.push('\n');
    }
    if let Some(snapshot) = snapshot {
        let _ = writeln!(p, "# Cluster snapshot (read-only, just taken)\n```\n{snapshot}\n```\n");
    }
    if let Some(solution) = &subject.solution {
        let _ = writeln!(
            p,
            "# Reference answer (the candidate opened it)\n{}\n```bash\n{}\n```\n",
            solution.explain.trim(),
            solution.run.trim()
        );
    }
    let earlier = recent(history, HISTORY_CHARS);
    if !earlier.is_empty() {
        let _ = writeln!(p, "# The conversation so far");
        if earlier.len() < history.len() {
            let _ = writeln!(p, "(earlier messages left out)");
        }
        for m in earlier {
            let who = match m.role {
                Role::User => "Candidate",
                Role::Assistant => "Coach",
            };
            let _ = writeln!(p, "**{who}:** {}\n", m.text.trim());
        }
    }
    let _ = write!(p, "# The candidate asks\n{text}");
    p
}

/// The latest messages that fit in `budget` characters
fn recent(history: &[CoachMessage], budget: usize) -> &[CoachMessage] {
    let mut used = 0;
    let mut start = history.len();
    while start > 0 && used + history[start - 1].text.len() <= budget {
        used += history[start - 1].text.len();
        start -= 1;
    }
    &history[start..]
}

/// What is in the task's namespace (or the cluster) and its recent events,
/// from the jumphost with the task's cluster. Read-only commands only.
async fn snapshot(subject: &CoachSubject) -> Option<String> {
    let script = match &subject.view.namespace {
        Some(ns) => format!(
            "ns={ns}\n\
kubectl get all,pvc,configmap,secret,ingress,networkpolicy,serviceaccount,role,rolebinding -n \"$ns\" -o wide 2>&1 | head -80\n\
echo; echo '# events'; kubectl get events -n \"$ns\" --sort-by=.lastTimestamp 2>&1 | tail -15",
            ns = shell_word(ns)
        ),
        None => "kubectl get nodes -o wide 2>&1\necho; kubectl get pods -A 2>&1 | head -60".to_string(),
    };
    let docker = docker::connect().await.ok()?;
    let (_, output) = checks::run_script(&docker, &subject.jumphost, &subject.cluster, &script, 20).await.ok()?;
    Some(truncate(&output, SNAPSHOT_CHARS))
}

/// A namespace name as one shell word (they are DNS labels; anything else is dropped)
fn shell_word(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.').collect()
}

fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n... (truncated: {} more characters not shown)", &text[..end], text.len() - end)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lab::exam::QuestionView;
    use crate::lab::model::Solution;

    fn subject(solution: Option<Solution>) -> CoachSubject {
        CoachSubject {
            attempt_id: "a".into(),
            certification: "Certified Kubernetes Administrator".into(),
            kubernetes: "1.35".into(),
            domain: Some("storage".into()),
            docs: vec!["https://kubernetes.io/docs/".into()],
            review: false,
            solution,
            cluster: "k8s".into(),
            jumphost: "j".into(),
            view: QuestionView {
                id: "q1".into(),
                title: "PVC and Pod".into(),
                cluster: "k8s".into(),
                host: "k8s".into(),
                namespace: Some("storage-task".into()),
                tags: vec![],
                weight: 5.0,
                statement: "Create a PVC named `data-pvc`.".into(),
                hints: vec!["storageClassName".into()],
                references: vec![],
            },
        }
    }

    #[test]
    fn the_prompt_has_the_task_checks_and_conversation_but_no_unopened_solution() {
        let hidden = subject(None);
        let checks = [CheckResult { name: "PVC bound".into(), weight: 2, passed: false, detail: "Pending".into() }];
        let history = [
            CoachMessage { role: Role::User, text: "hint?".into() },
            CoachMessage { role: Role::Assistant, text: "Look at the class.".into() },
        ];
        let p = prompt(&hidden, &checks, Some("pvc/data-pvc Pending"), &history, "why?");
        for part in ["`ssh k8s`", "`storage-task`", "data-pvc", "FAIL PVC bound (Pending)", "pvc/data-pvc Pending", "**Coach:** Look at the class.", "why?"] {
            assert!(p.contains(part), "missing {part}:\n{p}");
        }
        assert!(!p.contains("Reference answer"));
        let opened = subject(Some(Solution { explain: "Use standard.".into(), run: "kubectl apply -f pvc.yaml".into() }));
        assert!(prompt(&opened, &[], None, &[], "show me").contains("kubectl apply -f pvc.yaml"));
        assert!(system(&hidden).contains("- https://kubernetes.io/docs/") && system(&hidden).contains("Teach, do not solve"));
        let review = CoachSubject { review: true, ..subject(None) };
        assert!(system(&review).contains("the exam is over"));
    }

    /// The real model through Claude Code, on a canned task: it streams and
    /// answers the way the coach should (needs `claude`, signed in)
    #[tokio::test]
    #[ignore]
    async fn claude_coaches_a_failing_check() {
        let subject = subject(None);
        let checks = [CheckResult { name: "PVC data-pvc is Bound".into(), weight: 2, passed: false, detail: "phase is Pending".into() }];
        let snapshot = "NAME                             STATUS    VOLUME   CAPACITY   STORAGECLASS\npersistentvolumeclaim/data-pvc   Pending                       standrad\n# events\nWarning ProvisioningFailed persistentvolumeclaim/data-pvc storageclass.storage.k8s.io \"standrad\" not found";
        let prompt = prompt(&subject, &checks, Some(snapshot), &[], "Why do my checks fail? Point me to the cause, not the full solution.");
        let chunks = std::sync::atomic::AtomicUsize::new(0);
        let agent = Agent::new(&std::env::temp_dir().join("ckdry-coach-test"));
        let answer = agent
            .ask_once(&system(&subject), &prompt, DEFAULT_MODEL, &CancellationToken::new(), &|_| {
                chunks.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })
            .await
            .unwrap();
        println!("--- {} chunks ---\n{answer}", chunks.into_inner());
        assert!(answer.to_lowercase().contains("standrad") || answer.to_lowercase().contains("storageclass"));
    }

    #[test]
    fn the_study_plan_prompt_has_the_scores_per_domain_and_what_to_practise() {
        use crate::lab::exam::{DomainStat, StudyStats};
        let subject = StudySubject {
            stats: StudyStats {
                certification: "cka".into(),
                title: "Certified Kubernetes Administrator".into(),
                scores: vec![48.0, 61.0],
                domains: vec![
                    DomainStat { domain: "troubleshooting".into(), weight: 30, points: 3, max_points: 10, questions: 2 },
                    DomainStat { domain: "storage".into(), weight: 10, points: 0, max_points: 0, questions: 0 },
                ],
            },
            kubernetes: "1.35".into(),
            docs: vec!["https://kubernetes.io/docs/".into()],
            practice: [("storage".to_string(), vec!["PVC and Pod".to_string()])].into(),
            exams: vec!["CKA Practice Exam 1".into()],
        };
        let p = study_prompt(&subject);
        for part in ["48%, 61%", "| troubleshooting | 30% | 30% | 2 |", "| storage | 10% | not tested yet | 0 |", "- storage: PVC and Pod", "CKA Practice Exam 1"] {
            assert!(p.contains(part), "missing {part}:\n{p}");
        }
        assert!(study_system(&subject).contains("- https://kubernetes.io/docs/"));
    }

    /// The real model writes a study plan from canned results (needs `claude`)
    #[tokio::test]
    #[ignore]
    async fn claude_writes_a_study_plan() {
        use crate::lab::exam::{DomainStat, StudyStats};
        let d = |domain: &str, weight, points, max_points, questions| DomainStat { domain: domain.into(), weight, points, max_points, questions };
        let subject = StudySubject {
            stats: StudyStats {
                certification: "cka".into(),
                title: "Certified Kubernetes Administrator".into(),
                scores: vec![48.0, 61.0],
                domains: vec![d("troubleshooting", 30, 3, 10, 2), d("cluster-architecture", 25, 9, 12, 3), d("services-networking", 20, 5, 10, 2), d("storage", 10, 0, 0, 0)],
            },
            kubernetes: "1.35".into(),
            docs: vec!["https://kubernetes.io/docs/".into(), "https://helm.sh/docs/".into()],
            practice: [("troubleshooting".to_string(), vec!["Fix a crashing Deployment".to_string()]), ("storage".to_string(), vec!["PVC and Pod".to_string()])].into(),
            exams: vec!["CKA Practice Exam 1".into()],
        };
        let agent = Agent::new(&std::env::temp_dir().join("ckdry-coach-test"));
        let plan = agent.ask_once(&study_system(&subject), &study_prompt(&subject), DEFAULT_MODEL, &CancellationToken::new(), &|_| {}).await.unwrap();
        println!("{plan}");
        assert!(plan.to_lowercase().contains("troubleshooting"));
    }

    #[test]
    fn a_later_turn_sends_only_what_changed() {
        assert_eq!(followup(&[], None, "why?"), "why?");
        let checks = [CheckResult { name: "PVC bound".into(), weight: 2, passed: true, detail: String::new() }];
        let p = followup(&checks, Some("pvc Bound"), "and now?");
        assert!(p.contains("- PASS PVC bound") && p.contains("pvc Bound") && p.ends_with("# The candidate asks\nand now?"), "{p}");
    }

    #[test]
    fn long_history_and_snapshots_are_cut_and_say_so() {
        let msg = |n: usize| CoachMessage { role: Role::User, text: "x".repeat(n) };
        let history = [msg(10), msg(10), msg(10)];
        assert_eq!(recent(&history, 25).len(), 2);
        assert!(truncate(&"y".repeat(50), 20).ends_with("(truncated: 30 more characters not shown)"));
        assert_eq!(shell_word("storage-task; rm -rf /"), "storage-taskrm-rf");
    }
}
