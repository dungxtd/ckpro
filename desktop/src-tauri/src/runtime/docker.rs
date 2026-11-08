//! Connection to the host Docker engine.

use crate::sync::MutexExt;
use crate::error::{AppError, AppResult};
use bollard::{API_DEFAULT_VERSION, Docker};
use std::path::PathBuf;

/// Unix sockets tried after DOCKER_HOST / the default socket, so the app also
/// works when launched from Finder (no shell environment).
#[cfg(unix)]
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

/// How to get Docker running here, for what the app says when it is not
pub const START: &str = if cfg!(target_os = "macos") {
    "Start OrbStack or Docker Desktop"
} else if cfg!(windows) {
    "Start Docker Desktop"
} else {
    "Start Docker (sudo systemctl start docker), your user in the docker group"
};

/// How to get Docker here, for when its CLI is not found
pub const INSTALL: &str = if cfg!(target_os = "macos") {
    "Install OrbStack or Docker Desktop"
} else if cfg!(windows) {
    "Install Docker Desktop"
} else {
    "Install Docker Engine"
};

pub async fn answers(docker: &Docker) -> bool {
    tokio::time::timeout(PING_TIMEOUT, docker.ping()).await.is_ok_and(|r| r.is_ok())
}

/// The Docker engine: the one found last while it still answers, otherwise
/// the first reachable one.
pub async fn connect() -> AppResult<Docker> {
    let cached = CLIENT.locked().clone();
    if let Some((docker, answered)) = cached {
        if answered.elapsed() < FRESH {
            return Ok(docker);
        }
        if answers(&docker).await {
            *CLIENT.locked() = Some((docker.clone(), std::time::Instant::now()));
            return Ok(docker);
        }
    }
    let docker = find().await;
    *CLIENT.locked() =
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
    // Other engines' sockets (OrbStack, Colima, rootless Docker); Windows
    // has its engine on the named pipe the defaults use
    #[cfg(unix)]
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
        message: format!("Docker is not running. {START} and try again."),
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

/// Compose project every container started by cktry belongs to, so container
/// managers (OrbStack, Docker Desktop) group them as one app.
pub const COMPOSE_PROJECT: &str = "cktry";

/// Labels that put a container in the cktry compose project as `service`.
/// Compose (v5) counts a container as its own only with a config hash: without
/// one, `docker compose -p cktry down` and the managers' Delete find nothing.
/// No compose file stands behind it, so the hash is a fixed one
pub fn compose_labels(service: &str) -> Vec<(String, String)> {
    vec![
        ("com.docker.compose.project".into(), COMPOSE_PROJECT.into()),
        ("com.docker.compose.service".into(), service.into()),
        ("com.docker.compose.oneoff".into(), "False".into()),
        ("com.docker.compose.config-hash".into(), COMPOSE_PROJECT.into()),
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
    // Where each system's Docker puts its CLI, ahead of the app's PATH (a
    // GUI app's is short on macOS)
    let mut dirs: Vec<std::path::PathBuf> = if cfg!(target_os = "macos") {
        vec![
            format!("{home}/.orbstack/bin").into(),
            "/usr/local/bin".into(),
            "/opt/homebrew/bin".into(),
            "/Applications/Docker.app/Contents/Resources/bin".into(),
            format!("{home}/.rd/bin").into(),
        ]
    } else if cfg!(windows) {
        vec![r"C:\Program Files\Docker\Docker\resources\bin".into()]
    } else {
        vec!["/usr/bin".into(), "/usr/local/bin".into(), "/snap/bin".into(), format!("{home}/.rd/bin").into()]
    };
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    std::env::join_paths(dirs).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}
