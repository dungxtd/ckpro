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

const KIND_NODE_BASE: &str = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0";

/// Where release builds publish the images (CI, `.github/workflows/images.yml`);
/// the app pulls from here like kind pulls its node image
pub const REGISTRY: &str = "ghcr.io/dungxtd";

/// An image of ckdry's: pulled from `REGISTRY`, or built here when it is not
/// published (development, offline). Its tag is a hash of everything it is
/// built from, so a change makes a new image (and the old one is dropped).
pub struct Image {
    /// Its directory under `resources/`, and its package name `ckdry-<name>`
    pub name: &'static str,
    /// (name in the build context, content); the first is the Dockerfile
    files: &'static [(&'static str, &'static [u8])],
    args: &'static [(&'static str, &'static str)],
}

impl Image {
    pub fn tag(&self) -> String {
        // FNV-1a: stable across Rust versions, unlike std's hasher
        let mut hash: u64 = 0xcbf29ce484222325;
        let files = self.files.iter().flat_map(|(name, content)| [name.as_bytes(), *content]);
        let args = self.args.iter().flat_map(|(k, v)| [k.as_bytes(), v.as_bytes()]);
        for part in files.chain(args) {
            for &byte in part.iter().chain(&[0]) {
                hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
            }
        }
        format!("{}:{:08x}", self.repository(), hash as u32)
    }

    pub fn repository(&self) -> String {
        format!("{REGISTRY}/ckdry-{}", self.name)
    }
}

pub const IMAGES: [&Image; 3] = [&NODE_IMAGE, &JUMPHOST_IMAGE, &DESKTOP_IMAGE];

/// What CI builds and publishes (`ckdry images`, `resources/images.json`)
pub fn manifest() -> serde_json::Value {
    IMAGES
        .iter()
        .map(|image| {
            serde_json::json!({
                "name": image.name,
                "image": image.tag(),
                "args": image.args.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect::<std::collections::BTreeMap<_, _>>(),
            })
        })
        .collect()
}

/// kind node + sshd (`ssh <node>`)
pub const NODE_IMAGE: Image = Image {
    name: "node",
    files: &[("Dockerfile", include_bytes!("../../resources/node/Dockerfile"))],
    args: &[("BASE", KIND_NODE_BASE)],
};

/// The task host: kubectl, helm, etcdctl, yq in step with the clusters
/// (CKA runs v1.35); Helm 3, what helm.sh/docs and the tasks are written for
pub const JUMPHOST_IMAGE: Image = Image {
    name: "jumphost",
    files: &[("Dockerfile", include_bytes!("../../resources/jumphost/Dockerfile"))],
    args: &[
        ("KUBECTL_VERSION", "v1.35.8"),
        ("ETCD_VERSION", "v3.6.6"),
        ("HELM_VERSION", "v3.22.1"),
        ("YQ_VERSION", "v4.54.1"),
    ],
};

/// The exam's remote desktop, the `base` machine (runtime/desktop.rs)
pub const DESKTOP_IMAGE: Image = Image {
    name: "desktop",
    files: &[
        ("Dockerfile", include_bytes!("../../resources/desktop/Dockerfile")),
        ("start.sh", include_bytes!("../../resources/desktop/start.sh")),
        ("xsettings.xml", include_bytes!("../../resources/desktop/xsettings.xml")),
        ("xfce4-terminal.xml", include_bytes!("../../resources/desktop/xfce4-terminal.xml")),
        ("xfce-stripes.png", include_bytes!("../../resources/desktop/xfce-stripes.png")),
        ("xfce4-desktop.xml", include_bytes!("../../resources/desktop/xfce4-desktop.xml")),
        ("trust-launchers.sh", include_bytes!("../../resources/desktop/trust-launchers.sh")),
        ("helpers.rc", include_bytes!("../../resources/desktop/helpers.rc")),
        ("terminal.desktop", include_bytes!("../../resources/desktop/terminal.desktop")),
        ("firefox.desktop", include_bytes!("../../resources/desktop/firefox.desktop")),
        ("keyboard.desktop", include_bytes!("../../resources/desktop/keyboard.desktop")),
        ("codium.desktop", include_bytes!("../../resources/desktop/codium.desktop")),
    ],
    args: &[],
};

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


pub struct Infra {
    dir: PathBuf,
    /// One `ensure` at a time: an exam started while the startup build runs
    /// waits for it instead of building the same images again
    ensuring: tokio::sync::Mutex<()>,
}

impl Infra {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { dir: data_dir, ensuring: tokio::sync::Mutex::new(()) }
    }

    /// Images not built yet: on the first run, or after an update changed them
    pub async fn missing_images(&self, docker: &Docker) -> Vec<String> {
        let mut missing = Vec::new();
        for image in IMAGES {
            if docker.inspect_image(&image.tag()).await.is_err() {
                missing.push(format!("ckdry-{}", image.name));
            }
        }
        missing
    }

    /// containerd registry config mounted into every node
    pub fn certs_dir(&self) -> PathBuf {
        self.dir.join("certs.d")
    }

    /// Create whatever is missing. Idempotent and cheap once everything exists.
    pub async fn ensure(&self, docker: &Docker, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
        let _one_at_a_time = self.ensuring.lock().await;
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

        for image in IMAGES {
            obtain(docker, image, log).await?;
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

/// Drop ckdry images left without a tag (a rebuild under the same tag), a few
/// GB each time otherwise.
async fn remove_untagged(docker: &Docker, log: &(dyn Fn(String) + Sync)) {
    let filters = HashMap::from([
        ("dangling".to_string(), vec!["true".to_string()]),
        ("label".to_string(), vec![format!("com.docker.compose.project={}", super::docker::COMPOSE_PROJECT)]),
    ]);
    if let Ok(pruned) = docker
        .prune_images(Some(bollard::query_parameters::PruneImagesOptions { filters: Some(filters) }))
        .await
        && let Some(bytes) = pruned.space_reclaimed.filter(|b| *b > 0)
    {
        log(format!("Removed old ckdry image layers ({} MB)", bytes / 1_000_000));
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
    pull(docker, image, &|_| {}).await
}

/// Pull `image`, logging each layer as it completes.
async fn pull(docker: &Docker, image: &str, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
    let mut pull = docker.create_image(
        Some(bollard::query_parameters::CreateImageOptions { from_image: Some(image.into()), ..Default::default() }),
        None,
        None,
    );
    while let Some(progress) = pull.next().await {
        let progress = progress?;
        if let (Some(id), Some(status)) = (progress.id, progress.status)
            && matches!(status.as_str(), "Pull complete" | "Already exists")
        {
            log(format!("  {id}: {status}"));
        }
    }
    Ok(())
}

/// Get `image` unless it is here: pull the published one, or build it when it
/// is not published (a change not released yet, or offline). Then drop the
/// versions it replaces.
async fn obtain(docker: &Docker, image: &Image, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
    let tag = image.tag();
    if docker.inspect_image(&tag).await.is_ok() {
        return Ok(());
    }
    log(format!("Pulling {tag}"));
    match pull(docker, &tag, log).await {
        Ok(()) => log(format!("Pulled {tag}")),
        Err(e) => {
            log(format!("Not on the registry yet ({e}): building {tag} here"));
            build(docker, &tag, image, log).await?;
        }
    }
    remove_older(docker, &tag, log).await;
    remove_untagged(docker, log).await;
    Ok(())
}

/// Build `tag` from the image's files, streaming the build output to `log`.
async fn build(docker: &Docker, tag: &str, image: &Image, log: &(dyn Fn(String) + Sync)) -> AppResult<()> {
    let mut context = tar::Builder::new(Vec::new());
    for (name, content) in image.files {
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        context
            .append_data(&mut header, name, *content)
            .map_err(|e| AppError::io("packing build context", e))?;
    }
    let context = context.into_inner().map_err(|e| AppError::io("packing build context", e))?;

    let options = BuildImageOptions {
        dockerfile: "Dockerfile".into(),
        t: Some(tag.into()),
        rm: true,
        forcerm: true,
        buildargs: Some(image.args.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect::<HashMap<_, _>>()),
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A file added to an image's directory but not to its `files` is
    /// missing from the build ("COPY failed: file not found")
    #[test]
    fn images_ship_every_file_of_their_directory() {
        for image in IMAGES {
            let dir = image.name;
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join(dir);
            let mut on_disk: Vec<String> =
                std::fs::read_dir(path).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            let mut shipped: Vec<String> = image.files.iter().map(|(name, _)| name.to_string()).collect();
            on_disk.sort();
            shipped.sort();
            assert_eq!(on_disk, shipped, "{dir}");
        }
    }

    /// CI publishes what `resources/images.json` lists: it must match the app
    #[test]
    fn image_manifest_is_current() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/images.json");
        let committed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default();
        assert_eq!(committed, manifest(), "stale resources/images.json: run `ckdry images > desktop/src-tauri/resources/images.json`");
    }
}
