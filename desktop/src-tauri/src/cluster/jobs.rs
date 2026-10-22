//! Cluster operations in flight, so the UI can cancel them. Keyed by cluster
//! name: one operation per cluster at a time.

use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct Jobs(Mutex<HashMap<String, CancellationToken>>);

impl Jobs {
    pub fn begin(&self, cluster: &str) -> AppResult<CancellationToken> {
        let mut jobs = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if jobs.contains_key(cluster) {
            return Err(AppError::invalid(format!("cluster '{cluster}' is already busy")));
        }
        let token = CancellationToken::new();
        jobs.insert(cluster.to_string(), token.clone());
        Ok(token)
    }

    pub fn end(&self, cluster: &str) {
        self.0.lock().unwrap_or_else(|p| p.into_inner()).remove(cluster);
    }

    pub fn cancel(&self, cluster: &str) -> bool {
        match self.0.lock().unwrap_or_else(|p| p.into_inner()).get(cluster) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }
}
