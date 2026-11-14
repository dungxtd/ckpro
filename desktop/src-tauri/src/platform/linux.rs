//! Linux

use super::{Platform, unix};
use process_wrap::tokio::TokioCommandWrap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub struct Os;

impl Platform for Os {
    fn program_file(name: &str) -> String {
        name.to_string()
    }

    fn program_dirs(home: &Path) -> Vec<PathBuf> {
        unix::program_dirs(home)
    }

    fn npx_script(node_dir: &Path) -> PathBuf {
        unix::npx_script(node_dir)
    }

    fn docker_cli_dirs(home: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin"), PathBuf::from("/snap/bin"), home.join(".rd/bin")]
    }

    fn other_docker_engines(home: &Path) -> Vec<bollard::Docker> {
        unix::other_docker_engines(home)
    }

    const DOCKER_START: &'static str = "Start Docker (sudo systemctl start docker), your user in the docker group";
    const DOCKER_INSTALL: &'static str = "Install Docker Engine";
    /// Docker Engine shares this computer's memory with every program on it
    /// (Docker Desktop's runs in a machine of its own, sized in its settings)
    const DOCKER_MEMORY: &'static str = "Close programs you do not need, or delete a cluster (with Docker Desktop, raise its memory limit)";
    const DOCKER_DISK: &'static str = "free space on this computer's disk (docker system prune removes what Docker no longer uses)";

    fn kind_asset(arch: &str) -> Option<&'static str> {
        match arch {
            "aarch64" => Some("kind-linux-arm64"),
            "x86_64" => Some("kind-linux-amd64"),
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

    /// util-linux `script`: the command as one line, which it hands to the
    /// user's shell (each argument quoted)
    fn in_terminal(argv: &[OsString]) -> Command {
        let line = argv.iter().map(|a| crate::runtime::exec::quote(&a.to_string_lossy())).collect::<Vec<_>>().join(" ");
        let mut command = Command::new("script");
        command.args(["-q", "-e", "-c", &line, "/dev/null"]);
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

    /// systemd's machine id (D-Bus's where only it is kept)
    fn machine_id() -> Option<String> {
        ["/etc/machine-id", "/var/lib/dbus/machine-id"].iter().find_map(|f| std::fs::read_to_string(f).ok())
    }
}
