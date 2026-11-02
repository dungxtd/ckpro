//! The verify cluster of the Create screen, made as the screen opens so a
//! new question is proven without waiting for one. One at a time; cancelled
//! or removed on request, after a while away from the screen, when an exam
//! starts (it needs the memory) and when the app quits.

use crate::error::AppError;
use crate::lab::verify::{Run, Topology};
use crate::runtime::infra::Infra;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

/// The cluster new questions are made for (the generator's rule) and its size
pub const CLUSTER: &str = "k8s";
pub const WORKERS: u8 = 1;
/// Memory a verify run takes (a cluster and its task host)
pub const RUN_MB: u32 = 2048;
/// How long the cluster stays once the screen is left
const KEEP_AFTER_LEAVING: Duration = Duration::from_secs(10 * 60);

/// Where the Create screen's cluster stands
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum WorkspaceState {
    /// None: not asked for, or removed
    Off,
    /// Being made
    Preparing,
    /// Made, waiting for questions to prove
    Ready,
    /// Could not be made, and why
    Failed { reason: String },
}

#[derive(Default)]
struct Inner {
    state: Option<WorkspaceState>,
    run: Option<Arc<Run>>,
    /// Stops the cluster being made
    cancel: Option<CancellationToken>,
    /// Removes it a while after the screen was left
    timer: Option<tauri::async_runtime::JoinHandle<()>>,
}

pub struct Workspace {
    data_dir: PathBuf,
    inner: Mutex<Inner>,
    changed: Box<dyn Fn(&WorkspaceState) + Send + Sync>,
}

impl Workspace {
    pub fn new(data_dir: PathBuf, changed: impl Fn(&WorkspaceState) + Send + Sync + 'static) -> Arc<Self> {
        Arc::new(Self { data_dir, inner: Mutex::default(), changed: Box::new(changed) })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn state(&self) -> WorkspaceState {
        self.lock().state.clone().unwrap_or(WorkspaceState::Off)
    }

    fn set(&self, inner: &mut Inner, state: WorkspaceState) {
        inner.state = Some(state.clone());
        (self.changed)(&state);
    }

    /// Make the cluster unless it is there or being made (the screen opened
    /// again: it stays). `fits` says whether Docker has room for it
    pub fn prepare(self: &Arc<Self>, infra: Arc<Infra>, fits: Result<(), String>) {
        let mut inner = self.lock();
        if let Some(timer) = inner.timer.take() {
            timer.abort();
        }
        if matches!(inner.state, Some(WorkspaceState::Preparing | WorkspaceState::Ready)) {
            return;
        }
        if let Err(reason) = fits {
            self.set(&mut inner, WorkspaceState::Failed { reason });
            return;
        }
        let run = match Run::new(&self.data_dir) {
            Ok(run) => Arc::new(run),
            Err(e) => return self.set(&mut inner, WorkspaceState::Failed { reason: e.to_string() }),
        };
        let cancel = CancellationToken::new();
        inner.run = Some(run.clone());
        inner.cancel = Some(cancel.clone());
        self.set(&mut inner, WorkspaceState::Preparing);
        drop(inner);

        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let log = |line: String| tracing::info!("{line}");
            let topology = Topology::from([(CLUSTER.to_string(), WORKERS)]);
            let made = run.start(&infra, &topology, &cancel, &log).await;
            // Released meanwhile, or another run took its place: not ours to report
            let failed = {
                let mut inner = this.lock();
                let current = inner.run.as_ref().is_some_and(|r| Arc::ptr_eq(r, &run));
                match made {
                    Ok(()) => {
                        if current {
                            this.set(&mut inner, WorkspaceState::Ready);
                        }
                        false
                    }
                    Err(e) => {
                        if current {
                            inner.run = None;
                            let state = match e {
                                AppError::Cancelled { .. } => WorkspaceState::Off,
                                e => WorkspaceState::Failed { reason: e.to_string() },
                            };
                            this.set(&mut inner, state);
                        }
                        true
                    }
                }
            };
            if failed {
                run.finish(&log).await;
            }
        });
    }

    /// The made cluster, for proving questions; it is spent by them (their
    /// setups and solutions change it): a new one is made in its place
    pub fn take(self: &Arc<Self>, infra: Arc<Infra>, fits: impl FnOnce() -> Result<(), String>) -> Option<Arc<Run>> {
        let mut inner = self.lock();
        if inner.state != Some(WorkspaceState::Ready) {
            return None;
        }
        let run = inner.run.take();
        inner.cancel = None;
        inner.state = None;
        drop(inner);
        self.prepare(infra, fits());
        run
    }

    /// Stop making the cluster, or remove it
    pub fn release(&self) {
        let mut inner = self.lock();
        if let Some(timer) = inner.timer.take() {
            timer.abort();
        }
        if let Some(cancel) = inner.cancel.take() {
            cancel.cancel();
        }
        let run = inner.run.take();
        if inner.state != Some(WorkspaceState::Off) {
            self.set(&mut inner, WorkspaceState::Off);
        }
        drop(inner);
        if let Some(run) = run {
            tauri::async_runtime::spawn(async move {
                run.finish(&|line| tracing::info!("{line}")).await;
            });
        }
    }

    /// The screen was left: the cluster goes after a while, unless it opens again
    pub fn leave(self: &Arc<Self>) {
        let mut inner = self.lock();
        if !matches!(inner.state, Some(WorkspaceState::Preparing | WorkspaceState::Ready)) {
            return;
        }
        if let Some(timer) = inner.timer.take() {
            timer.abort();
        }
        let this = self.clone();
        inner.timer = Some(tauri::async_runtime::spawn(async move {
            tokio::time::sleep(KEEP_AFTER_LEAVING).await;
            this.release();
        }));
    }

    /// The app quits: the cluster and task host go with it, handed to a
    /// detached `docker rm` so quitting stays instant (the next start sweeps
    /// what is left of the run)
    pub fn on_exit(&self) {
        let Some(run) = self.lock().run.take() else { return };
        run.remove_detached();
    }
}
