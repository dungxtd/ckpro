//! Add-ons every exam cluster gets after kind creates it.

use crate::error::{AppError, AppResult};
use crate::runtime::exec;
use bollard::Docker;

const METRICS_SERVER: &str = include_str!("../../resources/metrics-server.yaml");

/// kind ships without metrics-server; the kubelet certs are self-signed,
/// hence --kubelet-insecure-tls in the manifest.
pub async fn install_addons(docker: &Docker, cluster: &str) -> AppResult<()> {
    let out = exec::run(
        docker,
        &super::kind::control_plane(cluster),
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
