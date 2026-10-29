//! Connection to the host Docker engine (OrbStack, Docker Desktop, ...).

use crate::error::{AppError, AppResult};
use bollard::{API_DEFAULT_VERSION, Docker};
use std::path::PathBuf;

/// Unix sockets tried after DOCKER_HOST / the default socket, so the app also
/// works when launched from Finder (no shell environment).
fn candidate_sockets() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    vec![
        PathBuf::from("/var/run/docker.sock"),
        home.join(".orbstack/run/docker.sock"),
        home.join(".docker/run/docker.sock"),
        home.join(".colima/default/docker.sock"),
        home.join(".rd/docker.sock"),
    ]
}

/// The engine found last, and when it last answered; `Docker` is a cheap
/// handle over one connection pool.
static CLIENT: std::sync::Mutex<Option<(Docker, std::time::Instant)>> = std::sync::Mutex::new(None);

/// An engine that answered this recently is used without asking again
const FRESH: std::time::Duration = std::time::Duration::from_secs(5);
/// A ping that takes longer: the engine is asleep or gone (the client's own
/// timeout is minutes)
const PING_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// The engine answers a ping in time
pub async fn answers(docker: &Docker) -> bool {
    tokio::time::timeout(PING_TIMEOUT, docker.ping()).await.is_ok_and(|r| r.is_ok())
}

/// The Docker engine: the one found last while it still answers, otherwise
/// the first reachable one.
pub async fn connect() -> AppResult<Docker> {
    let cached = CLIENT.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Some((docker, answered)) = cached {
        if answered.elapsed() < FRESH {
            return Ok(docker);
        }
        if answers(&docker).await {
            *CLIENT.lock().unwrap_or_else(|p| p.into_inner()) = Some((docker.clone(), std::time::Instant::now()));
            return Ok(docker);
        }
    }
    let docker = find().await;
    *CLIENT.lock().unwrap_or_else(|p| p.into_inner()) =
        docker.as_ref().ok().map(|d| (d.clone(), std::time::Instant::now()));
    docker
}

/// First reachable Docker engine.
async fn find() -> AppResult<Docker> {
    if let Ok(docker) = Docker::connect_with_local_defaults() {
        if answers(&docker).await {
            return Ok(docker);
        }
    }
    for socket in candidate_sockets() {
        if !socket.exists() {
            continue;
        }
        if let Ok(docker) =
            Docker::connect_with_unix(&socket.to_string_lossy(), 120, API_DEFAULT_VERSION)
        {
            if answers(&docker).await {
                return Ok(docker);
            }
        }
    }
    Err(AppError::DockerUnavailable {
        message: "Docker is not running. Start OrbStack or Docker Desktop and try again.".into(),
    })
}

/// Docker, waiting up to `timeout` for it to come up (OrbStack or Docker
/// Desktop starting with the machine, or restarting); `waiting` is called
/// once if it is not up yet.
pub async fn wait(timeout: std::time::Duration, waiting: impl FnOnce()) -> AppResult<Docker> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut waiting = Some(waiting);
    loop {
        match connect().await {
            Ok(docker) => return Ok(docker),
            Err(e) if tokio::time::Instant::now() >= deadline => return Err(e),
            Err(_) => {
                if let Some(waiting) = waiting.take() {
                    waiting();
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
}

/// Compose project every container started by ckdry belongs to, so container
/// managers (OrbStack, Docker Desktop) group them as one app.
pub const COMPOSE_PROJECT: &str = "ckdry";

/// Labels that put a container in the ckdry compose project as `service`.
pub fn compose_labels(service: &str) -> Vec<(String, String)> {
    vec![
        ("com.docker.compose.project".into(), COMPOSE_PROJECT.into()),
        ("com.docker.compose.service".into(), service.into()),
        ("com.docker.compose.oneoff".into(), "False".into()),
    ]
}

/// The `docker` CLI on this machine.
pub fn cli() -> Option<std::path::PathBuf> {
    cli_path()
        .split(':')
        .map(|dir| std::path::Path::new(dir).join("docker"))
        .find(|path| path.is_file())
}

/// Directories holding the `docker` CLI, which kind shells out to. GUI apps on
/// macOS start with a minimal PATH, so add the usual install locations.
pub fn cli_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs: Vec<String> = vec![
        format!("{home}/.orbstack/bin"),
        "/usr/local/bin".into(),
        "/opt/homebrew/bin".into(),
        "/Applications/Docker.app/Contents/Resources/bin".into(),
        format!("{home}/.rd/bin"),
    ];
    if let Ok(path) = std::env::var("PATH") {
        dirs.push(path);
    }
    dirs.join(":")
}
