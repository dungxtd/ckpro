//! macOS

use super::{Platform, unix};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use process_wrap::tokio::TokioCommandWrap;
use tokio::process::Command;

pub struct Os;

impl Platform for Os {
    fn program_file(name: &str) -> String {
        name.to_string()
    }

    fn program_dirs(home: &Path) -> Vec<PathBuf> {
        let mut dirs = vec![PathBuf::from("/opt/homebrew/bin")];
        dirs.extend(unix::program_dirs(home));
        dirs
    }

    fn npx_script(node_dir: &Path) -> PathBuf {
        unix::npx_script(node_dir)
    }

    fn docker_cli_dirs(home: &Path) -> Vec<PathBuf> {
        vec![
            home.join(".orbstack/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/Applications/Docker.app/Contents/Resources/bin"),
            home.join(".rd/bin"),
        ]
    }

    fn other_docker_engines(home: &Path) -> Vec<bollard::Docker> {
        unix::other_docker_engines(home)
    }

    const DOCKER_START: &'static str = "Start OrbStack or Docker Desktop";
    const DOCKER_INSTALL: &'static str = "Install OrbStack or Docker Desktop";
    const DOCKER_MEMORY: &'static str = "Raise the memory limit in OrbStack or Docker Desktop, or delete a cluster";
    const DOCKER_DISK: &'static str = "free space in OrbStack or Docker Desktop";

    fn kind_asset(arch: &str) -> Option<&'static str> {
        match arch {
            "aarch64" => Some("kind-darwin-arm64"),
            "x86_64" => Some("kind-darwin-amd64"),
            _ => None,
        }
    }

    fn quiet(_: &mut std::process::Command) {}

    fn tree(command: &mut TokioCommandWrap) {
        unix::tree(command);
    }

    fn process_alive(pid: u32) -> bool {
        unix::process_alive(pid)
    }

    /// BSD `script`: the program and its arguments follow the log file
    fn in_terminal(argv: &[OsString]) -> Command {
        let mut command = Command::new("/usr/bin/script");
        command.arg("-q").arg("/dev/null").args(argv);
        command
    }

    fn link_program(program: &Path, link: &Path) -> std::io::Result<()> {
        unix::link_program(program, link)
    }

    fn links_to(link: &Path, program: &Path) -> bool {
        unix::links_to(link, program)
    }

    fn make_executable(path: &Path) -> std::io::Result<()> {
        unix::make_executable(path)
    }

    fn make_private(dir: &Path) -> std::io::Result<()> {
        unix::make_private(dir)
    }
}
