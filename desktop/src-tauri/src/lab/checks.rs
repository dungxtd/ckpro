//! Grading. Every check runs on the jumphost with a kubeconfig scoped to the
//! question's cluster, so grading never changes the candidate's current
//! context. Declarative checks explain their failure ("expected X, got Y").

use super::model::{CanICheck, Check, CheckKind, Expectation, JsonpathCheck, ResourceRef};
use crate::error::AppResult;
use crate::runtime::exec;
use bollard::Docker;
use serde::Serialize;

#[derive(Clone, Debug, Serialize, serde::Deserialize, specta::Type)]
pub struct CheckResult {
    pub name: String,
    pub weight: u32,
    pub passed: bool,
    /// Why it failed (or the script's last line)
    pub detail: String,
}

/// Longest a setup or solution script may run
pub const SCRIPT_TIMEOUT_SECS: u32 = 300;
/// Longest one check may run
pub const CHECK_TIMEOUT_SECS: u32 = 120;

/// Run a script on the jumphost against `cluster`; (exit code, output).
///
/// - Passed as an argument, not on stdin: commands that read stdin (`ssh node
///   ...`) would otherwise swallow the rest of the script.
/// - Killed after `timeout_secs` (exit 124) and no editor: a script must never
///   hang an exam or a verify run (`kubectl edit`, waits without a timeout).
pub async fn run_script(
    docker: &Docker,
    jumphost: &str,
    cluster: &str,
    script: &str,
    timeout_secs: u32,
) -> AppResult<(i64, String)> {
    let wrapped = format!("{}\n{script}", scoped_kubeconfig(cluster));
    let timeout = timeout_secs.to_string();
    let out = exec::run(
        docker,
        jumphost,
        &["timeout", "--kill-after=10", &timeout, "bash", "-c", &wrapped],
        &["EDITOR=false", "KUBE_EDITOR=false", "VISUAL=false"],
        None,
    )
    .await?;
    let text = if out.exit_code == 124 {
        format!("{}\ntimed out after {timeout_secs}s", out.text)
    } else {
        out.text
    };
    Ok((out.exit_code, text))
}

pub async fn run_check(docker: &Docker, jumphost: &str, cluster: &str, check: &Check) -> AppResult<CheckResult> {
    let (exit, output) = run_script(docker, jumphost, cluster, &script(&check.kind), CHECK_TIMEOUT_SECS).await?;
    let last_line = output.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
    Ok(CheckResult {
        name: check.name.clone(),
        weight: check.weight,
        passed: exit == 0,
        detail: if exit == 0 { String::new() } else { last_line },
    })
}

/// Checks running at once: they only read, each with its own kubeconfig, so
/// grading takes as long as the slowest few rather than the sum of all
const CHECK_CONCURRENCY: usize = 8;

/// Run `(cluster, check)` pairs concurrently; results in input order.
/// `on_done` is called as each one finishes (grading progress).
pub async fn run_checks<'a>(
    docker: &Docker,
    jumphost: &str,
    checks: impl IntoIterator<Item = (&'a str, &'a Check)>,
    on_done: impl Fn(),
) -> AppResult<Vec<CheckResult>> {
    use futures_util::{StreamExt, TryStreamExt};
    // Futures built up front: a closure inside the stream would make it
    // non-Send for spawned tasks (rust-lang/rust#64552)
    let on_done = &on_done;
    let runs: Vec<_> = checks.into_iter().map(|(cluster, check)| checked(docker, jumphost, cluster, check, on_done)).collect();
    futures_util::stream::iter(runs).buffered(CHECK_CONCURRENCY).try_collect().await
}

async fn checked(
    docker: &Docker,
    jumphost: &str,
    cluster: &str,
    check: &Check,
    on_done: &impl Fn(),
) -> AppResult<CheckResult> {
    let result = run_check(docker, jumphost, cluster, check).await;
    on_done();
    result
}

/// A private kubeconfig whose current context is `cluster`, for this script only.
fn scoped_kubeconfig(cluster: &str) -> String {
    format!(
        "set -o pipefail\n\
         __kc=$(mktemp)\n\
         kubectl config view --raw --minify --context {cluster} > \"$__kc\" || {{ echo \"cluster {cluster} is not in the kubeconfig\"; exit 1; }}\n\
         export KUBECONFIG=\"$__kc\"\n\
         trap 'rm -f \"$__kc\"' EXIT\n"
    )
}

/// The shell script that decides a check: exit 0 passes, the last output
/// line explains a failure.
fn script(kind: &CheckKind) -> String {
    match kind {
        CheckKind::Run(script) => script.clone(),
        CheckKind::Exists(r) => exists(r),
        CheckKind::Ready(r) => ready(r),
        CheckKind::Jsonpath(j) => jsonpath(j),
        CheckKind::CanI(c) => can_i(c),
    }
}

fn ns(namespace: &Option<String>) -> String {
    namespace.as_ref().map(|n| format!(" -n {}", quote(n))).unwrap_or_default()
}

fn exists(r: &ResourceRef) -> String {
    let get = format!("kubectl get {}{} -o name >/dev/null 2>&1", quote(&r.resource), ns(&r.namespace));
    let where_ = r.namespace.as_ref().map(|n| format!(" in {n}")).unwrap_or_default();
    if r.absent {
        format!("if {get}; then echo '{} still exists{where_}'; exit 1; fi", r.resource)
    } else {
        format!("{get} || {{ echo '{} not found{where_}'; exit 1; }}", r.resource)
    }
}

fn ready(r: &ResourceRef) -> String {
    let kind = r.resource.split('/').next().unwrap_or_default().to_lowercase();
    let condition = match kind.as_str() {
        "pod" | "pods" | "po" => "Ready",
        "deployment" | "deployments" | "deploy" => "Available",
        _ => "",
    };
    let target = format!("{}{}", quote(&r.resource), ns(&r.namespace));
    if condition.is_empty() {
        format!("kubectl rollout status {target} --timeout=10s >/dev/null 2>&1 || {{ echo '{} is not ready'; exit 1; }}", r.resource)
    } else {
        format!(
            "kubectl wait --for=condition={condition} {target} --timeout=10s >/dev/null 2>&1 || {{ echo '{} is not {condition}'; exit 1; }}",
            r.resource
        )
    }
}

fn jsonpath(j: &JsonpathCheck) -> String {
    let get = format!(
        "actual=$(kubectl get {}{} -o jsonpath={} 2>/dev/null) || {{ echo '{} not found'; exit 1; }}",
        quote(&j.resource),
        ns(&j.namespace),
        quote(&j.path),
        j.resource
    );
    let test = match &j.expect {
        Expectation::Equals(v) => format!(
            "[ \"$actual\" = {} ] || {{ echo \"{}: expected '{}', got '$actual'\"; exit 1; }}",
            quote(v), j.path, v.replace('"', "\\\"")
        ),
        Expectation::Contains(v) => format!(
            "case \"$actual\" in *{}*) ;; *) echo \"{}: expected to contain '{}', got '$actual'\"; exit 1;; esac",
            quote(v), j.path, v.replace('"', "\\\"")
        ),
        Expectation::Matches(v) => format!(
            "printf '%s' \"$actual\" | grep -Eq {} || {{ echo \"{}: expected to match /{}/, got '$actual'\"; exit 1; }}",
            quote(v), j.path, v.replace('"', "\\\"")
        ),
    };
    format!("{get}\n{test}")
}

fn can_i(c: &CanICheck) -> String {
    let expected = if c.expect { "yes" } else { "no" };
    format!(
        "answer=$(kubectl auth can-i {} {}{} --as={} 2>/dev/null)\n\
         [ \"$answer\" = {expected} ] || {{ echo \"{} {} {}{}: expected {expected}, got ${{answer:-no answer}}\"; exit 1; }}",
        quote(&c.verb),
        quote(&c.resource),
        ns(&c.namespace),
        quote(&c.as_user),
        c.as_user,
        c.verb,
        c.resource,
        c.namespace.as_ref().map(|n| format!(" in {n}")).unwrap_or_default(),
    )
}

/// Single-quote for the shell
fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
