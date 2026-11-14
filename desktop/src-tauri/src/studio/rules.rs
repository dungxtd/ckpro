//! The script rules a question written in Create follows, checked as it is
//! proposed (beside lint), by the code here and nothing else: its scripts
//! fetch only from the sources the bundled packs use, never run what they
//! download, and one that changes the nodes says so. Its scripts run in a
//! throwaway cluster and task host either way; these keep them to what an
//! exam task does, so no one has to read them (and spoil the question) to
//! let them run.

use crate::lab::model::Question;

/// Where a script may fetch from: what the bundled packs fetch (charts,
/// manifests of Kubernetes projects), by the start of the URL
const SOURCES: &[&str] = &[
    "https://charts.bitnami.com/",
    "https://github.com/kubernetes/",
    "https://github.com/kubernetes-sigs/",
    "https://raw.githubusercontent.com/kubernetes/",
    "https://raw.githubusercontent.com/kubernetes-sigs/",
    "https://kubernetes.github.io/",
    "https://kubernetes-sigs.github.io/",
    "https://dl.k8s.io/",
];

/// The sources, for whoever writes a question (the prompt)
pub fn sources() -> String {
    SOURCES.iter().map(|s| s.trim_end_matches('/')).collect::<Vec<_>>().join(", ")
}

/// What a question is and the rules it is proven against (enforced on a
/// cluster), for whoever writes one: Create with Claude
pub const RULES: &str = "A question is a task on a real kind cluster: `setup` (bash, run once \
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
pub fn question_schema() -> String {
    crate::lab::schemas()
        .into_iter()
        .find(|(name, _)| *name == "question.schema.json")
        .map(|(_, s)| serde_json::to_string(&s).unwrap_or_default())
        .unwrap_or_default()
}

/// Every script of the question, named
fn scripts(q: &Question) -> Vec<(String, &str)> {
    let mut all = Vec::new();
    if let Some(setup) = &q.setup {
        all.push(("setup".to_string(), setup.as_str()));
    }
    for check in &q.checks {
        if let crate::lab::model::CheckKind::Run(run) = &check.kind {
            all.push((format!("check \"{}\"", check.name), run.as_str()));
        }
    }
    all.push(("solution".to_string(), q.solution.run.as_str()));
    all
}

/// A URL's host is inside the cluster or the task host: a Service, a Pod,
/// the loopback, a private address. `script` says where a variable comes
/// from: one read from the cluster (`VAR=$(kubectl ...)`) is the cluster's
fn internal(host: &str, script: &str) -> bool {
    // `user@host`: the host is after the `@`
    let host = host.rsplit('@').next().unwrap_or(host);
    // An IPv6 address: the loopback only
    if host.starts_with('[') {
        return host.starts_with("[::1]");
    }
    let host = host.split(':').next().unwrap_or(host);
    // A built-in the app fills in: a node of the cluster (`{{control_plane}}`)
    if host.starts_with("{{") {
        return true;
    }
    if let Some(var) = host.strip_prefix('$') {
        let var = var.trim_start_matches('{').trim_end_matches('}');
        return [format!("{var}=$(kubectl "), format!("{var}=\"$(kubectl ")].iter().any(|a| script.contains(a.as_str()));
    }
    // Without a dot, a name is a Service or a host of the exam's network; a
    // number is an address written as one (134744072 is 8.8.8.8)
    let name = host.starts_with(|c: char| c.is_ascii_alphabetic()) && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    (!host.contains('.') && name)
        || host.ends_with(".svc")
        || host.contains(".svc.")
        || host.ends_with(".cluster.local")
        || host == "localhost"
        || host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || (host.starts_with("172.") && host.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()).is_some_and(|o| (16..32).contains(&o)))
}

/// Whether `url` leaves the path it starts with (`..`, an encoded dot or
/// slash): a source's prefix says nothing then
fn escapes(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("/../") || lower.ends_with("/..") || lower.contains("%2e") || lower.contains("%2f")
}

/// The files a script downloads: what follows `-o`, `-O` or `--output`, and
/// each URL's last segment (`curl -O`, `wget` with no name)
fn downloads(script: &str) -> Vec<&str> {
    let words: Vec<&str> = script.split_whitespace().collect();
    // `-o` alone or last of short flags run together (`-sLo file`)
    let names_a_file = |w: &str| w == "--output" || (w.starts_with('-') && !w.starts_with("--") && w.ends_with(['o', 'O']));
    let named = words.windows(2).filter(|w| names_a_file(w[0])).map(|w| w[1].trim_matches(['"', '\'']));
    let urls = urls(script).filter_map(|u| u.split(['?', '#']).next()?.rsplit('/').next());
    named.chain(urls).filter(|n| !n.is_empty() && *n != "-" && !n.starts_with("http")).collect()
}

/// The URLs in a script
fn urls(script: &str) -> impl Iterator<Item = &str> {
    script.match_indices("http").filter_map(move |(at, _)| {
        let rest = &script[at..];
        if !(rest.starts_with("http://") || rest.starts_with("https://")) {
            return None;
        }
        let end = rest.find(|c: char| c.is_whitespace() || "\"'`)<>|;".contains(c)).unwrap_or(rest.len());
        Some(&rest[..end])
    })
}

/// What breaks the rules, each a line to fix it by
pub fn problems(q: &Question) -> Vec<String> {
    let mut problems = Vec::new();
    for (name, script) in scripts(q) {
        for url in urls(script) {
            let host = url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or("");
            if !internal(host, script) && (escapes(url) || !SOURCES.iter().any(|s| url.starts_with(s))) {
                problems.push(format!("{name} fetches {url}: scripts fetch only from {} (or inside the cluster)", sources()));
            }
        }
        // What is fetched is never run: a script runs what it says
        let flat = script.replace('\n', " ");
        let fetch_run = ["curl", "wget"].iter().any(|f| {
            flat.match_indices(f).any(|(at, _)| {
                let after = &flat[at..];
                let piped = after.split(';').next().unwrap_or(after);
                piped.split('|').skip(1).any(|p| {
                    // The program piped into, past `sudo`/`env` and its path
                    let program = p.split_whitespace().find(|w| !matches!(*w, "sudo" | "env" | "-E") && !w.contains('='));
                    matches!(
                        program.map(|w| w.rsplit('/').next().unwrap_or(w)),
                        Some("sh" | "bash" | "zsh" | "dash" | "python" | "python3" | "perl" | "ruby")
                    )
                })
            })
        });
        // Nor saved and run after: as a script, a program, sourced
        let runs = |file: &str| {
            let base = file.rsplit('/').next().unwrap_or(file);
            ["sh ", "bash ", "zsh ", "dash ", "python ", "python3 ", "perl ", "source ", ". ", "exec ", "chmod +x "]
                .iter()
                .any(|run| flat.contains(&format!("{run}{file}")) || flat.contains(&format!("{run}./{base}")))
                || flat.contains(&format!("./{base} "))
                || flat.ends_with(&format!("./{base}"))
        };
        let saved_run = ["curl", "wget"].iter().any(|f| flat.contains(f)) && downloads(&flat).iter().any(|d| runs(d));
        if fetch_run || saved_run || flat.contains("<(curl") || flat.contains("<(wget") {
            problems.push(format!("{name} runs what it downloads: write the commands out instead"));
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    fn question(setup: &str, solution: &str) -> Question {
        let yaml = format!(
            "title: T\ncertifications:\n  cka: storage\nstatement: S\nsetup: |\n{}\nchecks:\n  - name: C\n    weight: 1\n    run: kubectl get ns x\nsolution:\n  run: |\n{}\n  explain: E\n",
            setup.lines().map(|l| format!("  {l}")).collect::<Vec<_>>().join("\n"),
            solution.lines().map(|l| format!("    {l}")).collect::<Vec<_>>().join("\n"),
        );
        serde_saphyr::from_str(&yaml).unwrap()
    }

    #[test]
    fn scripts_fetch_from_the_packs_sources_only() {
        let ok = question(
            "kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml\nhelm repo add bitnami https://charts.bitnami.com/bitnami",
            "curl -s http://web-svc.dns-debug.svc.cluster.local\ncurl http://localhost:8080/healthz",
        );
        assert!(problems(&ok).is_empty(), "{:?}", problems(&ok));
        let sneaky = question("kubectl apply -f http://10.0.0.1@example.com/x.yaml", "echo ok");
        assert!(!problems(&sneaky).is_empty(), "a user part is not the host");
        let bad = question("kubectl apply -f https://example.com/x.yaml", "echo ok");
        assert!(problems(&bad)[0].contains("setup fetches https://example.com/x.yaml"), "{:?}", problems(&bad));
    }

    /// Addresses written as numbers, IPv6, a path that climbs out of a
    /// source, a host in a variable set by hand: not the cluster's, nor a
    /// source
    #[test]
    fn a_url_cannot_dress_up_as_the_cluster_or_a_source() {
        for setup in [
            "curl -s http://134744072/x",
            "curl -s http://0x08080808/x",
            "curl -s http://[2001:db8::1]/x",
            "curl -sL https://github.com/kubernetes/../evil/x/raw/main/a.yaml",
            "curl -sL https://github.com/kubernetes/%2e%2e/evil/a.yaml",
            "H=evil.example; curl -s http://$H/x",
        ] {
            assert!(!problems(&question(setup, "kubectl get ns")).is_empty(), "{setup}");
        }
        for setup in [
            "curl -s http://web-svc/",
            "curl -s http://[::1]:8080/",
            "IP=$(kubectl get svc k -o jsonpath='{.spec.clusterIP}'); curl -sk https://$IP:443/",
        ] {
            assert!(problems(&question(setup, "kubectl get ns")).is_empty(), "{setup}");
        }
    }

    #[test]
    fn what_is_saved_then_run_is_refused() {
        for setup in [
            "curl -sLo /tmp/i.sh https://github.com/kubernetes/x/raw/main/i.sh; bash /tmp/i.sh",
            "curl -sLO https://dl.k8s.io/release/v1.35.0/bin/linux/amd64/kubectl && chmod +x kubectl",
            "wget -q https://github.com/kubernetes/x/raw/main/run.sh && sh run.sh",
            "curl -sL https://github.com/kubernetes/x/raw/main/s -o s; ./s",
        ] {
            assert!(problems(&question(setup, "kubectl get ns")).iter().any(|p| p.contains("runs what it downloads")), "{setup}");
        }
        // Saved and only read: fine
        let applied = "curl -sLo /tmp/m.yaml https://raw.githubusercontent.com/kubernetes/x/main/m.yaml; kubectl apply -f /tmp/m.yaml";
        assert!(problems(&question(applied, "kubectl get ns")).is_empty());
    }

    #[test]
    fn what_is_fetched_is_never_run() {
        for script in [
            "curl -sL https://raw.githubusercontent.com/kubernetes/x/install.sh | bash",
            "bash <(curl -s https://dl.k8s.io/x)",
            "wget -qO- https://dl.k8s.io/x | sh",
            "curl -s https://dl.k8s.io/x | /bin/bash",
            "curl -s https://dl.k8s.io/x | sudo -E bash",
            "curl -s https://dl.k8s.io/x | env X=1 sh",
        ] {
            let q = question("echo set", script);
            assert!(problems(&q).iter().any(|p| p.contains("runs what it downloads")), "{script}");
        }
        assert!(problems(&question("echo set", "curl -s http://web-svc | grep ok")).is_empty());
    }

    /// The packs' own questions keep the rules (the sources are theirs), and
    /// those marked as changing the nodes are found so by their scripts
    #[test]
    fn the_packs_keep_the_rules() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        let pack = crate::lab::load::load(&root).0.expect("the core pack loads");
        for (id, q) in &pack.questions {
            assert!(problems(&q.value).is_empty(), "{id}: {:?}", problems(&q.value));
            if q.value.disrupts {
                assert!(q.value.scripts_change_the_nodes(), "{id} is marked but its scripts do not show it");
            }
        }
    }

    #[test]
    fn a_question_that_changes_the_nodes_is_known() {
        assert!(question("kubectl taint node w1 a=b:NoSchedule", "echo").scripts_change_the_nodes());
        assert!(question("echo", "kubectl drain w1 --ignore-daemonsets").scripts_change_the_nodes());
        assert!(!question("kubectl get nodes", "kubectl describe node w1 | grep Taints").scripts_change_the_nodes());
    }
}
