//! Long operations the user waits on (preparing and cleaning up an exam,
//! grading, resuming, creating or starting clusters), shown the same way
//! everywhere: the plan, the step in progress, elapsed time and the log.
//! The last ones are kept for the Activity list, failures included.
//!
//! Changes go to the UI as `ActivityChanged` (without the log, which grows)
//! and each log line as `ActivityLog`; `list` has the full activities.

use crate::sync::MutexExt;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const KEEP: usize = 20;
const LOG_LINES: usize = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ActivityStatus {
    Running,
    Done,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Activity {
    pub id: u32,
    pub title: String,
    /// The whole plan; `current` is the step in progress (all done when the
    /// activity is)
    pub steps: Vec<String>,
    pub current: u32,
    /// Where in the current step ("Task 3 of 15: ...")
    pub detail: Option<String>,
    pub status: ActivityStatus,
    pub error: Option<String>,
    /// Unix milliseconds
    pub started_at: f64,
    pub finished_at: Option<f64>,
    /// Last lines (empty in `ActivityChanged`)
    pub log: Vec<String>,
    /// Failed, it can be run again with Retry (`env_retry`)
    #[serde(default)]
    pub retry: bool,
}

type Changed = Box<dyn Fn(&Activity) + Send + Sync>;
type Line = Box<dyn Fn(u32, &str) + Send + Sync>;

pub struct Activities {
    state: Mutex<(u32, VecDeque<Activity>)>,
    changed: Changed,
    line: Line,
}

impl Activities {
    pub fn new(
        changed: impl Fn(&Activity) + Send + Sync + 'static,
        line: impl Fn(u32, &str) + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self { state: Mutex::new((0, VecDeque::new())), changed: Box::new(changed), line: Box::new(line) })
    }

    /// Activities that report nowhere
    #[cfg(test)]
    pub fn silent() -> Arc<Self> {
        Self::new(|_| {}, |_, _| {})
    }

    pub fn list(&self) -> Vec<Activity> {
        self.lock().1.iter().cloned().collect()
    }

    /// Start an activity at its first step.
    pub fn begin(self: &Arc<Self>, title: impl Into<String>, steps: Vec<String>) -> Op {
        let activity = {
            let mut state = self.lock();
            state.0 += 1;
            let activity = Activity {
                id: state.0,
                title: title.into(),
                steps,
                current: 0,
                detail: None,
                status: ActivityStatus::Running,
                error: None,
                started_at: now_ms(),
                finished_at: None,
                log: Vec::new(),
                retry: false,
            };
            state.1.push_back(activity.clone());
            while state.1.len() > KEEP {
                state.1.pop_front();
            }
            activity
        };
        tracing::info!(activity = activity.id, "{}", activity.title);
        (self.changed)(&activity);
        let op = Op { handle: self.handle(activity.id), finished: false };
        if let Some(first) = activity.steps.first() {
            op.log(format!("▸ {first}"));
        }
        op
    }

    /// Report into a running activity without owning it.
    pub fn handle(self: &Arc<Self>, id: u32) -> Handle {
        Handle { activities: self.clone(), id }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, (u32, VecDeque<Activity>)> {
        self.state.locked()
    }

    fn update(&self, id: u32, change: impl FnOnce(&mut Activity)) {
        let snapshot = {
            let mut state = self.lock();
            let Some(activity) = state.1.iter_mut().find(|a| a.id == id) else { return };
            change(activity);
            Activity { log: Vec::new(), ..activity.clone() }
        };
        (self.changed)(&snapshot);
    }
}

/// Reports into an activity: steps, detail and log lines.
#[derive(Clone)]
pub struct Handle {
    activities: Arc<Activities>,
    id: u32,
}

/// A running activity, owned by the task doing it. Ends with `done` or
/// `fail`; dropped unfinished (its task was cancelled), it ends "Cancelled".
pub struct Op {
    handle: Handle,
    finished: bool,
}

impl std::ops::Deref for Op {
    type Target = Handle;
    fn deref(&self) -> &Handle {
        &self.handle
    }
}

impl Handle {
    pub fn id(&self) -> u32 {
        self.id
    }

    /// What it is ("Setting up CKA practice")
    pub fn title(&self) -> String {
        self.activities.lock().1.iter().find(|a| a.id == self.id).map(|a| a.title.clone()).unwrap_or_default()
    }

    /// Move to step `index` (logged as `▸ step` when it is a new one).
    pub fn step(&self, index: u32, detail: Option<String>) {
        let mut title = None;
        self.activities.update(self.id, |a| {
            if a.current != index {
                title = a.steps.get(index as usize).cloned();
            }
            a.current = index;
            a.detail = detail;
        });
        if let Some(title) = title {
            self.log(format!("▸ {title}"));
        }
    }

    /// Failed, it can be run again with Retry (`env_retry`)
    pub fn retryable(&self) {
        self.activities.update(self.id, |a| a.retry = true);
    }

    /// Say where in the current step it is.
    pub fn detail(&self, detail: impl Into<String>) {
        let detail = detail.into();
        self.log(detail.clone());
        self.activities.update(self.id, |a| a.detail = Some(detail));
    }

    pub fn log(&self, line: impl Into<String>) {
        let line = line.into();
        tracing::info!(activity = self.id, "{line}");
        {
            let mut state = self.activities.lock();
            if let Some(activity) = state.1.iter_mut().find(|a| a.id == self.id) {
                activity.log.push(line.clone());
                if activity.log.len() > LOG_LINES {
                    activity.log.remove(0);
                }
            }
        }
        (self.activities.line)(self.id, &line);
    }
}

impl Op {
    /// End with the outcome of the work it tracked, and pass it on.
    pub fn end<T>(self, result: crate::error::AppResult<T>) -> crate::error::AppResult<T> {
        match &result {
            Ok(_) => self.done(),
            Err(crate::error::AppError::Cancelled { .. }) => self.fail("Cancelled"),
            Err(e) => {
                crate::telemetry::activity_failed(&self.title(), &e.to_string());
                self.fail(e)
            }
        }
        result
    }

    pub fn done(mut self) {
        self.finish(None);
    }

    pub fn fail(mut self, error: impl std::fmt::Display) {
        let error = error.to_string();
        self.log(format!("✗ {error}"));
        self.finish(Some(error));
    }

    fn finish(&mut self, error: Option<String>) {
        self.finished = true;
        self.handle.activities.update(self.handle.id, |a| {
            a.status = if error.is_some() { ActivityStatus::Failed } else { ActivityStatus::Done };
            if error.is_none() {
                a.current = a.steps.len() as u32;
                a.detail = None;
            }
            // How long it took, beside its steps' lines
            let ms = (now_ms() - a.started_at).max(0.0) as u64;
            match &error {
                None => tracing::info!(activity = a.id, ms, "{} done", a.title),
                Some(e) => tracing::info!(activity = a.id, ms, error = %e, "{} ended", a.title),
            }
            a.error = error;
            a.finished_at = Some(now_ms());
        });
    }
}

impl Drop for Op {
    fn drop(&mut self) {
        if !self.finished {
            self.finish(Some("Cancelled".into()));
        }
    }
}

/// Unix milliseconds, as the interface shows times
pub fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}
