//! Cluster operations in flight: one per cluster at a time (deleting a
//! cluster twice, or while it is repaired, would race).

use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::sync::Mutex;

#[derive(Default)]
pub struct Jobs(Mutex<HashSet<String>>);

impl Jobs {
    pub fn begin(&self, cluster: &str) -> AppResult<()> {
        if !self.0.lock().unwrap_or_else(|p| p.into_inner()).insert(cluster.to_string()) {
            return Err(AppError::invalid(format!("cluster '{cluster}' is already busy")));
        }
        Ok(())
    }

    pub fn end(&self, cluster: &str) {
        self.0.lock().unwrap_or_else(|p| p.into_inner()).remove(cluster);
    }
}
