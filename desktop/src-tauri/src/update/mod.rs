//! Updates: CKPro checks the latest release every few hours, downloads a
//! newer version by itself (its signature checked) and keeps it in the data
//! directory, then installs it at a restart the candidate asks for, or as
//! CKPro quits. Never while an attempt runs: a restart would cut it short,
//! and an attempt resumes on the version that started it. A release can
//! require its version (`minimum_version` in latest.json): no new attempt
//! starts until it runs.
//!
//! A restart for an update leaves the environment running (the clusters,
//! the task host, the desktop): the app is back in a moment and finds them
//! as they were. Rust owns the state; the interface is sent it
//! (`UpdateChanged`) and never asks again.

pub mod policy;
pub mod source;
pub mod stage;

use crate::error::{AppError, AppResult};
use crate::sync::MutexExt;
use policy::{Busy, Install};
use semver::Version;
use serde::{Deserialize, Serialize};
use source::{Found, Source};
use stage::Staged;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

/// The first check, once the app has settled
const FIRST_CHECK: Duration = Duration::from_secs(60);
/// How often the schedule looks at the clock (a computer that slept checks
/// soon after it wakes)
const TICK: Duration = Duration::from_secs(10 * 60);
/// Download progress is sent at most this often
const PROGRESS_EVERY: Duration = Duration::from_millis(100);
/// The downloads' folder, in the data directory
pub const UPDATES: &str = "updates";
/// The setting that keeps the version that ran last (an update since is
/// said once)
pub const LAST_VERSION: &str = "app_version";
/// Where the releases are, for an update installed by hand
const RELEASES: &str = "https://github.com/dungxtd/ckpro/releases";

/// Where an update is, as the interface shows it
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateStatus {
    /// Up to date as of `checked_at` (ms; none: not checked yet)
    Idle { checked_at: Option<f64> },
    /// Asking for the latest version (shown when the candidate asked)
    Checking,
    /// Coming down in the background; `total` once the server says it
    Downloading { version: String, done: f64, total: Option<f64> },
    /// Downloaded and verified: a restart installs it. `blocked`: what holds
    /// the restart back; `on_quit`: quitting installs it too
    Ready { version: String, notes: String, required: bool, blocked: Option<String>, on_quit: bool },
    /// This copy cannot install it itself: why, the release to get, and the
    /// command that installs it when there is one
    Manual { version: String, notes: String, required: bool, reason: String, url: String, command: Option<String> },
    /// A check the candidate asked for failed
    Failed { message: String },
    /// Installing, then starting again
    Restarting { version: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct UpdateInfo {
    /// The version running
    pub current: String,
    pub status: UpdateStatus,
    /// The candidate put this status away (Not now): nothing in the corner
    pub dismissed: bool,
    /// The version this run replaced, right after an update (once: the
    /// first `update_state` only)
    pub updated_from: Option<String>,
}

/// Where the updater is, with what the interface is not sent
enum Phase {
    Idle,
    Checking,
    /// `kept`: the update ready before this newer one was found; it is
    /// ready again if this download fails
    Downloading {
        found: Found,
        done: u64,
        total: Option<u64>,
        kept: Option<Staged>,
    },
    Ready(Staged),
    Manual {
        found: Found,
        reason: String,
    },
    Failed(String),
    Restarting(String),
}

struct Inner {
    phase: Phase,
    /// The last check that answered (ms)
    checked_at: Option<f64>,
    /// When the next automatic check is due
    next: Option<SystemTime>,
    /// The check under way was asked for: its failure is shown
    asked: bool,
    /// What the candidate put away (`dismiss_key`)
    dismissed: Option<String>,
    updated_from: Option<String>,
    /// What the interface was last sent
    sent: Option<UpdateInfo>,
    progress_sent: Option<Instant>,
}

/// What `ckpro quit` or the quitting app does with a downloaded update
#[derive(Clone, Debug, PartialEq)]
pub enum OnQuit {
    /// Installed by the app as it quits (it replaces itself in place)
    Now(Staged),
    /// Installed by `ckpro quit` once the app is gone (the Windows installer)
    After(String),
}

pub struct Updater {
    source: Box<dyn Source>,
    /// How this copy installs, as it was when the app started
    install: Install,
    /// How it installs now (asked again as the app quits: its folder may no
    /// longer be writable, and a password asked for then would never show)
    locate: Box<dyn Fn() -> Install + Send + Sync>,
    current: Version,
    /// The downloads (`stage`)
    root: PathBuf,
    /// Automatic checks: a release build that can verify what it downloads
    checks: bool,
    inner: Mutex<Inner>,
    emit: Box<dyn Fn(&UpdateInfo) + Send + Sync>,
    /// What is going on (an attempt, a proof), read when it is asked
    busy: OnceLock<Box<dyn Fn() -> Busy + Send + Sync>>,
    /// One check at a time; another asked meanwhile joins it
    checking: tokio::sync::Mutex<()>,
    restarting: AtomicBool,
}

impl Updater {
    pub fn new(
        source: Box<dyn Source>,
        locate: impl Fn() -> Install + Send + Sync + 'static,
        current: Version,
        root: PathBuf,
        checks: bool,
        emit: impl Fn(&UpdateInfo) + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            source,
            install: locate(),
            locate: Box::new(locate),
            current,
            root,
            checks,
            inner: Mutex::new(Inner {
                phase: Phase::Idle,
                checked_at: None,
                next: None,
                asked: false,
                dismissed: None,
                updated_from: None,
                sent: None,
                progress_sent: None,
            }),
            emit: Box::new(emit),
            busy: OnceLock::new(),
            checking: tokio::sync::Mutex::new(()),
            restarting: AtomicBool::new(false),
        })
    }

    /// Read what is going on from `busy` (set once the exams exist)
    pub fn watch(&self, busy: impl Fn() -> Busy + Send + Sync + 'static) {
        let _ = self.busy.set(Box::new(busy));
        self.refresh();
    }

    fn held(&self) -> Option<&'static str> {
        self.busy.get().and_then(|busy| policy::held_by(&busy()))
    }

    /// As the app starts: `previous` is the version that ran last (an update
    /// installed since is said once), and a download kept from an earlier
    /// run is ready again, its signature checked
    pub fn restore(&self, previous: Option<&str>) {
        let previous = previous.and_then(|p| Version::parse(p).ok());
        let staged = stage::load(&self.root)
            .filter(|s| Version::parse(&s.version).is_ok_and(|v| v > self.current) && !matches!(self.install, Install::Manual(_)));
        let ready = staged.filter(|s| match std::fs::read(s.path(&self.root)) {
            Ok(bytes) => self.source.verify(&s.release, &bytes).map_err(|e| tracing::warn!(error = %e, "a kept update")).is_ok(),
            Err(_) => false,
        });
        stage::remove_except(&self.root, ready.as_ref().map(|s| s.version.as_str()));
        {
            let mut inner = self.inner.locked();
            inner.updated_from = previous.filter(|p| *p < self.current).map(|p| p.to_string());
            if let Some(staged) = ready {
                inner.phase = Phase::Ready(staged);
            }
        }
        self.refresh();
    }

    /// The state for the interface, as it opens: the update just installed
    /// is said this once
    pub fn state(&self) -> UpdateInfo {
        let mut info = self.info();
        info.updated_from = self.inner.locked().updated_from.take();
        info
    }

    fn info(&self) -> UpdateInfo {
        let blocked = self.held().map(str::to_string);
        let inner = self.inner.locked();
        let status = match &inner.phase {
            Phase::Idle => UpdateStatus::Idle { checked_at: inner.checked_at },
            Phase::Checking => UpdateStatus::Checking,
            Phase::Downloading { found, done, total, .. } => {
                UpdateStatus::Downloading { version: found.version.clone(), done: *done as f64, total: total.map(|t| t as f64) }
            }
            Phase::Ready(staged) => UpdateStatus::Ready {
                version: staged.version.clone(),
                notes: notes(&staged.release),
                required: policy::required(&self.current, &staged.release),
                blocked,
                on_quit: self.install.on_quit(),
            },
            Phase::Manual { found, reason } => UpdateStatus::Manual {
                version: found.version.clone(),
                notes: found.notes.clone(),
                required: policy::required(&self.current, &found.release),
                reason: reason.clone(),
                url: format!("{RELEASES}/tag/v{}", found.version),
                command: (found.package.ends_with(".deb")).then(|| format!("sudo apt install ./{}", found.package)),
            },
            Phase::Failed(message) => UpdateStatus::Failed { message: message.clone() },
            Phase::Restarting(version) => UpdateStatus::Restarting { version: version.clone() },
        };
        let dismissed = inner.dismissed.is_some() && inner.dismissed == dismiss_key(&status);
        UpdateInfo { current: self.current.to_string(), status, dismissed, updated_from: None }
    }

    /// Send the state when it changed (an attempt began or ended: what
    /// holds a restart back moved)
    pub fn refresh(&self) {
        let info = self.info();
        {
            let mut inner = self.inner.locked();
            if inner.sent.as_ref() == Some(&info) {
                return;
            }
            inner.sent = Some(info.clone());
        }
        (self.emit)(&info);
    }

    /// Check now, as the candidate asked (Check now, Try again): its failure
    /// is shown, an automatic one's is not
    pub fn check(self: &Arc<Self>) {
        let this = self.clone();
        tauri::async_runtime::spawn(async move { this.run(true).await });
    }

    /// Automatic checks, for the life of the app: the first once it settled,
    /// then every few hours by the clock
    pub fn start(self: &Arc<Self>) {
        if !self.checks {
            return;
        }
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(FIRST_CHECK).await;
            loop {
                let next = this.inner.locked().next;
                if policy::due(next, SystemTime::now()) {
                    this.run(false).await;
                }
                tokio::time::sleep(TICK).await;
            }
        });
    }

    /// One check: a newer version is downloaded and kept, or said to be
    /// installed by hand
    async fn run(&self, asked: bool) {
        let Ok(_one) = self.checking.try_lock() else {
            // One under way: what it finds is shown as asked for
            self.inner.locked().asked |= asked;
            return;
        };
        {
            let mut inner = self.inner.locked();
            if matches!(inner.phase, Phase::Restarting(_) | Phase::Downloading { .. }) {
                return;
            }
            inner.asked = asked;
            if asked && matches!(inner.phase, Phase::Idle | Phase::Failed(_)) {
                inner.phase = Phase::Checking;
            }
        }
        self.refresh();
        let checked = self.source.check().await;
        let now = SystemTime::now();
        let found = match checked {
            Err(e) => return self.failed(e, now),
            Ok(None) => {
                // Nothing newer: a version kept from before was withdrawn
                stage::remove_except(&self.root, None);
                let mut inner = self.inner.locked();
                inner.phase = Phase::Idle;
                inner.checked_at = Some(crate::runtime::activity::now_ms());
                inner.next = Some(now + policy::EVERY);
                drop(inner);
                return self.refresh();
            }
            Ok(Some(found)) => found,
        };
        {
            let mut inner = self.inner.locked();
            inner.checked_at = Some(crate::runtime::activity::now_ms());
            inner.next = Some(now + policy::EVERY);
            match (&mut inner.phase, &self.install) {
                // Downloaded already: what the release says of it may have changed
                (Phase::Ready(staged), _) if staged.version == found.version => {
                    staged.release = found.release;
                    drop(inner);
                    return self.refresh();
                }
                (_, Install::Manual(reason)) => {
                    inner.phase = Phase::Manual { found, reason: reason.to_string() };
                    drop(inner);
                    return self.refresh();
                }
                _ => {
                    let kept = match std::mem::replace(&mut inner.phase, Phase::Idle) {
                        Phase::Ready(staged) => Some(staged),
                        _ => None,
                    };
                    inner.phase = Phase::Downloading { found: found.clone(), done: 0, total: None, kept };
                }
            }
        }
        self.refresh();
        let progress = |done: u64, total: Option<u64>| self.progress(done, total);
        let downloaded = self.source.download(&found, &progress).await;
        let bytes = match downloaded {
            Ok(bytes) => bytes,
            Err(e) => return self.failed(e, SystemTime::now()),
        };
        let staged = Staged { version: found.version, package: found.package, signature: found.signature, release: found.release };
        let root = self.root.clone();
        let keep = staged.clone();
        let saved = tokio::task::spawn_blocking(move || {
            stage::save(&root, &keep, &bytes)?;
            stage::remove_except(&root, Some(&keep.version));
            std::io::Result::Ok(())
        })
        .await;
        match saved {
            Ok(Ok(())) => {
                self.inner.locked().phase = Phase::Ready(staged);
                self.refresh();
            }
            Ok(Err(e)) => self.failed(AppError::io("keeping the update", e), SystemTime::now()),
            Err(e) => self.failed(AppError::internal("keeping the update", e), SystemTime::now()),
        }
    }

    fn progress(&self, done: u64, total: Option<u64>) {
        {
            let mut inner = self.inner.locked();
            let Phase::Downloading { done: d, total: t, .. } = &mut inner.phase else { return };
            (*d, *t) = (done, total);
            let finished = total.is_some_and(|t| done >= t);
            if inner.progress_sent.is_some_and(|at| at.elapsed() < PROGRESS_EVERY) && !finished {
                return;
            }
            inner.progress_sent = Some(Instant::now());
        }
        self.refresh();
    }

    /// A check or download failed: shown when it was asked for, and tried
    /// again in a while either way. An update ready before stays ready (the
    /// one it was found with failed to come down, or the check did)
    fn failed(&self, e: AppError, now: SystemTime) {
        tracing::warn!(error = %e, "checking for updates");
        {
            let mut inner = self.inner.locked();
            inner.next = Some(now + policy::RETRY);
            let asked = inner.asked;
            inner.phase = match std::mem::replace(&mut inner.phase, Phase::Idle) {
                Phase::Ready(staged) | Phase::Downloading { kept: Some(staged), .. } => Phase::Ready(staged),
                _ if asked => Phase::Failed(e.to_string()),
                _ => Phase::Idle,
            };
        }
        self.refresh();
    }

    /// Put the update (or a failed check) away until there is something new;
    /// a required update cannot be
    pub fn dismiss(&self) -> AppResult<()> {
        let key = dismiss_key(&self.info().status).ok_or_else(|| AppError::invalid("this cannot be put away"))?;
        {
            let mut inner = self.inner.locked();
            if matches!(inner.phase, Phase::Failed(_)) {
                inner.phase = Phase::Idle;
            } else {
                inner.dismissed = Some(key);
            }
        }
        self.refresh();
        Ok(())
    }

    /// Whether a new attempt may start: not while a newer version is
    /// required, nor while CKPro is restarting to install one
    pub fn allow_start(&self) -> AppResult<()> {
        match self.info().status {
            UpdateStatus::Restarting { version } => Err(AppError::busy(format!("CKPro is restarting to install {version}"))),
            UpdateStatus::Ready { required: true, version, .. } | UpdateStatus::Manual { required: true, version, .. } => {
                Err(AppError::update_required(&version))
            }
            _ => Ok(()),
        }
    }

    /// Install the downloaded update and start again on it, the environment
    /// left running. `prepare` runs before CKPro goes (the Windows installer
    /// ends it at once: the app's exit is not reached); `restart` starts it
    /// again where the update replaced it in place
    pub async fn restart(
        self: &Arc<Self>,
        prepare: impl Fn() + Send + Sync + 'static,
        restart: impl FnOnce() + Send + 'static,
    ) -> AppResult<()> {
        // Restarting first, then what holds it back: an attempt that starts
        // meanwhile is refused (`allow_start`), none slips in between
        let staged = {
            let mut inner = self.inner.locked();
            let Phase::Ready(staged) = &inner.phase else { return Err(AppError::invalid("no update is ready to install")) };
            let staged = staged.clone();
            inner.phase = Phase::Restarting(staged.version.clone());
            staged
        };
        if let Some(what) = self.held() {
            self.inner.locked().phase = Phase::Ready(staged);
            self.refresh();
            return Err(AppError::busy(format!("CKPro restarts to update after {what}")));
        }
        self.refresh();
        // From here the app's exit leaves the environment running
        self.restarting.store(true, Ordering::SeqCst);
        let this = self.clone();
        let release = staged.clone();
        let installed = tokio::task::spawn_blocking(move || {
            let bytes = std::fs::read(release.path(&this.root)).map_err(|e| AppError::io("reading the update", e))?;
            this.source.install(&release.release, &bytes, Box::new(prepare))
        })
        .await
        .unwrap_or_else(|e| Err(AppError::internal("installing the update", e)));
        match installed {
            Ok(()) => {
                restart();
                Ok(())
            }
            Err(e) => {
                self.restarting.store(false, Ordering::SeqCst);
                tracing::warn!(error = %e, "installing the update");
                self.inner.locked().phase = match self.install {
                    // The password was not given, or there is no way to: by hand
                    Install::Package => Phase::Manual { found: found_of(&staged), reason: format!("CKPro could not install it: {e}") },
                    _ => Phase::Ready(staged),
                };
                self.refresh();
                Err(e)
            }
        }
    }

    /// The app is restarting on an update: its exit leaves the environment
    pub fn restarting(&self) -> bool {
        self.restarting.load(Ordering::SeqCst)
    }

    /// What quitting does with a downloaded update: nothing while anything
    /// would be cut short (an attempt quit midway resumes on the version
    /// that started it), nor where installing asks first
    pub fn on_quit(&self) -> Option<OnQuit> {
        if self.restarting() || self.held().is_some() {
            return None;
        }
        let Phase::Ready(staged) = &self.inner.locked().phase else { return None };
        match self.install {
            // Only while it is still so: in place without asking
            Install::InPlace { on_quit: true } if (self.locate)() == self.install => Some(OnQuit::Now(staged.clone())),
            Install::Installer => Some(OnQuit::After(staged.version.clone())),
            _ => None,
        }
    }

    /// Install `staged` as the app quits (in place: a moment)
    pub fn install_now(&self, staged: &Staged) {
        let installed = std::fs::read(staged.path(&self.root))
            .map_err(|e| AppError::io("reading the update", e))
            .and_then(|bytes| self.source.install(&staged.release, &bytes, Box::new(|| {})));
        match installed {
            Ok(()) => tracing::info!(version = %staged.version, "installed as CKPro quit"),
            Err(e) => tracing::warn!(error = %e, "installing the update as CKPro quit"),
        }
    }
}

/// What the × puts away; none: it cannot be (a required update, a download)
fn dismiss_key(status: &UpdateStatus) -> Option<String> {
    match status {
        UpdateStatus::Ready { version, required: false, .. } => Some(format!("ready {version}")),
        UpdateStatus::Manual { version, required: false, .. } => Some(format!("manual {version}")),
        UpdateStatus::Failed { message } => Some(format!("failed {message}")),
        _ => None,
    }
}

fn notes(release: &serde_json::Value) -> String {
    release["notes"].as_str().unwrap_or_default().to_string()
}

fn found_of(staged: &Staged) -> Found {
    Found {
        version: staged.version.clone(),
        notes: notes(&staged.release),
        release: staged.release.clone(),
        package: staged.package.clone(),
        signature: staged.signature.clone(),
    }
}

/// Where this copy is, as far as installing goes (`policy::install`)
pub fn place(appimage: Option<&Path>) -> policy::Place {
    let bundle = tauri::utils::platform::bundle_type();
    let mut place = policy::Place { bundle: bundle.clone(), ..policy::Place::default() };
    match bundle {
        Some(tauri::utils::config::BundleType::App) => {
            // …/CKPro.app/Contents/MacOS/ckpro
            let app = std::env::current_exe()
                .ok()
                .and_then(|exe| exe.ancestors().nth(3).map(Path::to_path_buf))
                .filter(|app| app.extension().is_some_and(|e| e == "app"));
            if let Some(app) = app {
                let writable = app.parent().is_some_and(writable);
                place.writable = Some(writable);
                // Moved aside by the system until it is put in Applications,
                // or run from the disk image
                let path = app.to_string_lossy();
                place.transient = path.contains("/AppTranslocation/") || (path.starts_with("/Volumes/") && !writable);
            }
        }
        Some(tauri::utils::config::BundleType::AppImage) => {
            place.writable = appimage.and_then(Path::parent).map(writable);
        }
        Some(tauri::utils::config::BundleType::Deb) => {
            let mut dirs = crate::platform::path_dirs();
            dirs.extend([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]);
            place.asks_password = ["pkexec", "zenity", "kdialog"].iter().any(|p| crate::platform::find_program(&dirs, p).is_some());
        }
        _ => {}
    }
    place
}

/// Whether CKPro may write in `dir` without asking (tried, not guessed from
/// modes: ACLs, read-only volumes)
fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".ckpro-update-{}", std::process::id()));
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(_) => std::fs::remove_file(&probe).is_ok(),
        Err(_) => false,
    }
}

/// `ckpro quit --install <version>`: once the app (`after`) is gone and its
/// containers are stopped, run the installer kept for `version`, its
/// signature checked again, and leave it to finish on its own (passive: a
/// progress window, no questions; the app is not started again)
pub fn install_after_quit(root: &Path, version: &str, after: Option<u32>) -> AppResult<()> {
    if let Some(pid) = after {
        let deadline = Instant::now() + Duration::from_secs(60);
        while crate::platform::process_alive(pid) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(200));
        }
    }
    let staged =
        stage::load(root).filter(|s| s.version == version).ok_or_else(|| AppError::not_found(format!("no update {version} is kept")))?;
    let path = staged.path(root);
    let bytes = std::fs::read(&path).map_err(|e| AppError::io("reading the update", e))?;
    source::verify_signed(&source::public_key(), &staged.signature, &staged.version, &bytes)?;
    crate::platform::std_command(&path)
        .args(["/P", "/UPDATE"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(drop)
        .map_err(|e| AppError::io("starting the installer", e))
}

#[cfg(test)]
mod tests;
