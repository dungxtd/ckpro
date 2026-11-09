//! What differs between the systems the app runs on, behind one interface.
//! Each system implements `Platform` in its own file (`macos.rs`,
//! `linux.rs`, `windows.rs`; what macOS and Linux share is in `unix.rs`);
//! the rest of the app calls the functions here and never asks which system
//! it is on. Programs are started directly, their arguments as a list: never
//! through a shell, whose quoting differs by system.

use process_wrap::tokio::{KillOnDrop, TokioChildWrapper, TokioCommandWrap};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Output};
use tokio::process::{ChildStderr, ChildStdin, ChildStdout, Command};

#[cfg(unix)]
mod unix;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux::Os;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos::Os;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows::Os;

/// One system's ways
pub trait Platform {
    /// The file program `name` is (`docker.exe` on Windows)
    fn program_file(name: &str) -> String;
    /// Where installers put programs (Node.js, the Claude CLI) beyond PATH: an
    /// app started from the Dock or Finder does not get the shell's PATH
    fn program_dirs(home: &Path) -> Vec<PathBuf>;
    /// npm's `npx` script beside Node.js in `node_dir`, run with `node`
    fn npx_script(node_dir: &Path) -> PathBuf;
    /// Where Docker puts its CLI, ahead of PATH
    fn docker_cli_dirs(home: &Path) -> Vec<PathBuf>;
    /// Docker engines beyond the default one (OrbStack, Colima, rootless
    /// Docker's sockets), not yet asked whether they answer
    fn other_docker_engines(home: &Path) -> Vec<bollard::Docker>;
    /// How to get Docker running here, for what the app says when it is not
    const DOCKER_START: &'static str;
    /// How to get Docker here, for when its CLI is not found
    const DOCKER_INSTALL: &'static str;

    /// `command` with no window of its own (a console program the app starts)
    fn quiet(command: &mut std::process::Command);
    /// `command` set to start in a tree of its own, which holds every
    /// process it starts in turn (a session, a job object)
    fn tree(command: &mut TokioCommandWrap);
    /// Whether process `pid` is running
    fn process_alive(pid: u32) -> bool;
    /// `argv` in a pseudo-terminal, for an interactive program
    fn in_terminal(argv: &[OsString]) -> Command;
    /// `link` runs `program` (a symbolic link, a hard link or a copy)
    fn link_program(program: &Path, link: &Path) -> std::io::Result<()>;
    /// Whether `link` still runs `program` (`link_program`)
    fn links_to(link: &Path, program: &Path) -> bool;
    /// Let `path` run as a program
    fn make_executable(path: &Path) -> std::io::Result<()>;
    /// Keep `dir` to the user alone
    fn make_private(dir: &Path) -> std::io::Result<()>;
}

/// The directories on the app's PATH
pub fn path_dirs() -> Vec<PathBuf> {
    std::env::var_os("PATH").map(|path| std::env::split_paths(&path).collect()).unwrap_or_default()
}

/// The user's home directory (empty when unknown)
pub fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

pub fn program_file(name: &str) -> String {
    Os::program_file(name)
}

/// The first of `dirs` that holds program `name`
pub fn find_program(dirs: &[PathBuf], name: &str) -> Option<PathBuf> {
    let file = Os::program_file(name);
    dirs.iter().map(|dir| dir.join(&file)).find(|p| p.is_file())
}

/// Whether file `path` is a program that starts without a shell (a path the
/// user set: on Windows a `.cmd` needs cmd.exe)
pub fn is_program(path: &Path) -> bool {
    let wanted = Os::program_file("x");
    match Path::new(&wanted).extension() {
        Some(ext) => path.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext)),
        None => true,
    }
}

/// Where installers put programs, beyond PATH
pub fn program_dirs() -> Vec<PathBuf> {
    Os::program_dirs(&home())
}

pub fn npx_script(node_dir: &Path) -> PathBuf {
    Os::npx_script(node_dir)
}

pub fn docker_cli_dirs() -> Vec<PathBuf> {
    Os::docker_cli_dirs(&home())
}

pub fn other_docker_engines() -> Vec<bollard::Docker> {
    Os::other_docker_engines(&home())
}

pub const DOCKER_START: &str = Os::DOCKER_START;
pub const DOCKER_INSTALL: &str = Os::DOCKER_INSTALL;

/// `Command::new(program)` with no window of its own: every program the app
/// starts goes through here
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    Os::quiet(command.as_std_mut());
    command
}

/// `command`, to wait for without a runtime (the app quitting, the docker
/// stand-in)
pub fn std_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    Os::quiet(&mut command);
    command
}

/// A process the app started and every process it starts in turn, stopped
/// together when this is dropped: the Claude adapter is npx, then node, then
/// the Claude CLI, and stopping npx alone would leave the others running.
/// Each system holds the tree its own way (`Platform::tree`, through
/// process-wrap): on Windows the process starts suspended and joins its job
/// before it runs, so nothing it starts can slip out
pub struct ProcessTree(Box<dyn TokioChildWrapper>);

impl ProcessTree {
    /// Start `command` in a tree of its own
    pub fn spawn(command: Command) -> std::io::Result<ProcessTree> {
        let mut wrap = TokioCommandWrap::from(command);
        Os::tree(&mut wrap);
        wrap.wrap(KillOnDrop);
        Ok(ProcessTree(wrap.spawn()?))
    }

    /// The process's input, when piped (once)
    pub fn stdin(&mut self) -> Option<ChildStdin> {
        self.0.stdin().take()
    }

    /// Its output, when piped (once)
    pub fn stdout(&mut self) -> Option<ChildStdout> {
        self.0.stdout().take()
    }

    pub fn stderr(&mut self) -> Option<ChildStderr> {
        self.0.stderr().take()
    }

    /// Wait for the process the app started (not the rest of the tree: what
    /// it leaves running stops with the tree)
    pub async fn wait(&mut self) -> std::io::Result<ExitStatus> {
        self.0.inner_mut().wait().await
    }

    /// Wait for it, with all it printed. The tree lives until then: dropped
    /// earlier (a timeout), every process in it stops
    pub async fn output(mut self) -> std::io::Result<Output> {
        use tokio::io::AsyncReadExt;
        async fn read(pipe: Option<impl tokio::io::AsyncRead + Unpin>) -> std::io::Result<Vec<u8>> {
            let mut bytes = Vec::new();
            if let Some(mut pipe) = pipe {
                pipe.read_to_end(&mut bytes).await?;
            }
            Ok(bytes)
        }
        let (stdout, stderr) = (self.stdout(), self.stderr());
        let (stdout, stderr, status) = tokio::try_join!(read(stdout), read(stderr), self.wait())?;
        Ok(Output { status, stdout, stderr })
    }
}

impl Drop for ProcessTree {
    fn drop(&mut self) {
        // The whole tree: dropping the process alone stops only the first one
        let _ = self.0.start_kill();
    }
}

pub fn process_alive(pid: u32) -> bool {
    pid == std::process::id() || Os::process_alive(pid)
}

pub fn in_terminal(argv: &[OsString]) -> Command {
    let mut command = Os::in_terminal(argv);
    Os::quiet(command.as_std_mut());
    command
}

/// `link` runs `program`, made again when it no longer does
pub fn link_program(program: &Path, link: &Path) -> std::io::Result<()> {
    if Os::links_to(link, program) {
        return Ok(());
    }
    match std::fs::remove_file(link) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
        _ => {}
    }
    Os::link_program(program, link)
}

pub fn make_executable(path: &Path) -> std::io::Result<()> {
    Os::make_executable(path)
}

pub fn make_private(dir: &Path) -> std::io::Result<()> {
    Os::make_private(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn programs_are_executables() {
        let docker = program_file("docker");
        assert_eq!(docker, if cfg!(windows) { "docker.exe" } else { "docker" });
        assert!(is_program(Path::new(&docker)));
        assert!(is_program(Path::new("CLAUDE.EXE")) || !cfg!(windows));
        assert_eq!(is_program(Path::new("claude.cmd")), !cfg!(windows));
    }

    /// What `output` gives: the exit status and both streams, read together
    #[cfg(unix)]
    #[tokio::test]
    async fn a_tree_gives_its_output() {
        let mut sh = command("sh");
        sh.args(["-c", "echo out; echo err >&2; exit 3"]);
        sh.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        let output = ProcessTree::spawn(sh).unwrap().output().await.unwrap();
        assert_eq!((output.status.code(), output.stdout.as_slice(), output.stderr.as_slice()), (Some(3), &b"out\n"[..], &b"err\n"[..]));
    }

    /// Dropping the tree stops what its process started, not only the process
    /// (the Claude CLI under npx and node). The grandchild here writes to a
    /// file every 100 ms: once the tree is dropped the file stops growing
    #[cfg(unix)]
    #[tokio::test]
    async fn a_dropped_tree_stops_its_grandchildren() {
        let file = std::env::temp_dir().join(format!("ckpro-tree-{}", std::process::id()));
        let _ = std::fs::remove_file(&file);
        let mut sh = command("sh");
        sh.arg("-c").arg(format!("(while :; do echo x >> '{}'; sleep 0.1; done) & wait", file.display()));
        // No stream of the test's: a grandchild left running must not hold it open
        sh.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        let tree = ProcessTree::spawn(sh).unwrap();
        let size = || std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        assert!(size() > 0, "the grandchild runs");
        drop(tree);
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let stopped = size();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        assert_eq!(size(), stopped, "the grandchild stopped with the tree");
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn this_process_is_alive() {
        assert!(process_alive(std::process::id()));
        assert!(!process_alive(u32::MAX - 1));
    }
}
