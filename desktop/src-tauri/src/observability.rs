//! Logging: stderr plus a daily rotating file in the app log directory
//! (7 kept). Filter with `CKIU_LOG`, e.g. `CKIU_LOG=ckiu_lib=debug`.

use std::path::Path;
use std::sync::OnceLock;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

static GUARD: OnceLock<WorkerGuard> = OnceLock::new();

pub fn init(log_dir: &Path) {
    let filter = || {
        EnvFilter::try_from_env("CKIU_LOG").unwrap_or_else(|_| EnvFilter::new("info"))
    };
    let file = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("ckiu")
        .filename_suffix("log")
        .max_log_files(7)
        .build(log_dir);
    let file_layer = file.ok().map(|appender| {
        let (writer, guard) = tracing_appender::non_blocking(appender);
        let _ = GUARD.set(guard);
        fmt::layer().with_ansi(false).with_writer(writer).with_filter(filter())
    });
    let _ = tracing_subscriber::registry()
        .with(fmt::layer().with_writer(std::io::stderr).with_filter(filter()))
        .with(file_layer)
        .try_init();
}

use tracing_subscriber::Layer as _;
