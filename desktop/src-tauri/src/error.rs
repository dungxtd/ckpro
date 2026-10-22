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
    /// A session, cluster or file that does not exist.
    #[error("{message}")]
    NotFound { message: String },
    /// Local filesystem or network failure.
    #[error("{message}")]
    Io { message: String },
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
    pub fn io(context: &str, e: impl std::fmt::Display) -> Self {
        Self::Io { message: format!("{context}: {e}") }
    }
}

impl From<bollard::errors::Error> for AppError {
    fn from(e: bollard::errors::Error) -> Self {
        Self::docker(e)
    }
}
