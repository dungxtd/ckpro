//! Typed error contract for commands. Each variant is created where the
//! failure happens (not guessed from message text), and serializes to
//! `{ "code": "...", "message": "..." }` so the UI can branch on `code`.

use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum AppError {
    /// No reachable Docker engine.
    #[error("{message}")]
    DockerUnavailable { message: String },
    /// The Docker engine rejected or failed a request.
    #[error("{message}")]
    Docker { message: String },
    /// kind could not be downloaded or a cluster operation failed.
    #[error("{message}")]
    Cluster { message: String },
    /// Bad input from the UI (names, paths, ...).
    #[error("{message}")]
    Invalid { message: String },
    /// Something is under way that this has to wait for: an attempt, a
    /// proof, a save.
    #[error("{message}")]
    Busy { message: String },
    /// An exam-mode attempt runs: the assistant (any AI) is off until it
    /// ends, as in the real exam.
    #[error("{message}")]
    ExamMode { message: String },
    /// The assistant is turned off in Settings: the app has no AI.
    #[error("{message}")]
    AssistantOff { message: String },
    /// This machine cannot run it now: Docker's memory or CPUs.
    #[error("{message}")]
    Preflight { message: String },
    /// Clusters an exam needs already exist: starting it replaces them.
    #[error("{message}")]
    ClustersExist { message: String },
    /// The exam images could not be downloaded (offline, or not published):
    /// the candidate may build them here, or wait for the connection.
    #[error("{message}")]
    ImagesUnavailable { message: String },
    /// A session, cluster or file that does not exist.
    #[error("{message}")]
    NotFound { message: String },
    /// Local filesystem or network failure.
    #[error("{message}")]
    Io { message: String },
    /// The user cancelled the operation.
    #[error("{message}")]
    Cancelled { message: String },
    /// The AI assistant (the `claude` CLI) is missing or failed.
    #[error("{message}")]
    Assistant { message: String },
    /// The assistant has no Claude login (or it expired).
    #[error("{message}")]
    SignInRequired { message: String },
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn docker(e: impl std::fmt::Display) -> Self {
        Self::Docker { message: e.to_string() }
    }
    pub fn cluster(message: impl Into<String>) -> Self {
        Self::Cluster { message: message.into() }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid { message: message.into() }
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound { message: message.into() }
    }
    pub fn busy(message: impl Into<String>) -> Self {
        Self::Busy { message: message.into() }
    }
    /// The one way an exam-mode attempt refuses the assistant
    pub fn exam_mode() -> Self {
        Self::ExamMode {
            message: "An exam-mode attempt is running: the assistant is off until it ends, as in the real exam.".into(),
        }
    }
    pub fn assistant_off() -> Self {
        Self::AssistantOff { message: "The assistant is turned off in Settings.".into() }
    }
    pub fn preflight(message: impl Into<String>) -> Self {
        Self::Preflight { message: message.into() }
    }
    pub fn assistant(message: impl Into<String>) -> Self {
        Self::Assistant { message: message.into() }
    }
    pub fn io(context: &str, e: impl std::fmt::Display) -> Self {
        Self::Io { message: format!("{context}: {e}") }
    }
}

impl From<bollard::errors::Error> for AppError {
    fn from(e: bollard::errors::Error) -> Self {
        Self::docker(e)
    }
}
