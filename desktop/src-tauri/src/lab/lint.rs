//! Static checks across a pack, without a cluster: references between files,
//! variables, curriculum domains, and what an exam can draw from the bank.
//! `ckdry lab lint` and the app run this before using a pack.

use super::load::{Finding, Level, LoadedPack, relative};
use super::model::{CheckKind, Question};
use std::collections::BTreeSet;

pub fn lint(pack: &LoadedPack) -> Vec<Finding> {
    let mut findings = Vec::new();
    let mut add = |level, path: &std::path::Path, message: String| {
        findings.push(Finding { level, file: relative(&pack.root, path), message })
    };

    for (id, cert) in &pack.pack.certifications {
        let total: u32 = cert.domains.values().sum();
        if total != 100 {
            add(Level::Warning, &pack.root.join("pack.yaml"), format!("{id}: domain weights add up to {total}, not 100"));
        }
        if cert.duration.seconds().is_none() {
            add(Level::Error, &pack.root.join("pack.yaml"), format!("{id}: bad duration '{}'", cert.duration.0));
        }
        for url in &cert.resources {
            if !url.starts_with("https://") || url.trim_start_matches("https://").split('/').next().is_none_or(str::is_empty) {
                add(Level::Error, &pack.root.join("pack.yaml"), format!("{id}: resource '{url}' is not an https:// URL"));
            }
        }
        if cert.resources.is_empty() {
            add(Level::Warning, &pack.root.join("pack.yaml"), format!("{id}: no resources: the exam browser opens nothing"));
        }
    }

    for (id, q) in &pack.questions {
        let file = &q.path;
        for message in lint_question(pack, &q.value) {
            add(Level::Error, file, format!("{id}: {message}"));
        }
        for unused in unused_vars(&q.value) {
            add(Level::Warning, file, format!("{id}: var '{unused}' is never used"));
        }
    }

    for (id, exam) in &pack.exams {
        let (file, exam) = (&exam.path, &exam.value);
        let Some(cert) = pack.pack.certifications.get(&exam.certification) else {
            add(Level::Error, file, format!("{id}: unknown certification '{}'", exam.certification));
            continue;
        };
        if exam.questions.is_empty() && exam.random.is_none() {
            add(Level::Error, file, format!("{id}: no questions and no random draw"));
        }
        for qid in &exam.questions {
            match pack.questions.get(qid) {
                None => add(Level::Error, file, format!("{id}: unknown question '{qid}'")),
                Some(q) if !q.value.certifications.contains_key(&exam.certification) => add(
                    Level::Warning,
                    file,
                    format!("{id}: question '{qid}' is not tagged for {}", exam.certification),
                ),
                Some(_) => {}
            }
        }
        if let Some(draw) = &exam.random {
            let weights = draw.weights.as_ref().unwrap_or(&cert.domains);
            for domain in weights.keys() {
                if !cert.domains.contains_key(domain) {
                    add(Level::Error, file, format!("{id}: '{domain}' is not a {} domain", exam.certification));
                }
            }
            let available = pack
                .questions
                .iter()
                .filter(|(qid, q)| q.value.certifications.contains_key(&exam.certification) && !exam.questions.contains(qid))
                .count() as u32;
            if available < draw.count {
                add(
                    Level::Warning,
                    file,
                    format!("{id}: draws {} questions but the bank has {available} for {}", draw.count, exam.certification),
                );
            }
        }
        if exam.duration.as_ref().is_some_and(|d| d.seconds().is_none()) {
            add(Level::Error, file, format!("{id}: bad duration"));
        }
    }
    findings
}

fn lint_question(pack: &LoadedPack, q: &Question) -> Vec<String> {
    let mut errors = Vec::new();
    if q.certifications.is_empty() {
        errors.push("lists no certification".into());
    }
    for (cert, domain) in &q.certifications {
        match pack.pack.certifications.get(cert) {
            None => errors.push(format!("unknown certification '{cert}'")),
            Some(c) if !c.domains.contains_key(domain) => {
                errors.push(format!("'{domain}' is not a {cert} domain ({})", c.domains.keys().cloned().collect::<Vec<_>>().join(", ")))
            }
            Some(_) => {}
        }
    }
    let valid_name = q.cluster.starts_with(|c: char| c.is_ascii_lowercase())
        && q.cluster.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid_name {
        errors.push(format!("invalid cluster name '{}'", q.cluster));
    }
    if q.workers > 9 {
        errors.push("at most 9 workers".into());
    }
    if q.estimate.as_ref().is_some_and(|d| d.seconds().is_none()) {
        errors.push("bad estimate".into());
    }
    if q.checks.is_empty() {
        errors.push("has no checks".into());
    }
    for check in &q.checks {
        if check.weight == 0 {
            errors.push(format!("check '{}' has weight 0", check.name));
        }
        let resource = match &check.kind {
            CheckKind::Exists(r) | CheckKind::Ready(r) => Some(&r.resource),
            CheckKind::Jsonpath(j) => {
                if !j.path.starts_with('{') {
                    errors.push(format!("check '{}': JSONPath must look like {{.spec...}}", check.name));
                }
                Some(&j.resource)
            }
            CheckKind::CanI(_) | CheckKind::Run(_) => None,
        };
        if resource.is_some_and(|r| r.split('/').filter(|p| !p.is_empty()).count() != 2) {
            errors.push(format!("check '{}': resource must be kind/name", check.name));
        }
        // A check is a point-in-time probe: grading and verify own the waiting,
        // and a check that polls makes every unsolved question slow to grade
        if let CheckKind::Run(script) = &check.kind
            && script.lines().map(str::trim).any(|l| l.starts_with("sleep ") && !l.starts_with('#'))
        {
            errors.push(format!("check '{}' sleeps: checks must not poll", check.name));
        }
    }
    if q.solution.run.trim().is_empty() {
        errors.push("solution.run is empty".into());
    }
    // Scripts run unattended: anything waiting for a person hangs
    for (what, script) in [("solution.run", Some(&q.solution.run)), ("setup", q.setup.as_ref())] {
        let Some(script) = script else { continue };
        for line in script.lines().map(str::trim).filter(|l| !l.starts_with('#')) {
            if let Some(problem) = interactive(line) {
                errors.push(format!("{what} {problem}: `{line}`"));
            }
        }
    }
    for (name, var) in &q.vars {
        if var.pick.is_empty() {
            errors.push(format!("var '{name}' has nothing to pick"));
        }
    }
    for name in q.vars.keys() {
        if super::render::BUILTINS.contains(&name.as_str()) {
            errors.push(format!("var '{name}' shadows a built-in"));
        }
    }
    for used in placeholders(&texts(q).join("\n")) {
        if !q.vars.contains_key(&used) && !super::render::BUILTINS.contains(&used.as_str()) {
            errors.push(format!("uses undefined var '{{{{{used}}}}}'"));
        }
    }
    errors
}

/// Why a script line needs a person at a keyboard, if it does
fn interactive(line: &str) -> Option<&'static str> {
    let words: Vec<&str> = line.split_whitespace().collect();
    if line.contains("kubectl edit") {
        Some("opens an editor (use kubectl patch, set or apply)")
    } else if words.iter().any(|w| matches!(*w, "-it" | "-ti" | "--tty" | "-t")) && line.contains("kubectl") {
        Some("asks for a terminal (drop -it)")
    } else if words.first().is_some_and(|w| matches!(*w, "vi" | "vim" | "nano" | "less" | "more")) {
        Some("opens an interactive program")
    } else if line.contains('<') && line.split('<').skip(1).any(|rest| {
        let name: String = rest.chars().take_while(|c| *c != '>').collect();
        // <pod-name>, <node-name>; not HTML tags like <body> in a heredoc
        rest.contains('>') && name.contains('-') && name.chars().all(|c| c.is_ascii_lowercase() || c == '-')
    }) {
        Some("contains a placeholder like <pod-name> (compute the value)")
    } else {
        None
    }
}

/// Every text and script that may contain `{{var}}`
fn texts(q: &Question) -> Vec<String> {
    let mut all = vec![q.statement.clone(), q.solution.explain.clone(), q.solution.run.clone()];
    all.extend(q.setup.clone());
    all.extend(q.hints.clone());
    all.extend(q.namespace.clone());
    for check in &q.checks {
        all.push(check.name.clone());
        all.push(serde_json::to_string(&check.kind).unwrap_or_default());
    }
    all
}

fn unused_vars(q: &Question) -> Vec<String> {
    let used = placeholders(&texts(q).join("\n"));
    q.vars.keys().filter(|v| !used.contains(*v)).cloned().collect()
}

fn placeholders(text: &str) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else { break };
        let name = after[..end].trim();
        if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            found.insert(name.to_string());
        }
        rest = &after[end + 2..];
    }
    found
}
