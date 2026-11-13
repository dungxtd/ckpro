//! What the coach is told: the system prompts, a question's first and later
//! turns (the task, the checks, a look at the cluster, what was said), and
//! how a session is named.

use crate::lab::checks::{self, CheckResult};
use crate::lab::exam::CoachSubject;
use crate::runtime::docker;
use crate::store::{CoachMessage, Role};
use std::fmt::Write as _;

/// What a cluster snapshot may add to the prompt
pub(super) const SNAPSHOT_CHARS: usize = 6_000;
/// Earlier turns a new session is given (the oldest are left out)
pub(super) const HISTORY_CHARS: usize = 12_000;

pub(super) const TITLE_SYSTEM: &str = "You name a conversation about an exam task from its first message, like \
a chat app's sidebar. Reply with the title only: 2 to 6 words, plain text, no quotes, no trailing \
period, in the language of the message. Name the topic (\"PVC stuck in Pending\"); when the message \
says little (\"hint?\"), name it after the task (\"Hint: Dynamic PVC\").";

/// A model's title made fit for the session list: one line, no quotes or
/// markup, at most 60 characters; none if nothing is left
pub(super) fn session_title(raw: &str) -> Option<String> {
    let line = raw.lines().map(str::trim).find(|l| !l.is_empty())?;
    let line = line.trim_start_matches(['#', '*', '-', ' ']).trim_start_matches("Title:").trim();
    let line = line.trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | '*' | '“' | '”')).trim_end_matches('.').trim();
    if line.is_empty() {
        return None;
    }
    let mut title: String = line.chars().take(60).collect();
    if line.chars().count() > 60 {
        title = format!("{}…", title.trim_end());
    }
    Some(title)
}

/// A later turn: what changed (the last check, the cluster now) and the question
pub(super) fn followup(checks: &[CheckResult], snapshot: Option<&str>, text: &str) -> String {
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

pub(super) fn system(subject: &CoachSubject, notes: &str) -> String {
    let mut s = String::from(if subject.review { REVIEW } else { PRACTICE });
    let _ = write!(
        s,
        "\nExam: {} (Kubernetes {}).\nAllowed documentation:\n",
        subject.certification, subject.kubernetes
    );
    for url in &subject.docs {
        let _ = writeln!(s, "- {url}");
    }
    // What the app knows of them, from their results: where to lean in
    if !subject.weakest.is_empty() || !subject.unmeasured.is_empty() {
        s.push_str("\nThe candidate's results so far (from ckpro, not a guess):\n");
        if !subject.weakest.is_empty() {
            let weak: Vec<String> =
                subject.weakest.iter().map(|(d, p)| format!("{} {p}%", d.replace('-', " "))).collect();
            let _ = writeln!(s, "- Below the pass line: {}.", weak.join(", "));
        }
        if !subject.unmeasured.is_empty() {
            let _ = writeln!(s, "- Not measured yet: {}.", subject.unmeasured.join(", ").replace('-', " "));
        }
        s.push_str("When it helps, connect your answer to these; do not lecture about them unasked.\n");
    }
    s.push_str(&notes_section(notes));
    s
}

/// Said in the answer where the conversation was compacted: what came
/// before was summarized to make room, so details of it may be gone
pub(super) const COMPACTED: &str =
    "\n\n_Context compacted: the earlier part of this conversation was summarized to make room._\n\n";

/// The candidate's own notes for the assistant (Settings), as a system
/// section: style and language are theirs to set, the rules above still hold
pub(super) fn notes_section(notes: &str) -> String {
    let notes = notes.trim();
    if notes.is_empty() {
        return String::new();
    }
    format!(
        "\nThe candidate's notes for you (follow them for language, tone and how much to say; \
the rules above still hold, such as not giving away a solution they have not opened):\n{notes}\n"
    )
}

/// How the coach helps while the candidate practises
pub(super) const PRACTICE: &str = "You are a Kubernetes certification coach inside ckpro, an exam simulator. \
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
- Be brief: short paragraphs and lists, Markdown. No preamble.\n";

/// What the Agent profile adds: it may run commands, with the candidate's say
pub(super) const AGENT: &str = "Agent mode: you can run commands on the task's host with the `run_command` \
tool (kubectl already points at the task's cluster; nodes are reached with `ssh <node>`), and run \
the task's checks with `check_my_work`. The candidate approves each command and watches it run, so:\n\
- Say in one line what you will run and why, then run it. One step at a time.\n\
- No look at the cluster comes with the question: start from the task and the checks, and look \
yourself (get, describe, logs, events) where they point. Change the cluster only when the candidate \
asked you to fix or solve it.\n\
- After changing anything, verify (`check_my_work`, or a get). Explain what each step did, so they \
can do it themselves next time.\n\
- Never touch ckpro itself (docker, kind) or other tasks' namespaces.\n";

/// How the coach helps once the attempt has its result
pub(super) const REVIEW: &str = "You are a Kubernetes certification coach inside ckpro, an exam simulator. \
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

/// What the coach is told with a question: the task, what the candidate
/// saw (the checks run, a look at the cluster), the conversation so far and
/// the question itself
pub(super) fn prompt(
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
pub(super) fn recent(history: &[CoachMessage], budget: usize) -> &[CoachMessage] {
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
pub(super) async fn snapshot(subject: &CoachSubject) -> Option<String> {
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
pub(super) fn shell_word(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.').collect()
}

pub(super) fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n... (truncated: {} more characters not shown)", &text[..end], text.len() - end)
}
