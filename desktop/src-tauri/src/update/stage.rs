//! The downloaded update, kept in the data directory until it is installed,
//! so a restart of CKPro does not download it again: `updates/<version>/`
//! holds the package (named as released) and `staged.json` (the version,
//! the package's name and signature, and the release as latest.json said
//! it), written last: a download stopped midway leaves no `staged.json`,
//! and its folder is removed.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

const MARKER: &str = "staged.json";

/// A whole download, as `staged.json` says it
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Staged {
    pub version: String,
    /// The package's file name in the version's folder
    pub package: String,
    /// Its signature, as latest.json gave it
    pub signature: String,
    /// latest.json, as the check read it
    pub release: serde_json::Value,
}

impl Staged {
    /// Where the package is, under `root`
    pub fn path(&self, root: &Path) -> PathBuf {
        root.join(&self.version).join(&self.package)
    }
}

/// One plain name: nothing a release could use to write elsewhere
fn plain(name: &str) -> bool {
    let mut parts = Path::new(name).components();
    matches!((parts.next(), parts.next()), (Some(Component::Normal(_)), None)) && !name.contains(['/', '\\'])
}

/// Keep `bytes` as `staged`'s package under `root`, then its marker; what an
/// earlier try of the same version left is replaced
pub fn save(root: &Path, staged: &Staged, bytes: &[u8]) -> std::io::Result<()> {
    if !plain(&staged.version) || !plain(&staged.package) || staged.package == MARKER {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "an update named outside its folder"));
    }
    let dir = root.join(&staged.version);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    write(&dir.join(&staged.package), bytes)?;
    write(&dir.join(MARKER), &serde_json::to_vec(staged).map_err(std::io::Error::other)?)
}

/// `bytes` to `path` whole or not at all (written beside it, then renamed)
fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let part = path.with_extension("part");
    std::fs::write(&part, bytes)?;
    std::fs::rename(&part, path)
}

/// The newest whole download under `root`, if any: folders with no marker,
/// an unreadable one or no package are removed on the way
pub fn load(root: &Path) -> Option<Staged> {
    let mut found: Vec<(semver::Version, Staged)> = Vec::new();
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let dir = entry.path();
        let staged = std::fs::read(dir.join(MARKER))
            .ok()
            .and_then(|json| serde_json::from_slice::<Staged>(&json).ok())
            .filter(|s| entry.file_name().to_str() == Some(s.version.as_str()) && plain(&s.package))
            .filter(|s| dir.join(&s.package).is_file());
        match staged.and_then(|s| semver::Version::parse(&s.version).ok().map(|v| (v, s))) {
            Some(found_here) => found.push(found_here),
            None => {
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    }
    found.into_iter().max_by(|a, b| a.0.cmp(&b.0)).map(|(_, s)| s)
}

/// Remove every download under `root` but `keep`'s (none: all of them)
pub fn remove_except(root: &Path, keep: Option<&str>) {
    for entry in std::fs::read_dir(root).into_iter().flatten().flatten() {
        if keep.is_none_or(|k| entry.file_name().to_str() != Some(k)) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn staged(version: &str) -> Staged {
        Staged {
            version: version.into(),
            package: "ckpro_linux-x64_0.4.0.AppImage".into(),
            signature: "sig".into(),
            release: serde_json::json!({ "version": version }),
        }
    }

    fn root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ckpro-stage-{}-{}", std::process::id(), rand::random::<u32>()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_download_kept_is_found_again_newest_first() {
        let root = root();
        save(&root, &staged("0.4.0"), b"old").unwrap();
        save(&root, &staged("0.5.0"), b"new").unwrap();
        let found = load(&root).unwrap();
        assert_eq!(found, staged("0.5.0"));
        assert_eq!(std::fs::read(found.path(&root)).unwrap(), b"new");
        remove_except(&root, Some("0.5.0"));
        assert!(!root.join("0.4.0").exists());
        assert!(root.join("0.5.0").exists());
        remove_except(&root, None);
        assert!(load(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_download_stopped_midway_is_removed() {
        let root = root();
        // The package came, its marker did not
        std::fs::create_dir_all(root.join("0.4.0")).unwrap();
        std::fs::write(root.join("0.4.0/ckpro.AppImage"), b"half").unwrap();
        // A marker whose package is gone
        save(&root, &staged("0.5.0"), b"x").unwrap();
        std::fs::remove_file(staged("0.5.0").path(&root)).unwrap();
        // A marker that says another version than its folder
        save(&root, &staged("0.6.0"), b"x").unwrap();
        std::fs::rename(root.join("0.6.0"), root.join("0.7.0")).unwrap();
        assert!(load(&root).is_none());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_release_cannot_name_a_place_outside_its_folder() {
        let root = root();
        for (version, package) in [("../0.4.0", "p"), ("0.4.0", "../p"), ("0.4.0", "a/b"), ("0.4.0", "a\\b"), ("0.4.0", MARKER), ("", "p")]
        {
            let s = Staged { version: version.into(), package: package.into(), ..staged("0.4.0") };
            assert!(save(&root, &s, b"x").is_err(), "{version} {package}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }
}
