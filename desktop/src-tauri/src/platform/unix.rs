//! What macOS and Linux share

use process_wrap::tokio::{ProcessSession, TokioCommandWrap};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// Where installers put programs in the home directory and system-wide:
/// the Claude CLI's, Volta's, then nvm's Node.js versions, newest first
pub fn program_dirs(home: &Path) -> Vec<PathBuf> {
    let mut nvm: Vec<PathBuf> =
        std::fs::read_dir(home.join(".nvm/versions/node")).map(|d| d.flatten().map(|e| e.path().join("bin")).collect()).unwrap_or_default();
    nvm.sort();
    let mut dirs = vec![home.join(".claude/local"), home.join(".local/bin"), home.join(".volta/bin"), PathBuf::from("/usr/local/bin")];
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
    .filter_map(|socket| bollard::Docker::connect_with_unix(&socket.to_string_lossy(), 120, bollard::API_DEFAULT_VERSION).ok())
    .collect()
}

/// A session of its own (`setsid`), whose process group holds what it
/// starts, killed together. A session, not only a group: a program started
/// from the app run in a terminal cannot take that terminal over
pub fn tree(command: &mut TokioCommandWrap) {
    command.wrap(ProcessSession);
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
