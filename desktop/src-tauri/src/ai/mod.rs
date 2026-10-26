//! The practice coach: help with the current question, the way a tutor would.
//! It reads the question as the candidate sees it, their last "Check my work",
//! the documentation the exam allows and, when checks fail, a read-only look
//! at the cluster; the reference answer only once the candidate opened it.
//! Never during an exam-mode attempt (`Exams::coach_subject` refuses).

mod claude;

use crate::error::{AppError, AppResult};
use crate::lab::checks::{self, CheckResult};
use crate::lab::exam::{CoachSubject, Exams};
use crate::runtime::docker;
use crate::store::{CoachMessage, Role, Store};
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// Fast enough to chat; the coach answers from the question it is given
const MODEL: &str = "sonnet";
/// What a cluster snapshot may add to the prompt
const SNAPSHOT_CHARS: usize = 6_000;
/// Earlier turns kept in the prompt (the oldest are left out)
const HISTORY_CHARS: usize = 12_000;

/// The coach's answer as it is written
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoachEvent {
    Text { text: String },
}

/// Whether the coach can run here
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachStatus {
    /// Where `claude` is, if installed
    pub claude: Option<String>,
}

/// One question at a time; a new question stops the one before
#[derive(Default)]
pub struct Coach {
    running: Mutex<Option<CancellationToken>>,
}

impl Coach {
    pub fn status() -> CoachStatus {
        CoachStatus { claude: claude::binary().map(|p| p.display().to_string()) }
    }

    pub fn history(exams: &Exams, store: &Store, question_id: &str) -> AppResult<Vec<CoachMessage>> {
        let subject = exams.coach_subject(question_id, false)?;
        store.coach_messages(&subject.attempt_id, question_id)
    }

    /// Answer `text` about the question; the answer streams to `on_event`
    /// and is kept with the question once complete.
    pub async fn ask(
        &self,
        exams: &Exams,
        store: &Store,
        question_id: &str,
        text: &str,
        checks: &[CheckResult],
        solution_opened: bool,
        on_event: impl Fn(CoachEvent) + Sync,
    ) -> AppResult<String> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AppError::invalid("ask the coach something"));
        }
        let subject = exams.coach_subject(question_id, solution_opened)?;
        let cancel = CancellationToken::new();
        if let Some(previous) = self.running.lock().unwrap_or_else(|p| p.into_inner()).replace(cancel.clone()) {
            previous.cancel();
        }
        let history = store.coach_messages(&subject.attempt_id, question_id)?;
        // A look at the cluster only when something fails: it is what "why"
        // needs, and it costs a few seconds
        let snapshot = if checks.iter().any(|c| !c.passed) { snapshot(&subject).await } else { None };
        let prompt = prompt(&subject, checks, snapshot.as_deref(), &history, text);
        let answer = claude::ask(&system(&subject), &prompt, MODEL, &cancel, &|t| {
            on_event(CoachEvent::Text { text: t.to_string() })
        })
        .await;
        let answer = answer?;
        store.add_coach_messages(
            &subject.attempt_id,
            question_id,
            &[
                CoachMessage { role: Role::User, text: text.to_string() },
                CoachMessage { role: Role::Assistant, text: answer.clone() },
            ],
        )?;
        Ok(answer)
    }

    pub fn cancel(&self) {
        if let Some(token) = self.running.lock().unwrap_or_else(|p| p.into_inner()).take() {
            token.cancel();
        }
    }
}

fn system(subject: &CoachSubject) -> String {
    let mut s = String::from(
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
        assert!(system(&hidden).contains("- https://kubernetes.io/docs/"));
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
        let answer = claude::ask(&system(&subject), &prompt, MODEL, &CancellationToken::new(), &|_| {
            chunks.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        })
        .await
        .unwrap();
        println!("--- {} chunks ---\n{answer}", chunks.into_inner());
        assert!(answer.to_lowercase().contains("standrad") || answer.to_lowercase().contains("storageclass"));
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
