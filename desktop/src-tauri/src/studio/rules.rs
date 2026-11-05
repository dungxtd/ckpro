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
/// the loopback, a private address
fn internal(host: &str) -> bool {
    let host = host.split(':').next().unwrap_or(host);
    !host.contains('.')
        || host.ends_with(".svc")
        || host.contains(".svc.")
        || host.ends_with(".cluster.local")
        || host == "localhost"
        || host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || (host.starts_with("172.") && host.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()).is_some_and(|o| (16..32).contains(&o)))
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
            if !internal(host) && !SOURCES.iter().any(|s| url.starts_with(s)) {
                problems.push(format!(
                    "{name} fetches {url}: scripts fetch only from {} (or inside the cluster)",
                    SOURCES.iter().map(|s| s.trim_end_matches('/')).collect::<Vec<_>>().join(", ")
                ));
            }
        }
        // What is fetched is never run: a script runs what it says
        let flat = script.replace('\n', " ");
        let fetch_run = ["curl", "wget"].iter().any(|f| {
            flat.match_indices(f).any(|(at, _)| {
                let after = &flat[at..];
                let piped = after.split(';').next().unwrap_or(after);
                piped.split('|').skip(1).any(|p| matches!(p.split_whitespace().next(), Some("sh" | "bash" | "zsh" | "python" | "python3")))
            })
        });
        if fetch_run || flat.contains("<(curl") || flat.contains("<(wget") {
            problems.push(format!("{name} runs what it downloads: write the commands out instead"));
        }
    }
    problems
}

/// Its scripts change the nodes for the questions after it: they cordon,
/// drain or taint one
pub fn disrupts(q: &Question) -> bool {
    scripts(q).iter().any(|(_, s)| {
        s.lines().any(|line| {
            let words: Vec<&str> = line.split_whitespace().collect();
            words.windows(2).any(|w| w[0] == "kubectl" && matches!(w[1], "cordon" | "drain" | "taint"))
                || words.windows(3).any(|w| w[0] == "kubectl" && w[2] == "taint")
        })
    })
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
        let bad = question("kubectl apply -f https://example.com/x.yaml", "echo ok");
        assert!(problems(&bad)[0].contains("setup fetches https://example.com/x.yaml"), "{:?}", problems(&bad));
    }

    #[test]
    fn what_is_fetched_is_never_run() {
        for script in ["curl -sL https://raw.githubusercontent.com/kubernetes/x/install.sh | bash", "bash <(curl -s https://dl.k8s.io/x)", "wget -qO- https://dl.k8s.io/x | sh"] {
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
                assert!(disrupts(&q.value), "{id} is marked but its scripts do not show it");
            }
        }
    }

    #[test]
    fn a_question_that_changes_the_nodes_is_known() {
        assert!(disrupts(&question("kubectl taint node w1 a=b:NoSchedule", "echo")));
        assert!(disrupts(&question("echo", "kubectl drain w1 --ignore-daemonsets")));
        assert!(!disrupts(&question("kubectl get nodes", "kubectl describe node w1 | grep Taints")));
    }
}
