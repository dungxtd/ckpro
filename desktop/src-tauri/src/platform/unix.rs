//! What macOS and Linux share

use std::os::unix::fs::PermissionsExt;
use std::os::unix::process::CommandExt as _;
use std::path::{Path, PathBuf};
use tokio::process::Child;

/// A process group, led by the process the app started
pub struct Group(i32);

/// Where installers put programs in the home directory and system-wide:
/// the Claude CLI's, Volta's, then nvm's Node.js versions, newest first
pub fn program_dirs(home: &Path) -> Vec<PathBuf> {
    let mut nvm: Vec<PathBuf> = std::fs::read_dir(home.join(".nvm/versions/node"))
        .map(|d| d.flatten().map(|e| e.path().join("bin")).collect())
        .unwrap_or_default();
    nvm.sort();
    let mut dirs = vec![
        home.join(".claude/local"),
        home.join(".local/bin"),
        home.join(".volta/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    dirs.extend(nvm.into_iter().rev());
    dirs
}

/// npm installs beside Node.js's `bin` directory, in `lib/node_modules`
pub fn npx_script(node_dir: &Path) -> PathBuf {
    node_dir.join("../lib/node_modules/npm/bin/npx-cli.js")
}

/// Engines on the sockets other Docker distributions use, beyond the default
/// one (OrbStack, Colima, Rancher Desktop, Docker Desktop's per-user one)
pub fn other_docker_engines(home: &Path) -> Vec<bollard::Docker> {
    [
        PathBuf::from("/var/run/docker.sock"),
        home.join(".orbstack/run/docker.sock"),
        home.join(".docker/run/docker.sock"),
        home.join(".colima/default/docker.sock"),
        home.join(".rd/docker.sock"),
    ]
    .into_iter()
    .filter(|socket| socket.exists())
    .filter_map(|socket| {
        bollard::Docker::connect_with_unix(&socket.to_string_lossy(), 120, bollard::API_DEFAULT_VERSION).ok()
    })
    .collect()
}

/// A process group of its own: what it starts joins it
pub fn own_tree(command: &mut std::process::Command) {
    command.process_group(0);
}

pub fn tree(child: &Child) -> Option<Group> {
    child.id().and_then(|pid| i32::try_from(pid).ok()).map(Group)
}

pub fn kill_tree(group: &Group) {
    // SAFETY: a plain signal to a group the app started (`own_tree`)
    unsafe {
        libc::killpg(group.0, libc::SIGKILL);
    }
}

pub fn process_alive(pid: u32) -> bool {
    let Ok(pid) = i32::try_from(pid) else { return false };
    // SAFETY: signal 0 only asks whether the process exists
    let answered = unsafe { libc::kill(pid, 0) } == 0;
    // There, but another user's
    answered || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// A symbolic link: it follows the program wherever it is updated
pub fn link_program(program: &Path, link: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(program, link)
}

pub fn links_to(link: &Path, program: &Path) -> bool {
    std::fs::read_link(link).is_ok_and(|target| target == program)
}

pub fn make_executable(path: &Path) -> std::io::Result<()> {
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}

pub fn make_private(dir: &Path) -> std::io::Result<()> {
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
}
