//! Infrastructure shared by every exam, created once and kept between exams:
//! the `kind` network, pull-through registry caches, the exam node image
//! (kind node + sshd) and the jumphost image (see `runtime::jumphost`).

use super::docker::compose_labels;
use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::models::{ContainerCreateBody, HostConfig, NetworkCreateRequest, RestartPolicy, RestartPolicyNameEnum};
use bollard::query_parameters::{BuildImageOptions, CreateContainerOptions};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::path::PathBuf;

/// Network kind attaches every cluster to; created up front so caches and
/// the jumphost can join it before the first cluster exists.
pub const NETWORK: &str = "kind";

pub const KIND_NODE_BASE: &str = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0";
pub const NODE_IMAGE: &str = "ckdry/node:v1.35.8";
/// Tagged with its tool versions so a version change builds a new image
pub const JUMPHOST_IMAGE: &str = "ckdry/jumphost:v1.35.8-helm3.22.1";

/// Tools on the jumphost, in step with the cluster version (CKA runs v1.35)
const KUBECTL_VERSION: &str = "v1.35.8";
const ETCD_VERSION: &str = "v3.6.6";
/// Helm 3: what the exam's allowed documentation (helm.sh/docs) and most
/// existing tasks are written for
const HELM_VERSION: &str = "v3.22.1";

/// Pull-through cache for every upstream, in one container and one volume.
/// A registry proxies a single upstream, so it runs one registry process per
/// upstream, each on its own port and its own directory in the volume.
pub const MIRROR: &str = "ckdry-mirror";
const MIRROR_IMAGE: &str = "registry:2";
/// (port, upstream, registry host)
const UPSTREAMS: [(u16, &str, &str); 4] = [
    (5000, "https://registry-1.docker.io", "docker.io"),
    (5001, "https://registry.k8s.io", "registry.k8s.io"),
    (5002, "https://ghcr.io", "ghcr.io"),
    (5003, "https://quay.io", "quay.io"),
];

const NODE_DOCKERFILE: &str = include_str!("../../resources/node/Dockerfile");
const JUMPHOST_DOCKERFILE: &str = include_str!("../../resources/jumphost/Dockerfile");

pub struct Infra {
    dir: PathBuf,
}

impl Infra {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { dir: data_dir }
    }

    /// containerd registry config mounted into every node
    pub fn certs_dir(&self) -> PathBuf {
        self.dir.join("certs.d")
    }

    /// Create whatever is missing. Idempotent and cheap once everything exists.
    pub async fn ensure(&self, docker: &Docker, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        if docker.inspect_network(NETWORK, None::<bollard::query_parameters::InspectNetworkOptions>).await.is_err() {
            log(format!("Creating network {NETWORK}"));
            docker
                .create_network(NetworkCreateRequest { name: NETWORK.into(), ..Default::default() })
                .await?;
        }

        self.write_certs_d()?;
        if let Err(e) = ensure_mirror(docker).await {
            // Best effort: containerd falls back to the upstream registries
            log(format!("Registry cache unavailable ({e}); pulling directly"));
        }

        if docker.inspect_image(NODE_IMAGE).await.is_err() {
            log(format!("Building {NODE_IMAGE} (first run only)"));
            build(docker, NODE_IMAGE, NODE_DOCKERFILE, &[("BASE", KIND_NODE_BASE)], log).await?;
            remove_older(docker, NODE_IMAGE, log).await;
        }
        if docker.inspect_image(JUMPHOST_IMAGE).await.is_err() {
            log(format!("Building {JUMPHOST_IMAGE} (first run only)"));
            build(
                docker,
                JUMPHOST_IMAGE,
                JUMPHOST_DOCKERFILE,
                &[("KUBECTL_VERSION", KUBECTL_VERSION), ("ETCD_VERSION", ETCD_VERSION), ("HELM_VERSION", HELM_VERSION)],
                log,
            )
            .await?;
            remove_older(docker, JUMPHOST_IMAGE, log).await;
        }
        Ok(())
    }

    fn write_certs_d(&self) -> AppResult<()> {
        for (port, upstream, host) in UPSTREAMS {
            let dir = self.certs_dir().join(host);
            std::fs::create_dir_all(&dir).map_err(|e| AppError::io("writing registry config", e))?;
            let toml = format!(
                "# Pull through the ckdry cache; containerd falls back to the upstream\n\
                 server = \"{upstream}\"\n\n[host.\"http://{MIRROR}:{port}\"]\n  capabilities = [\"pull\", \"resolve\"]\n"
            );
            std::fs::write(dir.join("hosts.toml"), toml).map_err(|e| AppError::io("writing registry config", e))?;
        }
        Ok(())
    }
}

async fn ensure_mirror(docker: &Docker) -> AppResult<()> {
    if start_existing(docker, MIRROR).await? {
        return Ok(());
    }
    // One registry per upstream; the container stops (and its restart
    // policy restarts it) as soon as one of them exits
    let mut script = String::new();
    for (port, upstream, host) in UPSTREAMS {
        script.push_str(&format!(
            "REGISTRY_HTTP_ADDR=:{port} REGISTRY_PROXY_REMOTEURL={upstream} \
             REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY=/var/lib/registry/{host} \
             registry serve /etc/docker/registry/config.yml &\n"
        ));
    }
    script.push_str("wait -n\n");
    let config = ContainerCreateBody {
        image: Some(MIRROR_IMAGE.into()),
        entrypoint: Some(vec!["sh".into(), "-c".into(), script]),
        cmd: Some(vec![]),
        labels: Some(compose_labels(MIRROR).into_iter().collect()),
        host_config: Some(HostConfig {
            binds: Some(vec![format!("{MIRROR}:/var/lib/registry")]),
            network_mode: Some(NETWORK.into()),
            restart_policy: Some(RestartPolicy { name: Some(RestartPolicyNameEnum::UNLESS_STOPPED), ..Default::default() }),
            ..Default::default()
        }),
        ..Default::default()
    };
    pull_if_missing(docker, MIRROR_IMAGE).await?;
    create_and_start(docker, MIRROR, config).await
}

/// Drop the other tags of `current`'s repository, left by an older version of
/// the app. One still used by a container stays (removal fails harmlessly).
async fn remove_older(docker: &Docker, current: &str, log: &(dyn Fn(String) + Sync)) {
    let repository = current.split(':').next().unwrap_or(current);
    let Ok(images) = docker
        .list_images(Some(bollard::query_parameters::ListImagesOptions {
            filters: Some(HashMap::from([("reference".to_string(), vec![repository.to_string()])])),
            ..Default::default()
        }))
        .await
    else {
        return;
    };
    for tag in images.into_iter().flat_map(|i| i.repo_tags).filter(|t| t != current) {
        if docker.remove_image(&tag, None::<bollard::query_parameters::RemoveImageOptions>, None).await.is_ok() {
            log(format!("Removed {tag} (replaced by {current})"));
        }
    }
}

/// Start the container if it exists; false when it does not.
pub(crate) async fn start_existing(docker: &Docker, name: &str) -> AppResult<bool> {
    match docker.inspect_container(name, None).await {
        Ok(info) => {
            if !info.state.and_then(|s| s.running).unwrap_or(false) {
                docker.start_container(name, None::<bollard::query_parameters::StartContainerOptions>).await?;
            }
            Ok(true)
        }
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => Ok(false),
        Err(e) => Err(e.into()),
    }
}

pub(crate) async fn create_and_start(docker: &Docker, name: &str, config: ContainerCreateBody) -> AppResult<()> {
    docker
        .create_container(Some(CreateContainerOptions { name: Some(name.into()), ..Default::default() }), config)
        .await?;
    docker.start_container(name, None::<bollard::query_parameters::StartContainerOptions>).await?;
    Ok(())
}

async fn pull_if_missing(docker: &Docker, image: &str) -> AppResult<()> {
    if docker.inspect_image(image).await.is_ok() {
        return Ok(());
    }
    let mut pull = docker.create_image(
        Some(bollard::query_parameters::CreateImageOptions { from_image: Some(image.into()), ..Default::default() }),
        None,
        None,
    );
    while let Some(progress) = pull.next().await {
        progress?;
    }
    Ok(())
}

/// Build `tag` from a single Dockerfile, streaming the build output to `log`.
async fn build(
    docker: &Docker,
    tag: &str,
    dockerfile: &str,
    args: &[(&str, &str)],
    log: &(dyn Fn(String) + Sync),
) -> AppResult<()> {
    let mut context = tar::Builder::new(Vec::new());
    let mut header = tar::Header::new_gnu();
    header.set_size(dockerfile.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    context
        .append_data(&mut header, "Dockerfile", dockerfile.as_bytes())
        .map_err(|e| AppError::io("packing build context", e))?;
    let context = context.into_inner().map_err(|e| AppError::io("packing build context", e))?;

    let options = BuildImageOptions {
        dockerfile: "Dockerfile".into(),
        t: Some(tag.into()),
        rm: true,
        forcerm: true,
        buildargs: Some(args.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect::<HashMap<_, _>>()),
        labels: Some(compose_labels(tag).into_iter().collect()),
        ..Default::default()
    };
    let mut output = docker.build_image(options, None, Some(bollard::body_full(context.into())));
    while let Some(info) = output.next().await {
        let info = info.map_err(|e| AppError::docker(format!("building {tag}: {e}")))?;
        if let Some(detail) = info.error_detail {
            return Err(AppError::docker(format!(
                "building {tag}: {}",
                detail.message.unwrap_or_default()
            )));
        }
        if let Some(line) = info.stream.map(|s| s.trim_end().to_string()).filter(|s| !s.is_empty()) {
            log(line);
        }
    }
    Ok(())
}
