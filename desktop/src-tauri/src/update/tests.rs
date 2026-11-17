//! The updater's states, against a release stood in for (`Fake`): what a
//! check finds, downloads, keeps and installs, and what holds it back.

use super::*;
use crate::lab::exam::Mode;
use futures_util::future::BoxFuture;
use serde_json::json;

/// A release that answers as told, and remembers what was installed
#[derive(Default)]
struct Fake {
    check: Mutex<Option<AppResult<Option<Found>>>>,
    download: Mutex<Option<AppResult<Vec<u8>>>>,
    install: Mutex<Option<AppError>>,
    verify: Mutex<Option<AppError>>,
    installed: Mutex<Vec<String>>,
}

impl Source for Arc<Fake> {
    fn check(&self) -> BoxFuture<'_, AppResult<Option<Found>>> {
        Box::pin(async move { self.check.locked().take().unwrap_or(Ok(None)) })
    }
    fn download<'a>(&'a self, _: &'a Found, progress: source::Progress<'a>) -> BoxFuture<'a, AppResult<Vec<u8>>> {
        Box::pin(async move {
            progress(1, Some(2));
            progress(2, Some(2));
            self.download.locked().take().unwrap_or_else(|| Ok(b"package".to_vec()))
        })
    }
    fn verify(&self, _: &serde_json::Value, _: &[u8]) -> AppResult<()> {
        self.verify.locked().take().map_or(Ok(()), Err)
    }
    fn install(&self, release: &serde_json::Value, _: &[u8], before_exit: Box<dyn Fn() + Send + Sync>) -> AppResult<()> {
        if let Some(e) = self.install.locked().take() {
            return Err(e);
        }
        before_exit();
        self.installed.locked().push(release["version"].as_str().unwrap_or_default().to_string());
        Ok(())
    }
}

fn found(version: &str, minimum: Option<&str>, package: &str) -> Found {
    let mut release = json!({ "version": version, "notes": "- **Calendar:** a week at once" });
    if let Some(minimum) = minimum {
        release["minimum_version"] = json!(minimum);
    }
    Found {
        version: version.into(),
        notes: "- **Calendar:** a week at once".into(),
        release,
        package: package.into(),
        signature: "sig".into(),
    }
}

struct Run {
    updater: Arc<Updater>,
    fake: Arc<Fake>,
    sent: Arc<Mutex<Vec<UpdateInfo>>>,
    root: PathBuf,
}

impl Drop for Run {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn run_at(root: PathBuf, install: Install) -> Run {
    run_located(root, move || install.clone())
}

/// A run whose copy may move (`locate` asked again as the app quits)
fn run_located(root: PathBuf, locate: impl Fn() -> Install + Send + Sync + 'static) -> Run {
    let fake = Arc::new(Fake::default());
    let sent = Arc::new(Mutex::new(Vec::new()));
    let log = sent.clone();
    let updater = Updater::new(Box::new(fake.clone()), locate, Version::new(0, 3, 2), root.clone(), true, move |info| {
        log.locked().push(info.clone())
    });
    Run { updater, fake, sent, root }
}

fn run(install: Install) -> Run {
    run_at(std::env::temp_dir().join(format!("ckpro-updates-{}-{}", std::process::id(), rand::random::<u32>())), install)
}

const IN_PLACE: Install = Install::InPlace { on_quit: true };

fn status(run: &Run) -> UpdateStatus {
    run.updater.info().status
}

#[tokio::test]
async fn a_newer_version_is_downloaded_kept_and_ready() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    assert!(
        matches!(status(&r), UpdateStatus::Ready { ref version, required: false, blocked: None, on_quit: true, .. } if version == "0.4.0")
    );
    // Shown as it came down, without a "checking" it was not asked for
    let sent = r.sent.locked().clone();
    assert!(sent.iter().any(|i| matches!(i.status, UpdateStatus::Downloading { done, total: Some(_), .. } if done > 0.0)));
    assert!(!sent.iter().any(|i| matches!(i.status, UpdateStatus::Checking)));
    // Kept: the next run has it ready without the network
    let again = run_at(r.root.clone(), IN_PLACE);
    again.updater.restore(Some("0.3.2"));
    assert!(matches!(status(&again), UpdateStatus::Ready { ref version, .. } if version == "0.4.0"));
}

#[tokio::test]
async fn a_failed_check_is_shown_only_when_asked_for() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Err(AppError::update("GitHub did not answer in time")));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Idle { checked_at: None }));
    // Tried again soon, not in six hours
    let next = r.updater.inner.locked().next.unwrap();
    assert!(next <= SystemTime::now() + policy::RETRY);

    *r.fake.check.locked() = Some(Err(AppError::update("GitHub did not answer in time")));
    r.updater.run(true).await;
    assert!(r.sent.locked().iter().any(|i| matches!(i.status, UpdateStatus::Checking)));
    assert!(matches!(status(&r), UpdateStatus::Failed { ref message } if message.contains("did not answer")));
    // Put away: back to idle
    r.updater.dismiss().unwrap();
    assert!(matches!(status(&r), UpdateStatus::Idle { .. }));
}

#[tokio::test]
async fn a_failed_download_is_tried_again_later() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    *r.fake.download.locked() = Some(Err(AppError::update("CKPro could not reach GitHub")));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Idle { .. }));
    assert!(stage::load(&r.root).is_none());
}

#[tokio::test]
async fn nothing_newer_leaves_it_idle_and_drops_a_withdrawn_version() {
    let r = run(IN_PLACE);
    let kept = Staged { version: "0.4.0".into(), package: "p".into(), signature: "s".into(), release: json!({}) };
    std::fs::create_dir_all(&r.root).unwrap();
    stage::save(&r.root, &kept, b"x").unwrap();
    r.updater.restore(None);
    assert!(matches!(status(&r), UpdateStatus::Ready { .. }));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Idle { checked_at: Some(_) }));
    assert!(stage::load(&r.root).is_none());
}

#[tokio::test]
async fn a_required_version_stops_new_attempts_and_cannot_be_put_away() {
    let r = run(IN_PLACE);
    assert!(r.updater.allow_start().is_ok());
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", Some("0.4.0"), "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Ready { required: true, .. }));
    assert!(matches!(r.updater.allow_start(), Err(AppError::UpdateRequired { .. })));
    assert!(r.updater.dismiss().is_err());
    // The release lowers its minimum: optional again, without a download
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", Some("0.3.0"), "CKPro.app.tar.gz"))));
    *r.fake.download.locked() = Some(Err(AppError::update("not downloaded again")));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Ready { required: false, .. }));
    assert!(r.updater.allow_start().is_ok());
}

#[tokio::test]
async fn an_attempt_holds_the_restart_and_the_install_on_quit() {
    let r = run(IN_PLACE);
    let busy = Arc::new(Mutex::new(Busy { attempt: Some(Mode::Exam), ..Busy::default() }));
    let reading = busy.clone();
    r.updater.watch(move || *reading.locked());
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    assert!(matches!(status(&r), UpdateStatus::Ready { blocked: Some(ref b), .. } if b == "your exam"));
    assert!(matches!(r.updater.restart(|| {}, || {}).await, Err(AppError::Busy { .. })));
    assert_eq!(r.updater.on_quit(), None);
    assert!(r.fake.installed.locked().is_empty());
    // The attempt ended: the interface is told, and quitting installs it
    *busy.locked() = Busy::default();
    r.updater.refresh();
    assert!(matches!(r.sent.locked().last().unwrap().status, UpdateStatus::Ready { blocked: None, .. }));
    assert!(matches!(r.updater.on_quit(), Some(OnQuit::Now(ref s)) if s.version == "0.4.0"));
}

#[tokio::test]
async fn a_restart_installs_and_leaves_the_environment_running() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    let (prepared, restarted) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
    let (p, s) = (prepared.clone(), restarted.clone());
    r.updater.restart(move || p.store(true, Ordering::SeqCst), move || s.store(true, Ordering::SeqCst)).await.unwrap();
    assert!(prepared.load(Ordering::SeqCst) && restarted.load(Ordering::SeqCst));
    assert_eq!(*r.fake.installed.locked(), vec!["0.4.0".to_string()]);
    // The app's exit leaves the containers, and installs nothing again
    assert!(r.updater.restarting());
    assert_eq!(r.updater.on_quit(), None);
    assert!(matches!(status(&r), UpdateStatus::Restarting { .. }));
}

#[tokio::test]
async fn a_restart_that_fails_keeps_the_update() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    *r.fake.install.locked() = Some(AppError::update("the password was not given"));
    assert!(r.updater.restart(|| {}, || {}).await.is_err());
    assert!(!r.updater.restarting());
    assert!(matches!(status(&r), UpdateStatus::Ready { .. }));
}

#[tokio::test]
async fn a_package_that_cannot_be_installed_is_left_to_the_candidate() {
    let r = run(Install::Package);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "ckpro_linux-x64_0.4.0_amd64.deb"))));
    r.updater.run(false).await;
    // Never installed unasked
    assert_eq!(r.updater.on_quit(), None);
    *r.fake.install.locked() = Some(AppError::update("the package could not be installed"));
    assert!(r.updater.restart(|| {}, || {}).await.is_err());
    let UpdateStatus::Manual { reason, command, url, .. } = status(&r) else { panic!("{:?}", status(&r)) };
    assert!(reason.contains("could not be installed"));
    assert_eq!(command.as_deref(), Some("sudo apt install ./ckpro_linux-x64_0.4.0_amd64.deb"));
    assert!(url.ends_with("/tag/v0.4.0"));
}

#[tokio::test]
async fn a_copy_that_cannot_update_itself_says_so_without_downloading() {
    let r = run(Install::Manual("CKPro cannot write to the folder its AppImage is in"));
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "ckpro_linux-x64_0.4.0.AppImage"))));
    *r.fake.download.locked() = Some(Err(AppError::update("downloaded")));
    r.updater.run(false).await;
    let UpdateStatus::Manual { reason, command: None, .. } = status(&r) else { panic!("{:?}", status(&r)) };
    assert!(reason.contains("AppImage"));
    assert!(r.updater.restart(|| {}, || {}).await.is_err());
}

#[tokio::test]
async fn the_windows_installer_runs_after_quitting() {
    let r = run(Install::Installer);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "ckpro_windows-x64_0.4.0_x64-setup.exe"))));
    r.updater.run(false).await;
    assert_eq!(r.updater.on_quit(), Some(OnQuit::After("0.4.0".into())));
}

#[tokio::test]
async fn an_update_put_away_comes_back_with_a_newer_one() {
    let r = run(IN_PLACE);
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    r.updater.dismiss().unwrap();
    assert!(r.updater.info().dismissed);
    // Still installed as CKPro quits
    assert!(r.updater.on_quit().is_some());
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.1", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    assert!(!r.updater.info().dismissed);
}

#[tokio::test]
async fn an_update_is_said_once_after_it_installed() {
    let r = run(IN_PLACE);
    r.updater.restore(Some("0.3.0"));
    assert_eq!(r.updater.state().updated_from.as_deref(), Some("0.3.0"));
    assert_eq!(r.updater.state().updated_from, None);
    // The same version, or an older one put back: nothing to say
    for previous in [Some("0.3.2"), Some("0.4.0"), None, Some("unreadable")] {
        let r = run(IN_PLACE);
        r.updater.restore(previous);
        assert_eq!(r.updater.state().updated_from, None, "{previous:?}");
    }
}

#[tokio::test]
async fn a_kept_download_that_no_longer_verifies_is_removed() {
    let r = run(IN_PLACE);
    std::fs::create_dir_all(&r.root).unwrap();
    let kept = Staged { version: "0.4.0".into(), package: "p".into(), signature: "s".into(), release: json!({}) };
    stage::save(&r.root, &kept, b"x").unwrap();
    *r.fake.verify.locked() = Some(AppError::update("the update's signature does not match"));
    r.updater.restore(None);
    assert!(matches!(status(&r), UpdateStatus::Idle { .. }));
    assert!(stage::load(&r.root).is_none());
    // One already installed (not newer) is removed as well
    let older = Staged { version: "0.3.2".into(), ..kept };
    stage::save(&r.root, &older, b"x").unwrap();
    r.updater.restore(None);
    assert!(stage::load(&r.root).is_none());
}

#[tokio::test]
async fn a_folder_no_longer_writable_installs_nothing_as_ckpro_quits() {
    let writable = Arc::new(AtomicBool::new(true));
    let now = writable.clone();
    let root = std::env::temp_dir().join(format!("ckpro-updates-{}-{}", std::process::id(), rand::random::<u32>()));
    let r = run_located(root, move || Install::InPlace { on_quit: now.load(Ordering::SeqCst) });
    *r.fake.check.locked() = Some(Ok(Some(found("0.4.0", None, "CKPro.app.tar.gz"))));
    r.updater.run(false).await;
    assert!(r.updater.on_quit().is_some());
    // Made read-only since: installing as the app quits would ask for a
    // password nobody sees; it waits for a restart instead
    writable.store(false, Ordering::SeqCst);
    assert_eq!(r.updater.on_quit(), None);
}
