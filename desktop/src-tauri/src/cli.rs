//! `ckdry <command>`: the same binary as the app, run headless. Used by lab
//! authors, CI and AI agents (Claude Code) to check their work.

use crate::lab::{lint, load, verify};
use crate::runtime::infra::Infra;
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = "ckdry", version, about = "ckdry: Kubernetes exam practice")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Work with lab packs
    Lab {
        #[command(subcommand)]
        command: LabCommand,
    },
    /// Write the JSON Schemas of pack files into a directory
    Schema {
        #[arg(default_value = "schema")]
        out: PathBuf,
    },
}

#[derive(Subcommand)]
enum LabCommand {
    /// Check a pack without a cluster: schema, references, variables, domains
    Lint {
        /// Pack directory (contains pack.yaml)
        #[arg(default_value = ".")]
        pack: PathBuf,
        /// Machine-readable findings
        #[arg(long)]
        json: bool,
    },
    /// Prove questions grade correctly on real clusters: every check fails
    /// before the solution and passes after it
    Verify {
        /// Pack directory (contains pack.yaml)
        pack: PathBuf,
        /// Verify the fixed questions of an exam (repeatable), e.g. cka-003
        #[arg(long = "exam")]
        exams: Vec<String>,
        /// Verify a question (repeatable), e.g. cka/rbac-ci-token
        #[arg(long = "question")]
        questions: Vec<String>,
        /// Keep the clusters and jumphost of each run for inspection
        #[arg(long)]
        keep: bool,
        /// Runs at once: each --exam is a run, --question ones form one run.
        /// Each run needs about 2 GB of Docker memory: lower it on small machines.
        #[arg(long, default_value_t = 4)]
        parallel: usize,
        /// Machine-readable report
        #[arg(long)]
        json: bool,
    },
}

/// Subcommands handled headless; anything else starts the app.
pub fn is_cli(args: &[String]) -> bool {
    matches!(
        args.get(1).map(String::as_str),
        Some("lab" | "schema" | "help" | "--help" | "-h" | "--version" | "-V")
    )
}

pub fn main() -> ExitCode {
    match Cli::parse().command {
        Command::Lab { command: LabCommand::Lint { pack, json } } => lint_pack(&pack, json),
        Command::Lab { command: LabCommand::Verify { pack, exams, questions, keep, parallel, json } } => {
            verify_pack(&pack, &exams, &questions, keep, parallel.max(1), json)
        }
        Command::Schema { out } => write_schemas(&out),
    }
}

fn lint_pack(root: &PathBuf, json: bool) -> ExitCode {
    let (pack, mut findings) = load::load(root);
    if let Some(pack) = &pack {
        findings.extend(lint::lint(pack));
    }
    let errors = findings.iter().filter(|f| f.level == load::Level::Error).count();
    if json {
        println!("{}", serde_json::to_string_pretty(&findings).unwrap_or_default());
    } else {
        for f in &findings {
            let level = if f.level == load::Level::Error { "error" } else { "warning" };
            println!("{level}: {}: {}", f.file, f.message);
        }
        if let Some(pack) = &pack {
            println!(
                "{}: {} questions, {} exams, {errors} errors, {} warnings",
                pack.pack.id,
                pack.questions.len(),
                pack.exams.len(),
                findings.len() - errors
            );
        }
    }
    if errors == 0 { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

fn verify_pack(root: &PathBuf, exams: &[String], questions: &[String], keep: bool, parallel: usize, json: bool) -> ExitCode {
    let (pack, mut findings) = load::load(root);
    let Some(pack) = pack else {
        return lint_pack(root, false);
    };
    findings.extend(lint::lint(&pack));
    if findings.iter().any(|f| f.level == load::Level::Error) {
        eprintln!("the pack has lint errors; run `ckdry lab lint` first");
        return ExitCode::FAILURE;
    }
    // Ids may omit the pack prefix
    let prefix = format!("{}/", pack.pack.id);
    let full = |id: &String| if id.starts_with(&prefix) { id.clone() } else { format!("{prefix}{id}") };

    // One isolated run per exam, plus one for loose questions
    let mut runs: Vec<(String, Vec<String>)> = Vec::new();
    for exam in exams {
        match pack.exams.get(&full(exam)) {
            Some(e) => runs.push((full(exam), e.value.questions.clone())),
            None => {
                eprintln!("error: no exam '{exam}'");
                return ExitCode::FAILURE;
            }
        }
    }
    if !questions.is_empty() {
        runs.push(("questions".into(), questions.iter().map(full).collect()));
    }
    if runs.is_empty() {
        eprintln!("error: choose what to verify with --exam or --question");
        return ExitCode::FAILURE;
    }
    // Questions needing what ckdry cannot offer yet are skipped, not failed
    for (label, ids) in &mut runs {
        ids.retain(|id| match pack.questions.get(id) {
            Some(q) if !q.value.runnable() => {
                println!("{label}: skipped {id} (needs {:?})", q.value.requires);
                false
            }
            _ => true,
        });
    }

    let data_dir = crate::data_dir();
    let infra = Infra::new(data_dir.clone());
    let log = |line: String| {
        if !json {
            eprintln!("  | {line}");
        }
    };
    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    let results: Vec<(String, Result<Vec<verify::Report>, String>)> = runtime.block_on(async {
        use futures_util::StreamExt;
        // Shared infrastructure first, so parallel runs do not race to build it
        if let Ok(docker) = crate::runtime::docker::connect().await {
            if let Err(e) = infra.ensure(&docker, &log).await {
                eprintln!("error: {e}");
            }
        }
        let mut stream = futures_util::stream::iter(runs.iter())
            .map(|(label, ids)| {
                let (pack, data_dir, infra, log) = (&pack, &data_dir, &infra, &log);
                async move {
                    let result = verify::verify(pack, ids, data_dir, infra, keep, log).await.map_err(|e| e.to_string());
                    (label.clone(), result)
                }
            })
            .buffer_unordered(parallel);
        // Report each run as it finishes, so an interrupted batch keeps them
        let mut results = Vec::new();
        while let Some((label, result)) = stream.next().await {
            if !json {
                print_run(&label, &result);
            }
            results.push((label, result));
        }
        results
    });

    let mut failed = 0;
    let mut total = 0;
    for (_, result) in &results {
        match result {
            Ok(reports) => {
                total += reports.len();
                failed += reports.iter().filter(|r| !r.ok).count();
            }
            Err(_) => failed += 1,
        }
    }
    if json {
        let out: std::collections::BTreeMap<_, _> = results
            .iter()
            .map(|(label, r)| (label.clone(), match r {
                Ok(reports) => serde_json::to_value(reports).unwrap_or_default(),
                Err(e) => serde_json::json!({ "error": e }),
            }))
            .collect();
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    } else {
        println!("{total} verified, {failed} failed");
    }
    if failed == 0 { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

fn print_run(label: &str, result: &Result<Vec<verify::Report>, String>) {
    match result {
        Ok(reports) => {
            println!("{label}: {}/{} ok", reports.iter().filter(|r| r.ok).count(), reports.len());
            for r in reports.iter().filter(|r| !r.ok) {
                println!("  FAIL {}", r.question);
                for p in &r.problems {
                    println!("       - {p}");
                }
            }
        }
        Err(e) => println!("{label}: error: {e}"),
    }
}

fn write_schemas(out: &PathBuf) -> ExitCode {
    if let Err(e) = std::fs::create_dir_all(out) {
        eprintln!("error: {}: {e}", out.display());
        return ExitCode::FAILURE;
    }
    for (name, schema) in crate::lab::schemas() {
        let path = out.join(name);
        if let Err(e) = std::fs::write(&path, serde_json::to_string_pretty(&schema).unwrap_or_default() + "\n") {
            eprintln!("error: {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
        println!("wrote {}", path.display());
    }
    ExitCode::SUCCESS
}
