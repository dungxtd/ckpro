//! Windows

use super::Platform;
use std::ffi::OsString;
use std::os::windows::process::CommandExt as _;
use std::path::{Path, PathBuf};
use tokio::process::{Child, Command};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, STILL_ACTIVE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation, SetInformationJobObject,
    TerminateJobObject,
};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// CREATE_NO_WINDOW: a console program the app (which has no console) starts
/// would otherwise open a window of its own
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Os;

/// A job object holding a process and all it starts: closing it (dropped,
/// or the app ends, however it ends) stops them all
pub struct Job(HANDLE);

// SAFETY: a job handle is a kernel object any thread may use
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

impl Drop for Job {
    fn drop(&mut self) {
        // SAFETY: the handle is this job's own, closed once
        unsafe {
            CloseHandle(self.0);
        }
    }
}

impl Job {
    /// A job that stops its processes once its last handle closes, holding `process`
    fn holding(process: HANDLE) -> Option<Job> {
        // SAFETY: plain Win32 calls on a job this function creates; the
        // process handle is the child's, alive while the child is
        unsafe {
            let job = Job(CreateJobObjectW(std::ptr::null(), std::ptr::null()));
            if job.0.is_null() {
                return None;
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            (set != 0 && AssignProcessToJobObject(job.0, process) != 0).then_some(job)
        }
    }
}

/// `%name%` as a path, else `fallback`
fn known_dir(name: &str, fallback: &str) -> PathBuf {
    std::env::var_os(name).map_or_else(|| PathBuf::from(fallback), PathBuf::from)
}

impl Platform for Os {
    type Tree = Job;

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

    fn quiet(command: &mut std::process::Command) {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    /// Nothing to set before: the job takes the process once it starts, and
    /// what it starts after that joins the job too
    fn own_tree(_: &mut std::process::Command) {}

    fn tree(child: &Child) -> Option<Job> {
        Job::holding(child.raw_handle()? as HANDLE)
    }

    fn kill_tree(job: &Job) {
        // SAFETY: the job is alive (`job` holds its handle)
        unsafe {
            TerminateJobObject(job.0, 1);
        }
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

