//! Cluster operations in flight: one per cluster at a time (deleting a
//! cluster twice, or while it is repaired, would race). Each is shown on
//! `EnvState::cluster_jobs` while it runs.

use crate::error::{AppError, AppResult};
use crate::runtime::model::{ClusterJob, Env};
use std::sync::Arc;

pub struct Jobs {
    env: Arc<Env>,
}

/// A job under way: it ends when this is dropped, however the work ends
pub struct Job<'a> {
    env: &'a Env,
    cluster: String,
}

impl Drop for Job<'_> {
    fn drop(&mut self) {
        self.env.update(|s| {
            s.cluster_jobs.remove(&self.cluster);
        });
    }
}

impl Jobs {
    pub fn new(env: Arc<Env>) -> Self {
        Self { env }
    }

    /// Begin `job` on `cluster`, unless another runs on it
    pub fn begin(&self, cluster: &str, job: ClusterJob) -> AppResult<Job<'_>> {
        let mut taken = false;
        self.env.update(|s| {
            if !s.cluster_jobs.contains_key(cluster) {
                s.cluster_jobs.insert(cluster.to_string(), job);
                taken = true;
            }
        });
        if !taken {
            return Err(AppError::busy(format!("cluster '{cluster}' is already busy")));
        }
        Ok(Job { env: &self.env, cluster: cluster.to_string() })
    }
}
