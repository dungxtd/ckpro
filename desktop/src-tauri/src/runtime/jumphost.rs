//! The candidate's machine. The app has one (`ckpro-jumphost`); every
//! `lab verify` run gets its own, so runs never share files or kubeconfigs.
//!
//! Its kubeconfig has a context per cluster under the cluster's *logical*
//! name (what questions and candidates use, e.g. `k8s`) pointing at the
//! *physical* kind cluster (`k8s` in the app, `k8s-v1a2b` in a verify run).

use super::docker::compose_labels;
use super::infra::{JUMPHOST_IMAGE, NETWORK, create_and_start, start_existing};
use crate::cluster::kind::Kind;
use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::models::{ContainerCreateBody, HostConfig, RestartPolicy, RestartPolicyNameEnum};
use bollard::query_parameters::{DownloadFromContainerOptions, RemoveContainerOptions};
use futures_util::StreamExt;
use kube::config::Kubeconfig;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Logical cluster name → physical kind cluster name
pub type Placement = BTreeMap<String, String>;

type Log<'a> = &'a (dyn Fn(String) + Sync);

/// The app's clusters keep their names: logical = physical
pub fn app_placement(kind: &Kind) -> Placement {
    kind.owned_clusters().into_iter().map(|c| (c.clone(), c)).collect()
}

pub const APP_NAME: &str = "ckpro-jumphost";
/// A verify run's jumphost is `ckpro-jumphost-<run>`
pub const RUN_PREFIX: &str = "ckpro-jumphost-";
/// A verify run's Docker network is `ckpro-run-<run>`
pub const RUN_NETWORK_PREFIX: &str = "ckpro-run-";

/// The Docker network of a verify run: its clusters, its jumphost and the
/// registry mirror, apart from the app's and other runs'
pub fn run_network(run: &str) -> String {
    format!("{RUN_NETWORK_PREFIX}{run}")
}

pub struct Jumphost {
    pub name: String,
    /// The Docker network it joins: the app's, or its run's own
    network: String,
    /// Mounted read-write at /root/.ckpro (`kubectl config use-context` writes)
    dir: PathBuf,
}

impl Jumphost {
    /// The app's jumphost
    pub fn app(data_dir: &Path) -> Self {
        Self { name: APP_NAME.into(), network: NETWORK.into(), dir: data_dir.join("jumphost") }
    }

    /// A jumphost of the tests' own, on the app's network beside the
    /// clusters they make there
    #[cfg(test)]
    pub fn for_test(data_dir: &Path, name: &str) -> Self {
        Self { name: format!("{RUN_PREFIX}{name}"), network: NETWORK.into(), dir: data_dir.join("runs").join(name).join("jumphost") }
    }

    /// A jumphost of its own for one verify run
    pub fn for_run(data_dir: &Path, run: &str) -> Self {
        Self { name: format!("{RUN_PREFIX}{run}"), network: run_network(run), dir: data_dir.join("runs").join(run).join("jumphost") }
    }

    /// Where etcd client certs for a logical cluster are, on the jumphost
    pub fn etcd_certs(cluster: &str) -> String {
        format!("/root/.ckpro/etcd/{cluster}")
    }

    pub async fn ensure(&self, docker: &Docker, log: Log<'_>) -> AppResult<()> {
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating jumphost dir", e))?;
        // One from an older image (an app update), or mounting another data
        // dir (older install, showing the wrong clusters): replace it
        let source = self.dir.display().to_string();
        let image = JUMPHOST_IMAGE.tag();
        if let Ok(info) = docker.inspect_container(&self.name, None).await {
            let current = info.config.and_then(|c| c.image).as_deref() == Some(image.as_str());
            let mounted = info
                .mounts
                .unwrap_or_default()
                .iter()
                .any(|m| m.source.as_deref() == Some(source.as_str()) && m.rw == Some(true));
            if !current || !mounted {
                log(format!("Replacing {} (outdated)", self.name));
                self.remove_container(docker).await?;
            }
        }
        if start_existing(docker, &self.name).await? {
            return Ok(());
        }
        log(format!("Starting {}", self.name));
        let config = ContainerCreateBody {
            image: Some(image),
            hostname: Some("jumphost".into()),
            labels: Some(compose_labels(&self.name).into_iter().collect()),
            host_config: Some(HostConfig {
                binds: Some(vec![format!("{source}:/root/.ckpro")]),
                network_mode: Some(self.network.clone()),
                restart_policy: Some(RestartPolicy {
                    name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        create_and_start(docker, &self.name, config).await
    }

    /// A fresh machine for a new attempt: files the previous candidate left
    /// (manifests, snapshots, history) must not leak into the next one.
    pub async fn reset(&self, docker: &Docker, log: Log<'_>) -> AppResult<()> {
        self.remove_container(docker).await?;
        self.ensure(docker, log).await
    }

    /// Container and files (end of a verify run)
    pub async fn remove(&self, docker: &Docker) -> AppResult<()> {
        self.remove_container(docker).await?;
        let _ = std::fs::remove_dir_all(&self.dir);
        Ok(())
    }

    async fn remove_container(&self, docker: &Docker) -> AppResult<()> {
        match docker
            .remove_container(&self.name, Some(RemoveContainerOptions { force: true, v: true, ..Default::default() }))
            .await
        {
            Ok(()) | Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    /// Rewrite the kubeconfig (one context per logical cluster) and the etcd
    /// certs for `placement`, keeping the candidate's current context.
    pub async fn refresh_access(&self, docker: &Docker, kind: &Kind, placement: &Placement) -> AppResult<()> {
        std::fs::create_dir_all(&self.dir).map_err(|e| AppError::io("creating jumphost dir", e))?;
        let kubeconfig_path = self.dir.join("kubeconfig");
        let previous_context = std::fs::read_to_string(&kubeconfig_path)
            .ok()
            .and_then(|text| Kubeconfig::from_yaml(&text).ok())
            .and_then(|k| k.current_context);

        let mut merged: Option<Kubeconfig> = None;
        let _ = std::fs::remove_dir_all(self.dir.join("etcd"));
        for (logical, physical) in placement {
            match kind.internal_kubeconfig(physical).await {
                Ok(text) => {
                    // Contexts, clusters and users named after the logical cluster
                    let text = text.replace(&format!("kind-{physical}"), logical);
                    let config = Kubeconfig::from_yaml(&text).map_err(|e| AppError::cluster(e.to_string()))?;
                    merged = Some(match merged {
                        None => config,
                        Some(m) => m.merge(config).map_err(|e| AppError::cluster(e.to_string()))?,
                    });
                }
                Err(e) => tracing::warn!(cluster = %physical, error = %e, "kubeconfig for the jumphost"),
            }
            if let Err(e) = export_etcd_certs(docker, physical, &self.dir.join("etcd").join(logical)).await {
                tracing::warn!(cluster = %physical, error = %e, "etcd certs for the jumphost");
            }
        }

        match merged {
            Some(mut config) => {
                if let Some(ctx) = previous_context.filter(|c| placement.contains_key(c)) {
                    config.current_context = Some(ctx);
                }
                let json = serde_json::to_vec_pretty(&config).map_err(|e| AppError::cluster(e.to_string()))?;
                // JSON is valid kubeconfig YAML; replace atomically under the reader
                let tmp = self.dir.join("kubeconfig.tmp");
                std::fs::write(&tmp, json).map_err(|e| AppError::io("writing kubeconfig", e))?;
                std::fs::rename(&tmp, &kubeconfig_path).map_err(|e| AppError::io("writing kubeconfig", e))?;
            }
            None => {
                let _ = std::fs::remove_file(&kubeconfig_path);
            }
        }
        Ok(())
    }
}

/// ca.crt, client.crt and client.key for etcdctl, from the control plane.
async fn export_etcd_certs(docker: &Docker, cluster: &str, dest: &Path) -> AppResult<()> {
    let mut stream = docker.download_from_container(
        &format!("{cluster}-control-plane"),
        Some(DownloadFromContainerOptions { path: "/etc/kubernetes/pki/etcd".into() }),
    );
    let mut archive = Vec::new();
    while let Some(chunk) = stream.next().await {
        archive.extend_from_slice(&chunk?);
    }
    std::fs::create_dir_all(dest).map_err(|e| AppError::io("writing etcd certs", e))?;
    let mut tar = tar::Archive::new(archive.as_slice());
    for entry in tar.entries().map_err(|e| AppError::io("reading etcd certs", e))? {
        let mut entry = entry.map_err(|e| AppError::io("reading etcd certs", e))?;
        let file = entry.path().ok().and_then(|p| p.file_name().map(|f| f.to_string_lossy().into_owned()));
        let target = match file.as_deref() {
            Some("ca.crt") => "ca.crt",
            Some("healthcheck-client.crt") => "client.crt",
            Some("healthcheck-client.key") => "client.key",
            _ => continue,
        };
        entry.unpack(dest.join(target)).map_err(|e| AppError::io("writing etcd certs", e))?;
    }
    Ok(())
}
