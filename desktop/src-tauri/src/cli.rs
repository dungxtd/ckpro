//! `ckpro <command>`: the same binary as the app, run headless. Used by lab
//! authors, CI and AI agents (Claude Code) to check their work.

use crate::lab::{lint, load, verify};
use crate::runtime::infra::Infra;
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = "ckpro", version, about = "ckpro: Kubernetes exam practice")]
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
    /// Print the images to publish (name, image with its tag, build args):
    /// CI builds and pushes them, the app pulls them
    Images,
    /// Fill an empty data directory with a preparation in full swing (three
    /// exams, weeks of attempts, plans), to open with CKPRO_DATA_DIR=<dir>
    #[command(hide = true)]
    Demo { dir: PathBuf },
    /// Stop or remove ckpro's containers as the app quits (the app starts
    /// this; it finds them by cluster so quitting waits for nothing)
    #[command(hide = true)]
    Quit {
        action: crate::runtime::docker::OnQuit,
        #[arg(long = "cluster")]
        clusters: Vec<String>,
        #[arg(long = "container")]
        containers: Vec<String>,
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
        /// Verify the fixed questions of an exam (repeatable), e.g. cka-003.
        /// With neither --exam nor --question, the whole pack
        #[arg(long = "exam")]
        exams: Vec<String>,
        /// Verify a question (repeatable), e.g. cka/rbac-ci-token
        #[arg(long = "question")]
        questions: Vec<String>,
        /// Keep the clusters and jumphost of each run for inspection
        #[arg(long)]
        keep: bool,
        /// Runs at once: each --exam is a run, --question ones form one run.
        /// Each run needs about 2 GB of Docker memory. By default as many as
        /// Docker's memory allows, up to 4
        #[arg(long)]
        parallel: Option<usize>,
        /// Machine-readable report
        #[arg(long)]
        json: bool,
    },
    /// Have Claude Code write a question, prove it like `verify`, and keep it
    /// in "My questions" (the app's own pack, next to its database)
    Generate {
        /// The bundled pack's directory (certifications and example questions)
        pack: PathBuf,
        /// e.g. cka
        #[arg(long)]
        certification: String,
        /// A curriculum domain of the certification, e.g. storage
        #[arg(long)]
        domain: String,
        /// easy, medium or hard
        #[arg(long, default_value = "medium")]
        difficulty: String,
        /// What it should be about
        #[arg(long, default_value = "")]
        topic: String,
    },
}

/// Subcommands handled headless; anything else starts the app.
pub fn is_cli(args: &[String]) -> bool {
    matches!(
        args.get(1).map(String::as_str),
        Some("lab" | "schema" | "images" | "quit" | "demo" | "help" | "--help" | "-h" | "--version" | "-V")
    )
}

pub fn main() -> ExitCode {
    match Cli::parse().command {
        Command::Lab { command: LabCommand::Lint { pack, json } } => lint_pack(&pack, json),
        Command::Lab { command: LabCommand::Verify { pack, exams, questions, keep, parallel, json } } => {
            verify_pack(&pack, &exams, &questions, keep, parallel, json)
        }
        Command::Lab { command: LabCommand::Generate { pack, certification, domain, difficulty, topic } } => {
            generate_question(&pack, certification, domain, &difficulty, topic)
        }
        Command::Schema { out } => write_schemas(&out),
        Command::Quit { action, clusters, containers } => {
            let Ok(runtime) = tokio::runtime::Runtime::new() else { return ExitCode::FAILURE };
            let done = runtime.block_on(async {
                tokio::time::timeout(std::time::Duration::from_secs(120), crate::runtime::docker::quit(action, &clusters, &containers)).await
            });
            if matches!(done, Ok(Ok(()))) { ExitCode::SUCCESS } else { ExitCode::FAILURE }
        }
        Command::Demo { dir } => {
            let pack = crate::load_pack(None);
            match crate::demo::seed(&dir, &pack) {
                Ok(done) => {
                    println!("{done}\nOpen it: CKPRO_DATA_DIR={} pnpm tauri dev", dir.display());
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("{e}");
                    ExitCode::FAILURE
                }
            }
        }
        Command::Images => {
            println!("{}", serde_json::to_string_pretty(&crate::runtime::infra::manifest()).unwrap_or_default());
            ExitCode::SUCCESS
        }
    }
}

fn generate_question(root: &PathBuf, certification: String, domain: String, difficulty: &str, topic: String) -> ExitCode {
    let Some(core) = load::load(root).0 else {
        return lint_pack(root, false);
    };
    let difficulty = match difficulty {
        "easy" => crate::lab::model::Difficulty::Easy,
        "hard" => crate::lab::model::Difficulty::Hard,
        _ => crate::lab::model::Difficulty::Medium,
    };
    let data_dir = crate::data_dir();
    let bank = crate::lab::mine::merged(core, &data_dir);
    let infra = Infra::new(data_dir.clone());
    let activities = crate::runtime::activity::Activities::new(|_| {}, |_, line: &str| eprintln!("  | {line}"));
    let request = crate::ai::generate::GenerateRequest { certification, domain, difficulty, topic };
    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    let result = runtime.block_on(async {
        let docker = crate::runtime::docker::connect().await?;
        infra.ensure(&docker, &|line| eprintln!("  | {line}")).await?;
        let cancel = tokio_util::sync::CancellationToken::new();
        let agent = crate::ai::agent::Agent::new();
        // The draft is read here before its scripts run on a cluster
        let review = |draft: crate::ai::generate::Draft| {
            eprintln!("\n{}\n\nRun “{}” on a cluster to prove it? [y/N] ", draft.yaml.trim_end(), draft.title);
            let mut line = String::new();
            let (answer, answered) = tokio::sync::oneshot::channel();
            let _ = answer.send(std::io::stdin().read_line(&mut line).is_ok() && line.trim().eq_ignore_ascii_case("y"));
            answered
        };
        crate::ai::generate::generate(&agent, "opus", &bank, &infra, &activities, &data_dir, &request, &cancel, review).await
    });
    match result {
        Ok(g) => {
            println!("generated {} ({}), in exam {}", g.id, g.title, g.exam_id);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
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

/// Memory a verify run needs (a cluster, its task host): about 2 GB
const RUN_MB: u64 = 2048;

fn verify_pack(root: &PathBuf, exams: &[String], questions: &[String], keep: bool, parallel: Option<usize>, json: bool) -> ExitCode {
    let (pack, mut findings) = load::load(root);
    let Some(pack) = pack else {
        return lint_pack(root, false);
    };
    findings.extend(lint::lint(&pack));
    if findings.iter().any(|f| f.level == load::Level::Error) {
        eprintln!("the pack has lint errors; run `ckpro lab lint` first");
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
    // Nothing chosen: the whole pack, every exam plus the questions none lists
    if runs.is_empty() {
        runs = pack.exams.iter().map(|(id, e)| (id.clone(), e.value.questions.clone())).collect();
        let listed: std::collections::BTreeSet<&String> = runs.iter().flat_map(|(_, ids)| ids).collect();
        let loose: Vec<String> = pack.questions.keys().filter(|id| !listed.contains(id)).cloned().collect();
        if !loose.is_empty() {
            runs.push(("questions".into(), loose));
        }
    }
    // Questions needing what ckpro cannot offer yet are skipped, not failed
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
        let mut memory_mb = None;
        if let Ok(docker) = crate::runtime::docker::connect().await {
            if let Err(e) = infra.ensure(&docker, &log).await {
                eprintln!("error: {e}");
            }
            memory_mb = docker.info().await.ok().and_then(|i| i.mem_total).map(|b| b as u64 / 1_048_576);
        }
        // As many runs at once as Docker's memory takes (1 GB kept), up to 4
        let parallel = parallel
            .unwrap_or_else(|| memory_mb.map_or(1, |mb| (mb.saturating_sub(1024) / RUN_MB).clamp(1, 4) as usize))
            .max(1);
        if !json {
            eprintln!("  | {parallel} run(s) at once");
        }
        verify::sweep_stale(&data_dir, &log).await;
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
