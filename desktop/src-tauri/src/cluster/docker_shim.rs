//! The `docker` kind runs: the app itself, started under that name (a link
//! in the data directory, `Kind::kind`). kind has no option to label its
//! node containers, so `docker run` gets the cktry compose labels; every
//! other command goes to the real CLI as it is. Rust, not a script: the same
//! on every system, and no shell to quote arguments for.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// The real `docker` CLI, on the stand-in's environment (kind passes its own on)
pub const REAL_DOCKER: &str = "CKTRY_REAL_DOCKER";

/// The program the stand-in links to: this app. A test binary cannot be it,
/// so tests use the app built beside them (`cargo build` first)
pub fn program() -> std::io::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    if cfg!(test) {
        // target/<profile>/deps/<test> -> target/<profile>/cktry
        let app = exe
            .parent()
            .and_then(Path::parent)
            .map(|dir| dir.join(crate::platform::program_file("cktry")))
            .filter(|app| app.is_file());
        return app.ok_or_else(|| std::io::Error::other("build the app first (cargo build): tests run kind through it"));
    }
    Ok(exe)
}

/// The stand-in's exit code when this process was started as `docker`
pub fn run_if_started_as_docker() -> Option<ExitCode> {
    let mut args = std::env::args_os();
    let name = args.next()?;
    let started_as_docker = Path::new(&name)
        .file_stem()
        .is_some_and(|stem| stem.eq_ignore_ascii_case("docker"));
    started_as_docker.then(|| run(args.collect()))
}

/// Hand `args` to the real CLI, labelled when they run a container
fn run(args: Vec<OsString>) -> ExitCode {
    let Some(real) = std::env::var_os(REAL_DOCKER) else {
        eprintln!("cktry: {REAL_DOCKER} is not set: this is the stand-in kind runs, not docker");
        return ExitCode::from(127);
    };
    match crate::platform::std_command(&real).args(labelled(args)).status() {
        // A signal (Unix) has no code: a failure all the same
        Ok(status) => ExitCode::from(status.code().and_then(|c| u8::try_from(c).ok()).unwrap_or(1)),
        Err(e) => {
            eprintln!("cktry: running {}: {e}", Path::new(&real).display());
            ExitCode::from(127)
        }
    }
}

/// `args`, with the cktry compose labels after `run`
fn labelled(args: Vec<OsString>) -> Vec<OsString> {
    if args.first().is_none_or(|a| a != "run") {
        return args;
    }
    let name = container_name(&args[1..]).unwrap_or_else(|| "node".into());
    let mut out: Vec<OsString> = vec!["run".into()];
    for (key, value) in crate::runtime::docker::compose_labels(&name) {
        out.push("--label".into());
        out.push(format!("{key}={value}").into());
    }
    out.extend(args.into_iter().skip(1));
    out
}

/// The `--name` given to `docker run`
fn container_name(args: &[OsString]) -> Option<String> {
    let args: Vec<_> = args.iter().map(|a| a.to_string_lossy()).collect();
    args.iter().enumerate().find_map(|(i, arg)| match arg.strip_prefix("--name=") {
        Some(name) => Some(name.to_string()),
        None if arg == "--name" => args.get(i + 1).map(|n| n.to_string()),
        None => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(args: &[&str]) -> Vec<OsString> {
        args.iter().map(Into::into).collect()
    }

    #[test]
    fn run_gets_the_labels_of_its_container() {
        let given = ["--name", "k8s-control-plane", "--publish=127.0.0.1:1:6443/TCP", "-e", "A=b c,d;e", "img"];
        let out = labelled(os(&[&["run"][..], &given[..]].concat()));
        let text: Vec<_> = out.iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(text[0], "run");
        assert!(text.contains(&"com.docker.compose.service=k8s-control-plane".to_string()), "{text:?}");
        assert!(text.contains(&"com.docker.compose.project=cktry".to_string()), "{text:?}");
        // What kind gave comes after, as it was
        assert_eq!(text[text.len() - given.len()..], given);
    }

    #[test]
    fn the_name_may_be_one_argument() {
        assert_eq!(container_name(&os(&["--name=k8s-worker", "img"])).as_deref(), Some("k8s-worker"));
        assert_eq!(container_name(&os(&["img"])), None);
    }

    #[test]
    fn other_commands_go_through_as_they_are() {
        let args = os(&["inspect", "--format", "{{.State.Running}}", "k8s-control-plane"]);
        assert_eq!(labelled(args.clone()), args);
    }
}
