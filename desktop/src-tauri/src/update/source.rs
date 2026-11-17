//! Where updates come from: the latest GitHub release's latest.json, read,
//! downloaded and installed through Tauri's updater plugin, which checks each
//! package's signature against the public key in tauri.conf.json. Behind
//! `Source` so the updater's states are tested without the network.

use crate::error::{AppError, AppResult};
use base64::Engine as _;
use futures_util::future::BoxFuture;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// A check that hangs (a connection that died while the computer slept)
/// gives up after this
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// Connecting, and then each read of a download: a download as long as it
/// takes, but not one that stopped arriving
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const READ_TIMEOUT: Duration = Duration::from_secs(60);

/// A newer version the release announces, for this copy's bundle
#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub version: String,
    /// What it brings (Markdown)
    pub notes: String,
    /// latest.json as read: its own fields (`minimum_version`) and what
    /// restores the update later without the network
    pub release: serde_json::Value,
    /// The package's file name, as released
    pub package: String,
    pub signature: String,
}

/// How far a download is: bytes so far, and all of them when known
pub type Progress<'a> = &'a (dyn Fn(u64, Option<u64>) + Send + Sync);

pub trait Source: Send + Sync + 'static {
    /// A newer version, if the release has one for this copy
    fn check(&self) -> BoxFuture<'_, AppResult<Option<Found>>>;
    /// `found`'s package, its signature checked
    fn download<'a>(&'a self, found: &'a Found, progress: Progress<'a>) -> BoxFuture<'a, AppResult<Vec<u8>>>;
    /// Whether `bytes` (kept from an earlier run) are still `release`'s
    /// package, signed for its version
    fn verify(&self, release: &serde_json::Value, bytes: &[u8]) -> AppResult<()>;
    /// Install `bytes` (signature checked again). The Windows installer ends
    /// this process: `before_exit` runs first
    fn install(&self, release: &serde_json::Value, bytes: &[u8], before_exit: Box<dyn Fn() + Send + Sync>) -> AppResult<()>;
}

/// The release, through the updater plugin
pub struct Release {
    app: AppHandle,
    /// Another latest.json (development builds only: `CKPRO_UPDATE_URL`)
    endpoint: Option<tauri::Url>,
}

impl Release {
    pub fn new(app: AppHandle, endpoint: Option<tauri::Url>) -> Self {
        Self { app, endpoint }
    }

    fn updater(&self, before_exit: Option<Box<dyn Fn() + Send + Sync>>) -> AppResult<tauri_plugin_updater::Updater> {
        let mut builder = self
            .app
            .updater_builder()
            .timeout(CHECK_TIMEOUT)
            .configure_client(|client| client.connect_timeout(CONNECT_TIMEOUT).read_timeout(READ_TIMEOUT));
        if let Some(url) = &self.endpoint {
            builder = builder.endpoints(vec![url.clone()]).map_err(failed)?;
        }
        if let Some(before_exit) = before_exit {
            builder = builder.on_before_exit(before_exit);
        }
        builder.build().map_err(failed)
    }

    /// `release`'s update, as the check found it; none: no longer newer
    fn restore(
        &self,
        release: &serde_json::Value,
        before_exit: Option<Box<dyn Fn() + Send + Sync>>,
    ) -> AppResult<tauri_plugin_updater::Update> {
        self.updater(before_exit)?
            .restore_update(release.clone())
            .map_err(failed)?
            .ok_or_else(|| AppError::update("this version is no longer newer than CKPro"))
    }
}

impl Source for Release {
    fn check(&self) -> BoxFuture<'_, AppResult<Option<Found>>> {
        Box::pin(async move {
            let Some(update) = self.updater(None)?.check().await.map_err(failed)? else { return Ok(None) };
            let package = update.download_url.path_segments().and_then(|mut s| s.next_back()).unwrap_or_default().to_string();
            Ok(Some(Found {
                version: update.version,
                notes: update.body.unwrap_or_default(),
                release: update.raw_json,
                package,
                signature: update.signature,
            }))
        })
    }

    fn download<'a>(&'a self, found: &'a Found, progress: Progress<'a>) -> BoxFuture<'a, AppResult<Vec<u8>>> {
        Box::pin(async move {
            let update = self.restore(&found.release, None)?;
            let mut done = 0u64;
            update
                .download(
                    |chunk, total| {
                        done += chunk as u64;
                        progress(done, total);
                    },
                    || {},
                )
                .await
                .map_err(failed)
        })
    }

    fn verify(&self, release: &serde_json::Value, bytes: &[u8]) -> AppResult<()> {
        self.restore(release, None)?.verify(bytes).map_err(failed)
    }

    fn install(&self, release: &serde_json::Value, bytes: &[u8], before_exit: Box<dyn Fn() + Send + Sync>) -> AppResult<()> {
        self.restore(release, Some(before_exit))?.install(bytes).map_err(failed)
    }
}

/// What failed, as the candidate reads it
fn failed(e: tauri_plugin_updater::Error) -> AppError {
    use tauri_plugin_updater::Error as E;
    let message = match &e {
        E::Reqwest(e) if e.is_timeout() => "GitHub did not answer in time".into(),
        E::Reqwest(e) if e.is_connect() => "CKPro could not reach GitHub".into(),
        E::Network(status) => format!("GitHub refused the download ({status})"),
        E::ReleaseNotFound => "GitHub has no release to update to".into(),
        E::TargetNotFound(_) | E::TargetsNotFound(_) => "the release has nothing for this computer".into(),
        E::Minisign(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion | E::Base64(_) | E::SignatureUtf8(_) => {
            "the update's signature does not match: it was not installed".into()
        }
        E::AuthenticationFailed => "the password was not given".into(),
        E::PackageInstallFailed | E::DebInstallFailed => "the package could not be installed".into(),
        _ => e.to_string(),
    };
    AppError::update(message)
}

/// The public key updates are signed for, as tauri.conf.json has it (one
/// place for the app and `ckpro quit`, which has no Tauri context)
pub fn public_key() -> String {
    let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap_or_default();
    config["plugins"]["updater"]["pubkey"].as_str().unwrap_or_default().to_string()
}

/// Whether `bytes` are signed by `public_key` (base64, as tauri.conf.json
/// has it) with `signature` (base64, as latest.json has it), for `version`:
/// what the updater checks, done again before `ckpro quit` runs an installer
pub fn verify_signed(public_key: &str, signature: &str, version: &str, bytes: &[u8]) -> AppResult<()> {
    let bad = |what: &str| AppError::update(format!("the update's signature does not match ({what}): it was not installed"));
    let text =
        |b64: &str| base64::engine::general_purpose::STANDARD.decode(b64.trim()).ok().and_then(|bytes| String::from_utf8(bytes).ok());
    let key = text(public_key).and_then(|k| minisign_verify::PublicKey::decode(&k).ok()).ok_or_else(|| bad("no public key"))?;
    let signature = text(signature).and_then(|s| minisign_verify::Signature::decode(&s).ok()).ok_or_else(|| bad("unreadable"))?;
    key.verify(bytes, &signature, true).map_err(|_| bad("not this package"))?;
    // Signed for this version: an older package cannot pass for a newer one
    let signed = signature.trusted_comment().split('\t').find_map(|field| field.strip_prefix("version:"));
    if signed != Some(version) {
        return Err(bad("another version"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = include_str!("testdata/test.key.pub");
    const PACKAGE: &[u8] = include_bytes!("testdata/package.bin");
    const SIGNATURE: &str = include_str!("testdata/package.bin.sig");

    #[test]
    fn a_package_signed_for_its_version_passes() {
        verify_signed(KEY, SIGNATURE, "0.4.0", PACKAGE).unwrap();
    }

    #[test]
    fn anything_else_is_refused() {
        // Another package, another version, no key, another key, no signature
        assert!(verify_signed(KEY, SIGNATURE, "0.4.0", b"changed").is_err());
        assert!(verify_signed(KEY, SIGNATURE, "0.5.0", PACKAGE).is_err());
        assert!(verify_signed("", SIGNATURE, "0.4.0", PACKAGE).is_err());
        let other = base64::engine::general_purpose::STANDARD
            .encode("untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n");
        assert!(verify_signed(&other, SIGNATURE, "0.4.0", PACKAGE).is_err());
        assert!(verify_signed(KEY, "", "0.4.0", PACKAGE).is_err());
    }

    #[test]
    fn the_app_and_ckpro_quit_read_one_public_key() {
        // Empty until the release key is set: nothing then installs
        let key = public_key();
        assert!(key.is_empty() || verify_signed(&key, SIGNATURE, "0.4.0", PACKAGE).is_err());
    }
}
