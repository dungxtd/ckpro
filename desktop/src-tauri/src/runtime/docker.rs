//! Connection to the host Docker engine.

use crate::error::{AppError, AppResult};
use crate::sync::MutexExt;
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

/// How to give Docker more memory here, for when an exam does not fit
pub const MEMORY: &str = crate::platform::DOCKER_MEMORY;

/// How to give Docker more disk here, for when it runs low
pub const DISK: &str = crate::platform::DOCKER_DISK;

/// Whether Docker answered that the thing asked for is not there
pub fn is_gone(e: &bollard::errors::Error) -> bool {
    matches!(e, bollard::errors::Error::DockerResponseServerError { status_code: 404, .. })
}

/// What Docker gave, `None` when the thing is not there: a removal of what is
/// gone is done, an inspection of it finds nothing
pub fn unless_gone<T>(result: Result<T, bollard::errors::Error>) -> AppResult<Option<T>> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(e) if is_gone(&e) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

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
    *CLIENT.locked() = docker.as_ref().ok().map(|d| (d.clone(), std::time::Instant::now()));
    docker
}

/// First reachable Docker engine.
async fn find() -> AppResult<Docker> {
    if let Ok(docker) = Docker::connect_with_local_defaults()
        && answers(&docker).await
    {
        return Ok(docker);
    }
    // Other Docker distributions' engines (OrbStack, Colima, rootless Docker)
    for docker in crate::platform::other_docker_engines() {
        if answers(&docker).await {
            return Ok(docker);
        }
    }
    Err(AppError::DockerUnavailable { message: format!("Docker is not running. {START} and try again.") })
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

/// Compose project every container started by ckpro belongs to, so container
/// managers (OrbStack, Docker Desktop) group them as one app.
pub const COMPOSE_PROJECT: &str = "ckpro";

/// The compose labels naming a container's project and service
pub const PROJECT_LABEL: &str = "com.docker.compose.project";
pub const SERVICE_LABEL: &str = "com.docker.compose.service";

/// Labels that put a container in the ckpro compose project as `service`.
/// Compose (v5) counts a container as its own only with a config hash: without
/// one, `docker compose -p ckpro down` and the managers' Delete find nothing.
/// No compose file stands behind it, so the hash is a fixed one
pub fn compose_labels(service: &str) -> Vec<(String, String)> {
    vec![
        (PROJECT_LABEL.into(), COMPOSE_PROJECT.into()),
        (SERVICE_LABEL.into(), service.into()),
        ("com.docker.compose.oneoff".into(), "False".into()),
        ("com.docker.compose.config-hash".into(), COMPOSE_PROJECT.into()),
    ]
}

/// `files` (path, content) as a tar archive, for Docker to unpack or build
/// from
pub fn tar_of<'a>(files: impl IntoIterator<Item = (&'a str, &'a [u8])>) -> std::io::Result<Vec<u8>> {
    let mut archive = tar::Builder::new(Vec::new());
    for (path, content) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive.append_data(&mut header, path, content)?;
    }
    archive.into_inner()
}

/// The `docker` CLI on this machine (kind runs it, without a shell).
pub fn cli() -> Option<std::path::PathBuf> {
    crate::platform::find_program(&cli_dirs(), "docker")
}

/// What `ckpro quit` does with the containers it is given
#[derive(Clone, Copy, Debug, PartialEq, Eq, clap::ValueEnum)]
pub enum OnQuit {
    /// Stop them (the next start starts them again)
    Stop,
    /// Remove them, volumes too (a proof's)
    Remove,
}

/// Hand the nodes of kind clusters `clusters` and the containers `named` to
/// a process of their own (this app, as `ckpro quit`): it finds the nodes
/// and stops or removes them after the app is gone, so quitting waits for
/// nothing
pub fn on_quit(action: OnQuit, clusters: &[String], named: &[String]) {
    if clusters.is_empty() && named.is_empty() {
        return;
    }
    // The app itself (in tests, the app built beside them: a test binary
    // has no `quit`)
    let Ok(app) = crate::cluster::docker_shim::program() else { return };
    let mut args = vec!["quit".to_string(), if action == OnQuit::Stop { "stop" } else { "remove" }.to_string()];
    for c in clusters {
        args.extend(["--cluster".to_string(), c.clone()]);
    }
    for n in named {
        args.extend(["--container".to_string(), n.clone()]);
    }
    let spawned = crate::platform::std_command(app)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    if let Err(e) = spawned {
        tracing::warn!(error = %e, "handing the containers over for quitting");
    }
}

/// `ckpro quit`: stop or remove the nodes of `clusters` and the `named`
/// containers; what is not there is skipped
pub async fn quit(action: OnQuit, clusters: &[String], named: &[String]) -> AppResult<()> {
    use crate::cluster::kind::CLUSTER_LABEL as CLUSTER;
    let docker = connect().await?;
    let options = bollard::query_parameters::ListContainersOptions {
        all: action == OnQuit::Remove,
        filters: Some(std::collections::HashMap::from([("label".to_string(), vec![CLUSTER.to_string()])])),
        ..Default::default()
    };
    let nodes = docker
        .list_containers(Some(options))
        .await?
        .into_iter()
        .filter(|c| c.labels.as_ref().and_then(|l| l.get(CLUSTER)).is_some_and(|name| clusters.contains(name)));
    let targets: Vec<String> = nodes.filter_map(|c| c.id).chain(named.iter().cloned()).collect();
    let jobs = targets.iter().map(|id| {
        let docker = docker.clone();
        async move {
            let done = match action {
                OnQuit::Stop => {
                    let options = bollard::query_parameters::StopContainerOptions { t: Some(5), ..Default::default() };
                    docker.stop_container(id, Some(options)).await
                }
                OnQuit::Remove => {
                    let options = bollard::query_parameters::RemoveContainerOptions { force: true, v: true, ..Default::default() };
                    docker.remove_container(id, Some(options)).await
                }
            };
            // Gone, or stopped already: nothing left to do
            let settled = |e: &bollard::errors::Error| {
                is_gone(e) || matches!(e, bollard::errors::Error::DockerResponseServerError { status_code: 304, .. })
            };
            if let Err(e) = done
                && !settled(&e)
            {
                tracing::warn!(container = %id, error = %e, "quitting: the container stays as it was");
            }
        }
    });
    futures_util::future::join_all(jobs).await;
    Ok(())
}

/// Where Docker puts its CLI, ahead of the app's PATH (a GUI app's is short
/// on macOS)
pub fn cli_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = crate::platform::docker_cli_dirs();
    dirs.extend(crate::platform::path_dirs());
    dirs
}
