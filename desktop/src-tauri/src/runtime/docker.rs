//! Connection to the host Docker engine.

use crate::sync::MutexExt;
use crate::error::{AppError, AppResult};
use bollard::Docker;

/// The engine found last, and when it last answered; `Docker` is a cheap
/// handle over one connection pool.
static CLIENT: std::sync::Mutex<Option<(Docker, std::time::Instant)>> = std::sync::Mutex::new(None);

/// An engine that answered this recently is used without asking again
const FRESH: std::time::Duration = std::time::Duration::from_secs(5);
/// A ping that takes longer: the engine is asleep or gone (the client's own
/// timeout is minutes)
const PING_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// How to get Docker running here, for what the app says when it is not
pub const START: &str = crate::platform::DOCKER_START;

/// How to get Docker here, for when its CLI is not found
pub const INSTALL: &str = crate::platform::DOCKER_INSTALL;

/// The engine answers a ping in time
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
    // Other Docker distributions' engines (OrbStack, Colima, rootless Docker)
    for docker in crate::platform::other_docker_engines() {
        if answers(&docker).await {
            return Ok(docker);
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

/// The `docker` CLI on this machine (kind runs it, without a shell).
pub fn cli() -> Option<std::path::PathBuf> {
    crate::platform::find_program(&cli_dirs(), "docker")
}

/// The containers of kind clusters `clusters` (`all`: stopped ones too),
/// asked of the engine on a thread of its own: the app is quitting and its
/// runtime may be gone. Nothing when Docker does not answer within a few
/// seconds
pub fn cluster_containers_now(clusters: &[String], all: bool) -> Vec<String> {
    const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);
    if clusters.is_empty() {
        return Vec::new();
    }
    const CLUSTER: &str = "io.x-k8s.kind.cluster";
    let clusters = clusters.to_vec();
    let ask = async move {
        let docker = connect().await.ok()?;
        // Label filters must all match: the clusters are told apart here
        let options = bollard::query_parameters::ListContainersOptions {
            all,
            filters: Some(std::collections::HashMap::from([("label".to_string(), vec![CLUSTER.to_string()])])),
            ..Default::default()
        };
        let containers = docker.list_containers(Some(options)).await.ok()?;
        let ours = |c: &bollard::models::ContainerSummary| {
            c.labels.as_ref().and_then(|l| l.get(CLUSTER)).is_some_and(|name| clusters.contains(name))
        };
        Some(containers.into_iter().filter(ours).filter_map(|c| c.id).collect::<Vec<_>>())
    };
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().ok()?;
        runtime.block_on(async { tokio::time::timeout(TIMEOUT, ask).await.ok().flatten() })
    })
    .join()
    .ok()
    .flatten()
    .unwrap_or_default()
}

/// Run `docker <args>` and leave it running: the app quits without waiting
pub fn detached<I, S>(args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let Some(cli) = cli() else { return };
    let spawned = crate::platform::std_command(cli)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    if let Err(e) = spawned {
        tracing::warn!(error = %e, "starting a detached docker command");
    }
}

/// Where Docker puts its CLI, ahead of the app's PATH (a GUI app's is short
/// on macOS)
pub fn cli_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = crate::platform::docker_cli_dirs();
    dirs.extend(crate::platform::path_dirs());
    dirs
}
