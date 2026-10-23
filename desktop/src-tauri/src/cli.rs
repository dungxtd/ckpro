//! `ckdry <command>`: the same binary as the app, run headless. Used by lab
//! authors, CI and AI agents (Claude Code) to check their work.

use crate::lab::{lint, load};
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
