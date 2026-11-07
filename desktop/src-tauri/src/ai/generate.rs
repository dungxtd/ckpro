//! The question generator: the model writes a question in the pack format,
//! cktry proves it, and only a proven one is kept ("My questions"). Proven
//! means what `cktry lab verify` checks for the bundled pack: it lints, and on
//! a cluster of its own every check fails before the solution and passes
//! after it. What fails goes back to the model, a few times at most. Before
//! a cluster runs the model's scripts, the candidate reads the question and
//! lets it run, or discards it.

use super::agent::Agent;
use crate::error::{AppError, AppResult};
use crate::lab::load::{Loaded, LoadedPack};
use crate::lab::model::{Difficulty, Question};
use crate::lab::{lint, mine, verify};
use crate::runtime::activity::Activities;
use crate::runtime::infra::Infra;
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Model attempts before giving up
const ATTEMPTS: usize = 3;

/// What to generate
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct GenerateRequest {
    /// A certification of the pack (`cka`, `ckad`, `cks`)
    pub certification: String,
    /// One of its curriculum domains
    pub domain: String,
    pub difficulty: Difficulty,
    /// What it should be about, in the candidate's words (may be empty)
    pub topic: String,
}

/// A question that was proven and kept
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Generated {
    pub id: String,
    pub title: String,
    /// The exam of the candidate's questions for the certification
    pub exam_id: String,
}

/// A question the model wrote that lints, for the candidate to read before
/// its scripts run on a cluster
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Draft {
    pub title: String,
    /// The whole question as the pack keeps it: task, setup, solution, checks
    pub yaml: String,
}

/// Generate a question for `bank` and keep it once proven (the caller reloads
/// the bank to show it). `review` gets each draft that lints; its answer
/// says whether the scripts may run (no, or none: it is discarded)
#[allow(clippy::too_many_arguments)]
pub async fn generate(
    agent: &Agent,
    model: &str,
    bank: &LoadedPack,
    infra: &Infra,
    activities: &Arc<Activities>,
    data_dir: &Path,
    request: &GenerateRequest,
    cancel: &CancellationToken,
    review: impl Fn(Draft) -> tokio::sync::oneshot::Receiver<bool>,
) -> AppResult<Generated> {
    let cert = bank
        .pack
        .certifications
        .get(&request.certification)
        .ok_or_else(|| AppError::not_found(format!("certification {}", request.certification)))?
        .clone();
    if !cert.domains.contains_key(&request.domain) {
        return Err(AppError::invalid(format!("{} is not a {} domain", request.domain, request.certification)));
    }
    let op = activities.begin(
        format!("Generate a {} question ({})", request.certification.to_uppercase(), request.domain),
        vec![
            "Write the question".into(),
            "Check the format (lint)".into(),
            "Your review".into(),
            "Prove it on a cluster (verify)".into(),
            "Save to My questions".into(),
        ],
    );
    let system = system(bank, request);
    let mut feedback: Vec<String> = Vec::new();
    let result = async {
        for attempt in 1..=ATTEMPTS {
            op.step(0, Some(format!("attempt {attempt} of {ATTEMPTS}")));
            let answer = agent.ask_once(&system, &prompt(request, &feedback), model, cancel, &|_| {}).await?;
            let yaml = yaml_of(&answer);

            op.step(1, None);
            let question: Question = match serde_saphyr::from_str(&yaml) {
                Ok(q) => q,
                Err(e) => {
                    op.log(format!("not valid question YAML: {e}"));
                    feedback.push(format!("Your YAML did not parse as a question: {e}. Write it again, valid against the schema."));
                    continue;
                }
            };
            if question.certifications.get(&request.certification) != Some(&request.domain) {
                feedback.push(format!(
                    "`certifications` must map `{}` to `{}`.",
                    request.certification, request.domain
                ));
                continue;
            }
            let (id, path) = mine::new_question(data_dir, &request.certification, &question.title);
            let staging = staging(bank, data_dir, &id, &path, question.clone());
            let errors = lint::errors_in(&staging, &path);
            if !errors.is_empty() {
                op.log(format!("lint: {}", errors.join("; ")));
                feedback.push(format!("`cktry lab lint` found errors:\n- {}", errors.join("\n- ")));
                continue;
            }

            op.step(2, Some(format!("“{}”: read it, then let it run or discard it", question.title)));
            let answer = review(Draft { title: question.title.clone(), yaml: yaml.clone() });
            let approved = tokio::select! {
                approved = answer => approved.unwrap_or(false),
                _ = cancel.cancelled() => false,
            };
            if !approved {
                return Err(AppError::Cancelled { message: "you discarded the question".into() });
            }

            op.step(3, Some(format!("“{}” on a new cluster", question.title)));
            let log = |line: String| op.log(line);
            let reports = verify::verify(&staging, &[id.clone()], data_dir, infra, false, &log).await?;
            let Some(report) = reports.into_iter().next() else {
                return Err(AppError::assistant("verify returned no report"));
            };
            if !report.ok {
                op.log(format!("verify: {}", report.problems.join("; ")));
                feedback.push(verify_feedback(&report));
                continue;
            }

            op.step(4, None);
            // The model's schema line points nowhere from here
            let body: String = yaml.lines().filter(|l| !l.starts_with("# yaml-language-server")).map(|l| format!("{l}\n")).collect();
            let header = format!("# Generated by the cktry coach ({model}) and proven by `cktry lab verify`\n");
            let exam_id = mine::save(data_dir, &request.certification, &cert.title, &path, &format!("{header}{body}"))?;
            op.log(format!("✓ saved as {id}"));
            return Ok(Generated { id, title: question.title, exam_id });
        }
        Err(AppError::assistant(format!(
            "no question passed in {ATTEMPTS} attempts; the last problem: {}",
            feedback.last().map(String::as_str).unwrap_or("unknown")
        )))
    }
    .await;
    op.end(result)
}

/// A pack of just the new question, with the bundled certifications, to lint
/// and verify it alone
fn staging(bank: &LoadedPack, data_dir: &Path, id: &str, path: &Path, question: Question) -> LoadedPack {
    mine::staging(bank, data_dir, [(id.to_string(), path.to_path_buf(), question)])
}

/// What a question is and the rules it is proven against (enforced on a
/// cluster), for whoever writes one: the generator, Create with Claude
pub(crate) const RULES: &str = "A question is a task on a real kind cluster: `setup` (bash, run once \
before the exam) prepares the starting state, `checks` (bash, each exits 0 when that part is solved) \
grade it, and `solution.run` (bash) solves it.\n\n\
Rules, all enforced by running it on a cluster:\n\
- Every check must FAIL right after setup and PASS after `solution.run`. A check that passes before \
the solution is a broken question.\n\
- Scripts run on a jumphost with kubectl (and helm, yq, etcdctl) already pointed at the task's \
cluster; nodes are reachable with `ssh <node>`. No interactive commands (no `kubectl edit`, no \
`-it`). `solution.run` must wait for what it creates (`kubectl wait --for=condition=...`, \
`kubectl rollout status --timeout=...`) so the checks see it ready. Each script has a 120 s limit.\n\
- Use the task's own namespace (`namespace:`), created by setup if the task needs it to exist; \
setup starts with a clean slate (`kubectl delete ... --ignore-not-found`).\n\
- Images: small public ones with pinned tags (nginx:1.27, busybox:1.36, redis:7.4, httpd:2.4).\n\
- The statement is what the candidate reads, like the real exam: precise names, namespaces and \
values; Markdown with `code` for names. Add 1-3 `hints` and `solution.explain` (why, plus the docs \
page). `references`: kubernetes.io/docs pages only.\n";

/// The question format's JSON schema, as text
pub(crate) fn question_schema() -> String {
    crate::lab::schemas()
        .into_iter()
        .find(|(name, _)| *name == "question.schema.json")
        .map(|(_, s)| serde_json::to_string(&s).unwrap_or_default())
        .unwrap_or_default()
}

fn system(bank: &LoadedPack, request: &GenerateRequest) -> String {
    let mut s = format!(
        "You write exam tasks for cktry, a Kubernetes certification simulator, in its question format \
(YAML, the JSON schema below). {RULES}\
- Leave out `cluster` and `workers` unless the task needs more than one worker node.\n\n\
Answer with the question YAML only, in one ```yaml block.\n\n"
    );
    let _ = writeln!(s, "JSON schema of a question:\n```json\n{}\n```\n", question_schema());
    // Two real questions of the domain, as the house style
    let mut examples: Vec<&Loaded<Question>> = bank
        .questions
        .values()
        .filter(|q| q.value.runnable() && q.value.certifications.get(&request.certification) == Some(&request.domain))
        .collect();
    if examples.len() < 2 {
        examples = bank.questions.values().filter(|q| q.value.certifications.contains_key(&request.certification)).collect();
    }
    examples.sort_by_key(|q| std::fs::metadata(&q.path).map(|m| m.len()).unwrap_or(u64::MAX));
    for example in examples.iter().take(2) {
        if let Ok(text) = std::fs::read_to_string(&example.path) {
            let _ = writeln!(s, "An existing question:\n```yaml\n{}\n```\n", text.trim());
        }
    }
    s
}

fn prompt(request: &GenerateRequest, feedback: &[String]) -> String {
    let mut p = format!(
        "Write one new {} question.\nCertification: {} (`certifications: {{{}: {}}}`)\nDifficulty: {:?}\n",
        request.certification.to_uppercase(),
        request.certification,
        request.certification,
        request.domain,
        request.difficulty
    );
    if !request.topic.trim().is_empty() {
        let _ = writeln!(p, "Topic: {}", request.topic.trim());
    }
    if !feedback.is_empty() {
        let _ = writeln!(p, "\nYour earlier attempts failed. Fix these and write the whole question again:");
        for (i, f) in feedback.iter().enumerate() {
            let _ = writeln!(p, "\nAttempt {}:\n{f}", i + 1);
        }
    }
    p
}

fn verify_feedback(report: &verify::Report) -> String {
    let mut f = String::from("Running it on a cluster (`cktry lab verify`) failed:\n");
    for problem in &report.problems {
        let _ = writeln!(f, "- {problem}");
    }
    let show = |f: &mut String, label: &str, checks: &[crate::lab::checks::CheckResult]| {
        if !checks.is_empty() {
            let _ = writeln!(f, "{label}:");
            for c in checks {
                let _ = writeln!(f, "  - {} {}: {}", if c.passed { "PASS" } else { "FAIL" }, c.name, c.detail);
            }
        }
    };
    show(&mut f, "Checks before the solution", &report.before);
    show(&mut f, "Checks after the solution", &report.after);
    f
}

/// The YAML in the model's answer: its ```yaml block, up to the block's last
/// fence (the question's own Markdown has fences too), or all of it
fn yaml_of(answer: &str) -> String {
    let start = answer.find("```yaml").map(|i| i + 7).or_else(|| answer.find("```yml").map(|i| i + 6));
    let fenced = start.and_then(|start| {
        let rest = &answer[start..];
        rest.rfind("\n```").map(|end| &rest[..end])
    });
    format!("{}\n", fenced.unwrap_or(answer).trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_yaml_out_of_the_answer() {
        assert_eq!(yaml_of("Here:\n```yaml\ntitle: x\n```\nDone"), "title: x\n");
        assert_eq!(yaml_of("title: y"), "title: y\n");
        // Fences inside the question (Markdown in explain) are part of it
        let answer = "```yaml\nsolution:\n  explain: |\n    ```bash\n    kubectl get pvc\n    ```\n  run: kubectl apply -f x\n```\n";
        assert!(yaml_of(answer).ends_with("  run: kubectl apply -f x\n"), "{}", yaml_of(answer));
    }

    #[test]
    fn feedback_names_what_failed_on_the_cluster() {
        let check = |name: &str, passed| crate::lab::checks::CheckResult { name: name.into(), weight: 1, passed, detail: "why".into() };
        let report = verify::Report {
            question: "mine/cka/x".into(),
            ok: false,
            problems: vec!["check 'Pod runs' passes before the solution".into()],
            before: vec![check("Pod runs", true)],
            after: vec![check("Pod runs", true)],
        };
        let f = verify_feedback(&report);
        assert!(f.contains("passes before the solution") && f.contains("PASS Pod runs: why"), "{f}");
    }
}
