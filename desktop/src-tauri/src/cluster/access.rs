//! How the candidate reaches the clusters from the jumphost: one kubeconfig
//! with a context per cluster (named after it, as on the exam), and each
//! cluster's etcd client certs. Rewritten whenever the set of clusters changes.

use super::kind::Kind;
use crate::error::{AppError, AppResult};
use crate::runtime::{exec, infra::Infra};
use bollard::Docker;
use bollard::query_parameters::DownloadFromContainerOptions;
use futures_util::StreamExt;
use kube::config::Kubeconfig;
use std::path::Path;

const METRICS_SERVER: &str = include_str!("../../resources/metrics-server.yaml");

/// Add-ons every exam cluster has (kind ships without metrics-server; the
/// kubelet certs are self-signed, hence --kubelet-insecure-tls in the manifest).
pub async fn install_addons(docker: &Docker, cluster: &str) -> AppResult<()> {
    let out = exec::run(
        docker,
        &format!("{cluster}-control-plane"),
        &["kubectl", "--kubeconfig=/etc/kubernetes/admin.conf", "apply", "-f", "-"],
        &[],
        Some(METRICS_SERVER.as_bytes()),
    )
    .await?;
    if out.exit_code != 0 {
        return Err(AppError::cluster(format!("installing metrics-server: {}", out.text.trim())));
    }
    Ok(())
}

/// Rewrite the jumphost's kubeconfig and etcd certs for the current clusters.
pub async fn refresh(docker: &Docker, kind: &Kind, infra: &Infra) -> AppResult<()> {
    let dir = infra.jumphost_dir();
    std::fs::create_dir_all(&dir).map_err(|e| AppError::io("creating jumphost dir", e))?;
    let kubeconfig_path = dir.join("kubeconfig");
    let previous_context = std::fs::read_to_string(&kubeconfig_path)
        .ok()
        .and_then(|text| Kubeconfig::from_yaml(&text).ok())
        .and_then(|k| k.current_context);

    let mut clusters = kind.owned_clusters();
    clusters.sort();
    let mut merged: Option<Kubeconfig> = None;
    let _ = std::fs::remove_dir_all(dir.join("etcd"));
    for name in &clusters {
        match kind.internal_kubeconfig(name).await {
            Ok(text) => {
                // Contexts, clusters and users named after the cluster, not kind-<name>
                let text = text.replace(&format!("kind-{name}"), name);
                let config = Kubeconfig::from_yaml(&text).map_err(|e| AppError::cluster(e.to_string()))?;
                merged = Some(match merged {
                    None => config,
                    Some(m) => m.merge(config).map_err(|e| AppError::cluster(e.to_string()))?,
                });
            }
            Err(e) => tracing::warn!(cluster = %name, error = %e, "kubeconfig for the jumphost"),
        }
        if let Err(e) = export_etcd_certs(docker, name, &dir.join("etcd").join(name)).await {
            tracing::warn!(cluster = %name, error = %e, "etcd certs for the jumphost");
        }
    }

    match merged {
        Some(mut config) => {
            if let Some(ctx) = previous_context.filter(|c| clusters.contains(c)) {
                config.current_context = Some(ctx);
            }
            let json = serde_json::to_vec_pretty(&config).map_err(|e| AppError::cluster(e.to_string()))?;
            // JSON is valid kubeconfig YAML; replace atomically under the reader
            let tmp = dir.join("kubeconfig.tmp");
            std::fs::write(&tmp, json).map_err(|e| AppError::io("writing kubeconfig", e))?;
            std::fs::rename(&tmp, &kubeconfig_path).map_err(|e| AppError::io("writing kubeconfig", e))?;
        }
        None => {
            let _ = std::fs::remove_file(&kubeconfig_path);
        }
    }
    Ok(())
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
