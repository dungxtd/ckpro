//! `ckdry <command>`: the same binary as the app, run headless. Used by lab
//! authors, CI and AI agents (Claude Code) to check their work.

use crate::cluster::kind::Kind;
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
        /// Keep the clusters afterwards for inspection
        #[arg(long)]
        keep: bool,
        /// Delete existing clusters that use the same names
        #[arg(long)]
        replace: bool,
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
        Command::Lab { command: LabCommand::Verify { pack, exams, questions, keep, replace, json } } => {
            verify_pack(&pack, &exams, &questions, verify::Options { keep, replace }, json)
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

fn verify_pack(
    root: &PathBuf,
    exams: &[String],
    questions: &[String],
    options: verify::Options,
    json: bool,
) -> ExitCode {
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
    let full = |id: &String| if id.contains('/') && id.starts_with(&format!("{}/", pack.pack.id)) { id.clone() } else { format!("{}/{id}", pack.pack.id) };
    let mut ids: Vec<String> = Vec::new();
    for exam in exams {
        match pack.exams.get(&full(exam)) {
            Some(e) => ids.extend(e.value.questions.iter().cloned()),
            None => {
                eprintln!("error: no exam '{exam}'");
                return ExitCode::FAILURE;
            }
        }
    }
    ids.extend(questions.iter().map(full));
    ids.dedup();
    if ids.is_empty() {
        eprintln!("error: choose what to verify with --exam or --question");
        return ExitCode::FAILURE;
    }

    let data_dir = crate::data_dir();
    let (kind, infra) = (Kind::new(data_dir.clone()), Infra::new(data_dir));
    let log = |line: String| {
        if !json {
            eprintln!("  | {line}");
        }
    };
    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    let reports = match runtime.block_on(verify::verify(&pack, &ids, &kind, &infra, &options, &log)) {
        Ok(reports) => reports,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    let failed = reports.iter().filter(|r| !r.ok).count();
    if json {
        println!("{}", serde_json::to_string_pretty(&reports).unwrap_or_default());
    } else {
        for r in &reports {
            println!("{} {}", if r.ok { "ok  " } else { "FAIL" }, r.question);
            for p in &r.problems {
                println!("       - {p}");
            }
        }
        println!("{} verified, {failed} failed", reports.len());
    }
    if failed == 0 { ExitCode::SUCCESS } else { ExitCode::FAILURE }
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
