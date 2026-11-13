//! Windows

use super::Platform;
use process_wrap::tokio::{CreationFlags, JobObject, TokioCommandWrap};
use std::ffi::OsString;
use std::os::windows::process::CommandExt as _;
use std::path::{Path, PathBuf};
use tokio::process::Command;
use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// CREATE_NO_WINDOW: a console program the app (which has no console) starts
/// would otherwise open a window of its own
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Os;

/// `%name%` as a path, else `fallback`
fn known_dir(name: &str, fallback: &str) -> PathBuf {
    std::env::var_os(name).map_or_else(|| PathBuf::from(fallback), PathBuf::from)
}

impl Platform for Os {
    fn program_file(name: &str) -> String {
        format!("{name}.exe")
    }

    /// The Claude CLI's native install, Node.js's installer, Volta's
    fn program_dirs(home: &Path) -> Vec<PathBuf> {
        vec![
            home.join(r".local\bin"),
            known_dir("ProgramFiles", r"C:\Program Files").join("nodejs"),
            home.join(r"AppData\Local\Volta\bin"),
        ]
    }

    /// npm installs inside Node.js's directory
    fn npx_script(node_dir: &Path) -> PathBuf {
        node_dir.join(r"node_modules\npm\bin\npx-cli.js")
    }

    fn docker_cli_dirs(_: &Path) -> Vec<PathBuf> {
        vec![known_dir("ProgramFiles", r"C:\Program Files").join(r"Docker\Docker\resources\bin")]
    }

    /// Docker Desktop's engine is on the named pipe the defaults use
    fn other_docker_engines(_: &Path) -> Vec<bollard::Docker> {
        Vec::new()
    }

    const DOCKER_START: &'static str = "Start Docker Desktop";
    const DOCKER_INSTALL: &'static str = "Install Docker Desktop";
    /// On WSL 2 the limit is WSL's own, not Docker Desktop's
    const DOCKER_MEMORY: &'static str =
        "Raise Docker Desktop's memory limit (on WSL 2: memory in .wslconfig), or delete a cluster";

    fn quiet(command: &mut std::process::Command) {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    /// A job object that stops all it holds when closed. The process starts
    /// suspended, joins the job, then runs, so nothing it starts can be
    /// outside it. `CreationFlags` must come first: the job sets the creation
    /// flags itself, and only keeps those it is given this way
    fn tree(command: &mut TokioCommandWrap) {
        command
            .wrap(CreationFlags(windows::Win32::System::Threading::PROCESS_CREATION_FLAGS(CREATE_NO_WINDOW)))
            .wrap(JobObject);
    }

    fn process_alive(pid: u32) -> bool {
        // SAFETY: a handle opened to read the exit code, closed before return
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return false;
            }
            let mut code = 0u32;
            let read = GetExitCodeProcess(process, &mut code);
            CloseHandle(process);
            read != 0 && code == STILL_ACTIVE as u32
        }
    }

    /// No pseudo-terminal to wrap it in: the program itself, its input and
    /// output piped
    fn in_terminal(argv: &[OsString]) -> Command {
        let mut command = Command::new(&argv[0]);
        command.args(&argv[1..]);
        command
    }

    /// A hard link (no rights needed, unlike a symbolic link), else a copy
    /// where the program is on another drive
    fn link_program(program: &Path, link: &Path) -> std::io::Result<()> {
        std::fs::hard_link(program, link).or_else(|_| std::fs::copy(program, link).map(drop))
    }

    /// The same file (a hard link) or a copy of this one: the same size and
    /// last change
    fn links_to(link: &Path, program: &Path) -> bool {
        let (Ok(link), Ok(program)) = (std::fs::metadata(link), std::fs::metadata(program)) else {
            return false;
        };
        link.len() == program.len() && link.modified().ok() == program.modified().ok()
    }

    /// Any file runs by its extension here
    fn make_executable(_: &Path) -> std::io::Result<()> {
        Ok(())
    }

    /// The user's profile directories are theirs alone already
    fn make_private(_: &Path) -> std::io::Result<()> {
        Ok(())
    }
}

