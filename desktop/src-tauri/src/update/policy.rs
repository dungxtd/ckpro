//! What the updater decides, without doing anything: whether a release is
//! required, when to check again, what holds a restart back, and how this
//! copy of CKPro installs a new version. Pure, so each rule is tested alone.

use crate::lab::exam::Mode;
use semver::Version;
use std::time::{Duration, SystemTime};
use tauri::utils::config::BundleType;

/// Between automatic checks
pub const EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// A check or download that failed on its own is tried again after this
pub const RETRY: Duration = Duration::from_secs(10 * 60);

/// Whether the release requires a newer version than `current`: its
/// `minimum_version` (latest.json) is above it. Absent or unreadable: not
/// required (the release is optional)
pub fn required(current: &Version, raw: &serde_json::Value) -> bool {
    raw.get("minimum_version")
        .and_then(|v| v.as_str())
        .and_then(|v| Version::parse(v.trim().trim_start_matches('v')).ok())
        .is_some_and(|minimum| *current < minimum)
}

/// Whether a check is due at `now`, the next one being at `next` (none:
/// never checked). A clock set back is not waited out
pub fn due(next: Option<SystemTime>, now: SystemTime) -> bool {
    next.is_none_or(|next| now >= next || next.duration_since(now).is_ok_and(|left| left > EVERY))
}

/// What is going on that a restart would cut short
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Busy {
    /// An attempt from its start to its result, in this mode
    pub attempt: Option<Mode>,
    /// An attempt kept to be resumed or graded again (a failed resume)
    pub kept: bool,
    /// Create proving an exam
    pub proving: bool,
    /// A long operation (a cluster made, repaired, the environment started)
    pub activity: bool,
}

/// What holds a restart back, as "it installs after …" says it; none: free
pub fn held_by(busy: &Busy) -> Option<&'static str> {
    match busy.attempt {
        Some(Mode::Exam) => Some("your exam"),
        Some(Mode::Practice) => Some("your attempt"),
        None if busy.kept => Some("your attempt"),
        None if busy.proving => Some("the proof"),
        None if busy.activity => Some("what is running"),
        None => None,
    }
}

/// How this copy of CKPro installs a new version
#[derive(Clone, Debug, PartialEq)]
pub enum Install {
    /// Replaced where it is (a macOS app, an AppImage): at a restart, and as
    /// CKPro quits when its folder can be written without asking
    InPlace { on_quit: bool },
    /// The Windows installer: at a restart, or run by `ckpro quit` once the
    /// app has quit and its containers are stopped
    Installer,
    /// The .deb, installed as root (pkexec asks for the password): at a
    /// restart only, never unasked as CKPro quits
    Package,
    /// It cannot update itself: why, for the candidate
    Manual(&'static str),
}

impl Install {
    /// It installs as CKPro quits (no restart asked)
    pub fn on_quit(&self) -> bool {
        matches!(self, Install::InPlace { on_quit: true } | Install::Installer)
    }
}

/// Where this copy is, as far as installing goes
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Place {
    /// The bundle it runs from (the patched bundle type; macOS is always an
    /// app bundle)
    pub bundle: Option<BundleType>,
    /// The bundle's folder can be written without asking (the folder of the
    /// .app or the AppImage); none: not found
    pub writable: Option<bool>,
    /// A macOS app run from where it cannot stay (a disk image, or moved
    /// aside by the system until it is put in Applications)
    pub transient: bool,
    /// A program that asks for the password is there (pkexec, zenity, kdialog)
    pub asks_password: bool,
}

/// How a copy at `place` installs updates
pub fn install(place: &Place) -> Install {
    match place.bundle {
        Some(BundleType::App) if place.transient => Install::Manual("Move CKPro to Applications to update it"),
        Some(BundleType::App) => match place.writable {
            Some(writable) => Install::InPlace { on_quit: writable },
            // Not in an app bundle (a development run)
            None => Install::Manual("This copy of CKPro was not installed from a release"),
        },
        Some(BundleType::AppImage) => match place.writable {
            Some(true) => Install::InPlace { on_quit: true },
            _ => Install::Manual("CKPro cannot write to the folder its AppImage is in"),
        },
        Some(BundleType::Nsis) => Install::Installer,
        Some(BundleType::Deb) if place.asks_password => Install::Package,
        Some(BundleType::Deb) => Install::Manual("This computer has no way to ask for your password (pkexec is missing)"),
        _ => Install::Manual("This copy of CKPro was not installed from a release"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn a_release_is_required_only_above_this_version() {
        let raw = |min: &str| json!({ "version": "0.5.0", "minimum_version": min });
        assert!(required(&v("0.3.2"), &raw("0.4.0")));
        assert!(required(&v("0.3.2"), &raw("v0.4.0")));
        assert!(!required(&v("0.4.0"), &raw("0.4.0")));
        assert!(!required(&v("0.4.1"), &raw("0.4.0")));
        // Absent or unreadable: optional
        assert!(!required(&v("0.3.2"), &json!({ "version": "0.5.0" })));
        assert!(!required(&v("0.3.2"), &raw("soon")));
        assert!(!required(&v("0.3.2"), &json!({ "minimum_version": 4 })));
    }

    #[test]
    fn a_check_is_due_when_its_time_comes_or_the_clock_went_back() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        assert!(due(None, now));
        assert!(due(Some(now), now));
        assert!(due(Some(now - Duration::from_secs(1)), now));
        assert!(!due(Some(now + Duration::from_secs(60)), now));
        assert!(!due(Some(now + EVERY), now));
        // Further away than a whole wait: the clock was set back
        assert!(due(Some(now + EVERY + Duration::from_secs(60)), now));
    }

    #[test]
    fn an_attempt_holds_a_restart_before_anything_else() {
        assert_eq!(held_by(&Busy::default()), None);
        let all = Busy { attempt: Some(Mode::Exam), kept: true, proving: true, activity: true };
        assert_eq!(held_by(&all), Some("your exam"));
        assert_eq!(held_by(&Busy { attempt: Some(Mode::Practice), ..all }), Some("your attempt"));
        assert_eq!(held_by(&Busy { attempt: None, ..all }), Some("your attempt"));
        assert_eq!(held_by(&Busy { proving: true, ..Busy::default() }), Some("the proof"));
        assert_eq!(held_by(&Busy { activity: true, ..Busy::default() }), Some("what is running"));
    }

    #[test]
    fn each_bundle_installs_its_own_way() {
        let at = |bundle, writable| Place { bundle: Some(bundle), writable, ..Place::default() };
        assert_eq!(install(&at(BundleType::App, Some(true))), Install::InPlace { on_quit: true });
        // /Applications not writable: a restart asks for the password, quitting does not
        assert_eq!(install(&at(BundleType::App, Some(false))), Install::InPlace { on_quit: false });
        assert!(matches!(install(&at(BundleType::App, None)), Install::Manual(_)));
        assert!(matches!(install(&Place { transient: true, ..at(BundleType::App, Some(true)) }), Install::Manual(_)));
        assert_eq!(install(&at(BundleType::AppImage, Some(true))), Install::InPlace { on_quit: true });
        assert!(matches!(install(&at(BundleType::AppImage, Some(false))), Install::Manual(_)));
        assert_eq!(install(&at(BundleType::Nsis, None)), Install::Installer);
        assert_eq!(install(&Place { asks_password: true, ..at(BundleType::Deb, None) }), Install::Package);
        assert!(matches!(install(&at(BundleType::Deb, None)), Install::Manual(_)));
        // Built from source, an rpm or msi nobody shipped: by hand
        assert!(matches!(install(&Place::default()), Install::Manual(_)));
        assert!(matches!(install(&at(BundleType::Msi, None)), Install::Manual(_)));
    }

    #[test]
    fn only_some_installs_happen_as_ckpro_quits() {
        assert!(Install::InPlace { on_quit: true }.on_quit());
        assert!(Install::Installer.on_quit());
        assert!(!Install::InPlace { on_quit: false }.on_quit());
        assert!(!Install::Package.on_quit());
        assert!(!Install::Manual("").on_quit());
    }
}
