//! The exam's remote desktop: the candidate's machine `base`, XFCE with a
//! terminal, Firefox and a virtual keyboard, served over VNC to the app (the
//! noVNC client). Like the real exam it has no Kubernetes tools: each task
//! names the host to `ssh` into (one per cluster, see `runtime::jumphost`).
//!
//! A fresh one per attempt (no browser history or files from the last one),
//! its Firefox limited to the certification's allowed documentation. Its VNC
//! port is published on 127.0.0.1 only, behind a password new every attempt.

use super::docker::compose_labels;
use super::exec;
use super::infra::{DESKTOP_IMAGE, NETWORK};
use crate::error::{AppError, AppResult};
use bollard::Docker;
use bollard::models::{ContainerCreateBody, HostConfig, PortBinding, RestartPolicy, RestartPolicyNameEnum};
use bollard::query_parameters::{RemoveContainerOptions, UploadToContainerOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The app's desktop (tests run their own, by name)
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
pub async fn start(docker: &Docker, name: &str, allowed: &[String], hosts: &[String], jumphost: &str) -> AppResult<()> {
    remove(docker, name).await?;
    let password: String = {
        use rand::distr::{Alphanumeric, SampleString};
        Alphanumeric.sample_string(&mut rand::rng(), 8)
    };
    let config = ContainerCreateBody {
        image: Some(DESKTOP_IMAGE.tag()),
        hostname: Some("base".into()),
        env: Some(vec![format!("VNC_PASSWORD={password}")]),
        exposed_ports: Some(vec![VNC_PORT.into()]),
        labels: Some(compose_labels(name).into_iter().collect()),
        host_config: Some(HostConfig {
            network_mode: Some(NETWORK.into()),
            // A random port on the loopback interface only
            port_bindings: Some(HashMap::from([(
                VNC_PORT.to_string(),
                Some(vec![PortBinding { host_ip: Some("127.0.0.1".into()), host_port: Some(String::new()) }]),
            )])),
            restart_policy: Some(RestartPolicy { name: Some(RestartPolicyNameEnum::UNLESS_STOPPED), ..Default::default() }),
            // An init as PID 1 reaps the processes of closed windows (websockify,
            // the image's last process, does not: they pile up as zombies)
            init: Some(true),
            ..Default::default()
        }),
        ..Default::default()
    };
    docker
        .create_container(
            Some(bollard::query_parameters::CreateContainerOptions { name: Some(name.into()), ..Default::default() }),
            config,
        )
        .await?;
    // In place before the session starts, so Firefox reads them on first launch
    let files = [(POLICIES, firefox_policies(allowed)), (SSH_HOSTS, ssh_hosts(hosts, jumphost))];
    upload(docker, name, &files).await?;
    docker.start_container(name, None::<bollard::query_parameters::StartContainerOptions>).await?;
    Ok(())
}

/// How to reach the running desktop, if there is one. Read from Docker each
/// time: the host port changes when the container restarts.
pub async fn session(docker: &Docker, name: &str) -> AppResult<Option<DesktopSession>> {
    let info = match docker.inspect_container(name, None).await {
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

/// Open a page in the desktop's Firefox (a new tab, or Firefox itself), as
/// the candidate would. Only documentation the exam allows: Firefox's policy
/// would block anything else anyway.
pub async fn open_url(docker: &Docker, name: &str, url: &str, allowed: &[String]) -> AppResult<()> {
    if !url.starts_with("https://") || !allowed.iter().any(|prefix| url.starts_with(prefix.trim_end_matches('/'))) {
        return Err(AppError::invalid(format!("{url} is not documentation the exam allows")));
    }
    // The URL goes in the environment, never into the shell command
    let env = format!("URL={url}");
    exec::run(
        docker,
        name,
        &["bash", "-c", "DISPLAY=:1 nohup firefox-esr --new-tab \"$URL\" >/dev/null 2>&1 &"],
        &[&env],
        None,
    )
    .await?;
    Ok(())
}

pub async fn remove(docker: &Docker, name: &str) -> AppResult<()> {
    match docker.remove_container(name, Some(RemoveContainerOptions { force: true, v: true, ..Default::default() })).await {
        Ok(()) | Err(bollard::errors::Error::DockerResponseServerError { status_code: 404, .. }) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Only the allowed documentation; search on those sites works (it is part
/// of the allowed pages). Localized docs are allowed too, as on the exam.
/// The allowed sites are on the bookmarks toolbar, the exam's
/// "Documentation Quick Links".
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
    // kubernetes.io's search results (Google Custom Search) link through
    // www.google.com/url, which redirects to the result: without it no result
    // opens. The result itself is still filtered
    if allowed.iter().any(|u| u.starts_with("https://kubernetes.io/search")) {
        exceptions.push("https://www.google.com/url*".into());
    }
    exceptions.sort();
    exceptions.dedup();
    serde_json::json!({
        "policies": {
            "WebsiteFilter": { "Block": ["<all_urls>"], "Exceptions": exceptions },
            "Homepage": { "URL": allowed.first().cloned().unwrap_or_default(), "StartPage": "homepage", "Locked": true },
            "DisplayBookmarksToolbar": "always",
            // First run opens Mozilla's privacy notice, which is blocked.
            // Over VNC, smooth scrolling and animations are many frames for
            // one scroll; the page jumps instead (still adjustable)
            "Preferences": {
                "datareporting.policy.firstRunURL": { "Value": "", "Status": "locked" },
                "general.smoothScroll": { "Value": false, "Status": "default" },
                "ui.prefersReducedMotion": { "Value": 1, "Status": "default" },
                "toolkit.cosmeticAnimations.enabled": { "Value": false, "Status": "default" },
            },
            "ManagedBookmarks": quick_links(allowed),
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

/// Bookmarks named after their site and section ("kubernetes.io docs")
fn quick_links(allowed: &[String]) -> serde_json::Value {
    let mut links = vec![serde_json::json!({ "toplevel_name": "Quick Links" })];
    for url in allowed {
        let name = url.trim_start_matches("https://").trim_end_matches('/').replacen('/', " ", 1).replace('/', " › ");
        links.push(serde_json::json!({ "name": name, "url": url }));
    }
    serde_json::Value::Array(links)
}

/// `ssh <cluster>` logs into the task host with that cluster's context
fn ssh_hosts(hosts: &[String], jumphost: &str) -> String {
    hosts.iter().map(|host| format!("Host {host}\n  HostName {jumphost}\n  SetEnv CKDRY_HOST={host}\n")).collect()
}

async fn upload(docker: &Docker, name: &str, files: &[(&str, String)]) -> AppResult<()> {
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
            name,
            Some(UploadToContainerOptions { path: "/".into(), ..Default::default() }),
            bollard::body_full(archive.into()),
        )
        .await?;
    Ok(())
}
