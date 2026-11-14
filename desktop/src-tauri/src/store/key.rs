//! The app database's key, bound to this computer: derived from the
//! computer's own id (`platform::machine_id`) and a random salt made once
//! per installation, kept beside the database. The database cannot be read
//! or changed with SQLite's own tools, and the data directory copied to
//! another computer does not open there (its id differs). No keychain is
//! asked, so no system prompt follows an update, on any system. Where the
//! system keeps no id (a bare Linux), the salt alone makes the key.

use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::path::Path;

/// The installation's salt, beside the database
const SALT_FILE: &str = "database.salt";
/// Mixed into every key, so this app's keys are its own
const PURPOSE: &str = "ckpro app database v1";

/// The database's key, as 64 hex digits
pub fn database_key(data_dir: &Path) -> AppResult<String> {
    Ok(derive(&salt(data_dir)?, crate::platform::machine_id().as_deref()))
}

/// The salt kept, else a new one kept now
fn salt(data_dir: &Path) -> AppResult<String> {
    let file = data_dir.join(SALT_FILE);
    if let Ok(salt) = std::fs::read_to_string(&file) {
        let salt = salt.trim();
        if valid(salt) {
            return Ok(salt.to_string());
        }
    }
    let salt = hex(&rand::random::<[u8; 32]>());
    let io = |e| AppError::io("keeping the database salt", e);
    std::fs::write(&file, &salt).map_err(io)?;
    crate::platform::make_private(&file).map_err(io)?;
    Ok(salt)
}

fn derive(salt: &str, machine: Option<&str>) -> String {
    let mut hash = Sha256::new();
    for part in [PURPOSE, machine.unwrap_or_default(), salt] {
        hash.update(part.as_bytes());
        // Parts apart, so no two splits of the same text give one key
        hash.update([0]);
    }
    hex(&hash.finalize())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn valid(salt: &str) -> bool {
    salt.len() == 64 && salt.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The same computer and salt give the same key; another computer or
    /// another installation's salt, another key
    #[test]
    fn a_key_is_this_computers_and_this_installations() {
        let salt = "ab".repeat(32);
        let key = derive(&salt, Some("machine-a"));
        assert_eq!(key.len(), 64);
        assert_eq!(key, derive(&salt, Some("machine-a")));
        assert_ne!(key, derive(&salt, Some("machine-b")));
        assert_ne!(key, derive(&"cd".repeat(32), Some("machine-a")));
        assert_ne!(derive(&salt, None), key);
    }

    #[test]
    fn this_computer_has_an_id() {
        // macOS, Windows and Linux with systemd all keep one
        assert!(crate::platform::machine_id().is_some());
    }
}
