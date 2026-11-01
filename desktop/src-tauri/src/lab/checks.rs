//! Grading. Every check runs on the jumphost with a kubeconfig scoped to the
//! question's cluster, so grading never changes the candidate's current
//! context. Declarative checks explain their failure ("expected X, got Y").

use crate::runtime::exec::quote;
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
    run_script_tail(docker, jumphost, cluster, script, timeout_secs, None).await
}

/// `run_script`, keeping only the last `max` bytes of output when set
pub async fn run_script_tail(
    docker: &Docker,
    jumphost: &str,
    cluster: &str,
    script: &str,
    timeout_secs: u32,
    max: Option<usize>,
) -> AppResult<(i64, String)> {
    let wrapped = format!("{}\n{script}", scoped_kubeconfig(cluster));
    let timeout = timeout_secs.to_string();
    let out = exec::run_tail(
        docker,
        jumphost,
        &["timeout", "--kill-after=10", &timeout, "bash", "-c", &wrapped],
        &["EDITOR=false", "KUBE_EDITOR=false", "VISUAL=false"],
        None,
        max,
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
/// `on_done` gets each one's index and result as it finishes (grading progress).
pub async fn run_checks<'a>(
    docker: &Docker,
    jumphost: &str,
    checks: impl IntoIterator<Item = (&'a str, &'a Check)>,
    on_done: impl Fn(usize, &CheckResult),
) -> AppResult<Vec<CheckResult>> {
    use futures_util::{StreamExt, TryStreamExt};
    // Futures built up front: a closure inside the stream would make it
    // non-Send for spawned tasks (rust-lang/rust#64552)
    let on_done = &on_done;
    let runs: Vec<_> = checks
        .into_iter()
        .enumerate()
        .map(|(index, (cluster, check))| checked(docker, jumphost, cluster, check, index, on_done))
        .collect();
    futures_util::stream::iter(runs).buffered(CHECK_CONCURRENCY).try_collect().await
}

async fn checked(
    docker: &Docker,
    jumphost: &str,
    cluster: &str,
    check: &Check,
    index: usize,
    on_done: &impl Fn(usize, &CheckResult),
) -> AppResult<CheckResult> {
    let result = run_check(docker, jumphost, cluster, check).await?;
    on_done(index, &result);
    Ok(result)
}

/// A private kubeconfig whose current context is `cluster`, for this script only.
fn scoped_kubeconfig(cluster: &str) -> String {
    let missing = quote(&format!("cluster {cluster} is not in the kubeconfig"));
    let cluster = quote(cluster);
    format!(
        "set -o pipefail\n\
         __kc=$(mktemp)\n\
         kubectl config view --raw --minify --context {cluster} > \"$__kc\" || {{ echo {missing}; exit 1; }}\n\
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
        format!("if {get}; then echo {}; exit 1; fi", quote(&format!("{} still exists{where_}", r.resource)))
    } else {
        format!("{get} || {{ echo {}; exit 1; }}", quote(&format!("{} not found{where_}", r.resource)))
    }
}

fn ready(r: &ResourceRef) -> String {
    let kind = r.resource.split('/').next().unwrap_or_default().to_lowercase();
    let target = format!("{}{}", quote(&r.resource), ns(&r.namespace));
    if matches!(kind.as_str(), "pod" | "pods" | "po") {
        format!(
            "kubectl wait --for=condition=Ready {target} --timeout=10s >/dev/null 2>&1 || {{ echo {}; exit 1; }}",
            quote(&format!("{} is not Ready", r.resource))
        )
    } else {
        // Every replica updated and available. A Deployment's Available
        // condition only means minimum availability (maxUnavailable)
        format!(
            "kubectl rollout status {target} --timeout=10s >/dev/null 2>&1 || {{ echo {}; exit 1; }}",
            quote(&format!("{} does not have all replicas updated and available", r.resource))
        )
    }
}

fn jsonpath(j: &JsonpathCheck) -> String {
    let get = format!(
        "actual=$(kubectl get {}{} -o jsonpath={} 2>/dev/null) || {{ echo {}; exit 1; }}",
        quote(&j.resource),
        ns(&j.namespace),
        quote(&j.path),
        quote(&format!("{} not found", j.resource))
    );
    // The message is literal text around the value found: nothing in the
    // path or the expected value runs
    let failed = |expected: String| format!("echo {}\"$actual\"\\'; exit 1", quote(&format!("{}: {expected}, got '", j.path)));
    let test = match &j.expect {
        Expectation::Equals(v) => {
            format!("[ \"$actual\" = {} ] || {{ {}; }}", quote(v), failed(format!("expected '{v}'")))
        }
        Expectation::Contains(v) => {
            format!("case \"$actual\" in *{}*) ;; *) {};; esac", quote(v), failed(format!("expected to contain '{v}'")))
        }
        Expectation::Matches(v) => format!(
            "printf '%s' \"$actual\" | grep -Eq {} || {{ {}; }}",
            quote(v),
            failed(format!("expected to match /{v}/"))
        ),
    };
    format!("{get}\n{test}")
}

fn can_i(c: &CanICheck) -> String {
    let expected = if c.expect { "yes" } else { "no" };
    format!(
        "answer=$(kubectl auth can-i {} {}{} --as={} 2>/dev/null)\n\
         [ \"$answer\" = {expected} ] || {{ echo {}\"${{answer:-no answer}}\"; exit 1; }}",
        quote(&c.verb),
        quote(&c.resource),
        ns(&c.namespace),
        quote(&c.as_user),
        quote(&format!(
            "{} {} {}{}: expected {expected}, got ",
            c.as_user,
            c.verb,
            c.resource,
            c.namespace.as_ref().map(|n| format!(" in {n}")).unwrap_or_default()
        )),
    )
}


#[cfg(test)]
mod tests {
    use super::*;

    /// The script with a stand-in kubectl that prints `value`
    fn run(script: &str, value: &str) -> (bool, String) {
        let dir = std::env::temp_dir().join(format!("ckdry-checks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let kubectl = dir.join("kubectl");
        std::fs::write(&kubectl, format!("#!/bin/sh\nprintf '%s' {}\n", quote(value))).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&kubectl, std::fs::Permissions::from_mode(0o755)).unwrap();
        let out = std::process::Command::new("bash")
            .args(["-c", script])
            .env("PATH", format!("{}:/usr/bin:/bin", dir.display()))
            .output()
            .unwrap();
        (out.status.success(), String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    #[test]
    fn messages_are_text_never_code() {
        let check = |expect| JsonpathCheck {
            resource: "deploy/web".into(),
            namespace: Some("team-$(touch /tmp/ckdry-pwned)".into()),
            path: "{.metadata.labels.`id`}".into(),
            expect,
        };
        let (passed, said) = run(&jsonpath(&check(Expectation::Equals("$(id)".into()))), "$(id)");
        assert!(passed, "{said}");
        let (passed, said) = run(&jsonpath(&check(Expectation::Equals("a'b".into()))), "x$(id)");
        assert!(!passed);
        assert_eq!(said, "{.metadata.labels.`id`}: expected 'a'b', got 'x$(id)'");
        let (_, said) = run(&jsonpath(&check(Expectation::Contains("\"q\"".into()))), "v");
        assert_eq!(said, "{.metadata.labels.`id`}: expected to contain '\"q\"', got 'v'");
        assert!(!std::path::Path::new("/tmp/ckdry-pwned").exists());
    }
}
