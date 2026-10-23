//! The exam's remote desktop: the candidate's machine `base`, XFCE with a
//! terminal, Firefox and a virtual keyboard, served over VNC to the app (the
//! noVNC client). Like the real exam it has no Kubernetes tools: each task
//! names the host to `ssh` into (one per cluster, see `runtime::jumphost`).
//!
//! A fresh one per attempt (no browser history or files from the last one),
//! its Firefox limited to the certification's allowed documentation. Its VNC
//! port is published on 127.0.0.1 only, behind a password new every attempt.

use super::docker::compose_labels;
use super::infra::{DESKTOP_IMAGE, NETWORK};
use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::models::{ContainerCreateBody, HostConfig, PortBinding, RestartPolicy, RestartPolicyNameEnum};
use bollard::query_parameters::{RemoveContainerOptions, UploadToContainerOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const NAME: &str = "ckdry-desktop";
const VNC_PORT: &str = "6080/tcp";
const POLICIES: &str = "usr/share/firefox-esr/distribution/policies.json";
const SSH_HOSTS: &str = "etc/ssh/ssh_config.d/10-hosts.conf";

/// What the app's VNC client needs to connect
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct DesktopSession {
    /// websocket on 127.0.0.1
    pub port: u16,
    pub password: String,
}

/// A new desktop for an attempt: Firefox allows `allowed` (URL prefixes) and
/// `ssh <host>` reaches the task host `jumphost` for each cluster in `hosts`.
pub async fn start(docker: &Docker, allowed: &[String], hosts: &[String], jumphost: &str) -> AppResult<()> {
    remove(docker).await?;
    let password: String = {
        use rand::distr::{Alphanumeric, SampleString};
        Alphanumeric.sample_string(&mut rand::rng(), 8)
    };
    let config = ContainerCreateBody {
        image: Some(DESKTOP_IMAGE.tag()),
        hostname: Some("base".into()),
        env: Some(vec![format!("VNC_PASSWORD={password}")]),
        exposed_ports: Some(vec![VNC_PORT.into()]),
        labels: Some(compose_labels(NAME).into_iter().collect()),
        host_config: Some(HostConfig {
            network_mode: Some(NETWORK.into()),
            // A random port on the loopback interface only
            port_bindings: Some(HashMap::from([(
                VNC_PORT.to_string(),
                Some(vec![PortBinding { host_ip: Some("127.0.0.1".into()), host_port: Some(String::new()) }]),
            )])),
            restart_policy: Some(RestartPolicy { name: Some(RestartPolicyNameEnum::UNLESS_STOPPED), ..Default::default() }),
            ..Default::default()
        }),
        ..Default::default()
    };
    docker
        .create_container(
            Some(bollard::query_parameters::CreateContainerOptions { name: Some(NAME.into()), ..Default::default() }),
            config,
        )
        .await?;
    // In place before the session starts, so Firefox reads them on first launch
    let files = [(POLICIES, firefox_policies(allowed)), (SSH_HOSTS, ssh_hosts(hosts, jumphost))];
    upload(docker, &files).await?;
    docker.start_container(NAME, None::<bollard::query_parameters::StartContainerOptions>).await?;
    Ok(())
}

/// How to reach the running desktop, if there is one. Read from Docker each
/// time: the host port changes when the container restarts.
pub async fn session(docker: &Docker) -> AppResult<Option<DesktopSession>> {
    let info = match docker.inspect_container(NAME, None).await {
        Ok(info) => info,
        Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if !info.state.as_ref().and_then(|s| s.running).unwrap_or(false) {
        return Ok(None);
    }
    let port = info
        .network_settings
        .and_then(|n| n.ports)
        .and_then(|ports| ports.get(VNC_PORT).cloned().flatten())
        .and_then(|bindings| bindings.into_iter().find_map(|b| b.host_port?.parse().ok()));
    let password = info
        .config
        .and_then(|c| c.env)
        .unwrap_or_default()
        .into_iter()
        .find_map(|e| e.strip_prefix("VNC_PASSWORD=").map(str::to_string));
    Ok(port.zip(password).map(|(port, password)| DesktopSession { port, password }))
}

pub async fn remove(docker: &Docker) -> AppResult<()> {
    match docker.remove_container(NAME, Some(RemoveContainerOptions { force: true, v: true, ..Default::default() })).await {
        Ok(()) | Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Only the allowed documentation; search on those sites works (it is part
/// of the allowed pages). Localized docs are allowed too, as on the exam.
fn firefox_policies(allowed: &[String]) -> String {
    let mut exceptions: Vec<String> = Vec::new();
    for url in allowed {
        let url = url.trim_end_matches('/');
        exceptions.push(format!("{url}*"));
        // https://kubernetes.io/docs → https://kubernetes.io/*/docs (zh-cn, ...)
        if let Some((origin, path)) = url.strip_prefix("https://").and_then(|u| u.split_once('/')) {
            exceptions.push(format!("https://{origin}/*/{path}*"));
        }
    }
    exceptions.sort();
    exceptions.dedup();
    serde_json::json!({
        "policies": {
            "WebsiteFilter": { "Block": ["<all_urls>"], "Exceptions": exceptions },
            "Homepage": { "URL": allowed.first().cloned().unwrap_or_default(), "StartPage": "homepage", "Locked": true },
            "OverrideFirstRunPage": "",
            "OverridePostUpdatePage": "",
            "DontCheckDefaultBrowser": true,
            "DisableTelemetry": true,
            "DisableFirefoxStudies": true,
            "DisableFirefoxAccounts": true,
            "DisablePocket": true,
            "DisableProfileImport": true,
            "NoDefaultBookmarks": true,
            "PasswordManagerEnabled": false,
            "OfferToSaveLogins": false,
            "UserMessaging": { "WhatsNew": false, "ExtensionRecommendations": false, "FeatureRecommendations": false,
                               "MoreFromMozilla": false, "SkipOnboarding": true },
            "FirefoxHome": { "Search": false, "TopSites": false, "SponsoredTopSites": false, "Highlights": false,
                             "Pocket": false, "SponsoredPocket": false, "Snippets": false, "Locked": true }
        }
    })
    .to_string()
}

/// `ssh <cluster>` logs into the task host with that cluster's context
fn ssh_hosts(hosts: &[String], jumphost: &str) -> String {
    hosts.iter().map(|host| format!("Host {host}\n  HostName {jumphost}\n  SetEnv CKDRY_HOST={host}\n")).collect()
}

async fn upload(docker: &Docker, files: &[(&str, String)]) -> AppResult<()> {
    let mut archive = tar::Builder::new(Vec::new());
    for (path, content) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive.append_data(&mut header, path, content.as_bytes()).map_err(|e| AppError::io("packing desktop files", e))?;
    }
    let archive = archive.into_inner().map_err(|e| AppError::io("packing desktop files", e))?;
    docker
        .upload_to_container(
            NAME,
            Some(UploadToContainerOptions { path: "/".into(), ..Default::default() }),
            bollard::body_full(archive.into()),
        )
        .await?;
    Ok(())
}
