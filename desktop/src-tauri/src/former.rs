//! The app was called ckpro. What it left under that name moves to its new
//! one once (its data directory and database) or goes (its containers: the
//! environment is made again under the new name, as on a first run).

use std::collections::HashMap;
use std::path::Path;

use bollard::Docker;
use bollard::query_parameters::{ListContainersOptions, RemoveContainerOptions};

/// Its bundle identifier, which named its data directory
const APP_ID: &str = "dev.ckpro.app";
/// Its database, in that directory
const DATABASE: &str = "ckpro.db";
/// The compose project its containers (task host, desktop, mirror, kind's nodes) were in
const COMPOSE_PROJECT: &str = "ckpro";

/// Before `dir` (the data directory) is first made: the old directory
/// becomes it, and the database inside takes the new name. Nothing when
/// there is no old directory, or the new one exists already
pub fn move_data(dir: &Path) {
    let old = dir.with_file_name(APP_ID);
    if dir.exists() || !old.is_dir() {
        return;
    }
    if let Err(e) = std::fs::rename(&old, dir) {
        tracing::warn!(error = %e, from = %old.display(), "could not move the former data directory");
        return;
    }
    // SQLite's write-ahead log and shared memory go with the database
    for suffix in ["", "-wal", "-shm"] {
        let from = dir.join(format!("{DATABASE}{suffix}"));
        if from.exists() {
            let _ = std::fs::rename(&from, dir.join(format!("{}{suffix}", crate::DATABASE)));
        }
    }
    tracing::info!(from = %old.display(), "moved the former data directory in");
}

/// Remove the containers left in the former compose project. Before the
/// environment starts, so nothing of it is running yet
pub async fn remove_containers(docker: &Docker) {
    let label = format!("com.docker.compose.project={COMPOSE_PROJECT}");
    let Ok(containers) = docker
        .list_containers(Some(ListContainersOptions {
            all: true,
            filters: Some(HashMap::from([("label".to_string(), vec![label])])),
            ..Default::default()
        }))
        .await
    else {
        return;
    };
    for id in containers.into_iter().filter_map(|c| c.id) {
        let removed = docker
            .remove_container(&id, Some(RemoveContainerOptions { force: true, v: true, ..Default::default() }))
            .await;
        if let Err(e) = removed {
            tracing::warn!(error = %e, container = %id, "could not remove a former container");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The old directory and its database take the new names; a second run
    /// leaves things as they are
    #[test]
    fn the_former_data_directory_moves_in_once() {
        let root = std::env::temp_dir().join(format!("ckpro-former-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let old = root.join(APP_ID);
        std::fs::create_dir_all(old.join("jumphost")).unwrap();
        std::fs::write(old.join(DATABASE), "db").unwrap();
        std::fs::write(old.join(format!("{DATABASE}-wal")), "wal").unwrap();
        let new = root.join(crate::APP_ID);

        move_data(&new);
        assert!(!old.exists());
        assert!(new.join("jumphost").is_dir());
        assert_eq!(std::fs::read_to_string(new.join(crate::DATABASE)).unwrap(), "db");
        assert_eq!(std::fs::read_to_string(new.join(format!("{}-wal", crate::DATABASE))).unwrap(), "wal");

        // Once there, an old directory made again is not moved over it
        std::fs::create_dir_all(&old).unwrap();
        move_data(&new);
        assert!(old.exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
