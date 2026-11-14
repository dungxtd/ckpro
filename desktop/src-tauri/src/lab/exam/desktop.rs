//! The attempt's exam desktop: started with the attempt, reset on request,
//! its session handed to the desk once it is up.

use super::{ExamState, Exams};
use crate::error::{AppError, AppResult};
use crate::runtime::{desktop, docker};
use crate::sync::MutexExt;

impl Exams {
    /// Start the attempt's desktop, and tell who waits for it
    pub(super) async fn start_desktop(&self, docker: &bollard::Docker, allowed: &[String], clusters: &[String]) -> AppResult<()> {
        let key = self.jumphost.ssh_key(docker).await?;
        // Its clock reads this computer's time, however the app was opened
        let offset = super::plan::local_offset_minutes(crate::runtime::activity::now_ms());
        desktop::start(docker, &self.desktop, allowed, clusters, &self.jumphost.name, &key.private, offset).await?;
        self.desktop_up.notify_waiters();
        Ok(())
    }

    /// The desktop's session (its VNC), waiting up to `wait` for it to come
    /// up: the desk asks once, Rust says when, nothing polls
    pub async fn desktop_session(&self, wait: std::time::Duration) -> AppResult<Option<desktop::DesktopSession>> {
        let up = self.desktop_up.notified();
        let docker = docker::connect().await?;
        if let Some(session) = desktop::session(&docker, &self.desktop).await? {
            return Ok(Some(session));
        }
        let _ = tokio::time::timeout(wait, up).await;
        desktop::session(&docker, &self.desktop).await
    }

    /// The exam's "Reset Desktop": a new desktop from the current image, every
    /// window closed (a desktop that went black comes back); the attempt's
    /// allowed docs and hosts stay, the app's client reconnects
    pub async fn reset_desktop(&self) -> AppResult<()> {
        // Not while resuming: that starts the desktop itself
        let ExamState::Running { attempt, .. } = self.state() else {
            return Err(AppError::invalid("no exam is running"));
        };
        let allowed = {
            let session = self.session.locked().clone();
            self.allowed_docs(&attempt.certification, &session)
        };
        // ckpro's own: the guard does not report the old one going away
        self.guard.expect(&self.desktop);
        let docker = docker::connect().await?;
        self.start_desktop(&docker, &allowed, &attempt.clusters).await
    }
}
