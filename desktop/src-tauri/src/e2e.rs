//! End-to-end tests on the host Docker engine: real clusters, the exam
//! engine, the guard. Opt-in (`cargo test -- --ignored`), slow.

use crate::*;
use runtime::{exec, infra};
use std::time::Duration;

/// Opt-in end-to-end tests against the host Docker engine (slow; they
/// replace the app's jumphost): `cargo test -- --ignored --nocapture`
struct Fixture {
    kind: Arc<cluster::kind::Kind>,
    infra: Arc<infra::Infra>,
    jumphost: Arc<runtime::jumphost::Jumphost>,
}

/// Clusters, kind state and a jumphost of the test's own
fn fixture(name: &str) -> Fixture {
    let dir = std::env::temp_dir().join(format!("ckpro-e2e-{name}"));
    Fixture {
        kind: Arc::new(cluster::kind::Kind::new(dir.clone())),
        infra: Arc::new(infra::Infra::new(dir.clone())),
        jumphost: Arc::new(runtime::jumphost::Jumphost::for_run(&dir, &format!("test-{name}"))),
    }
}

impl Fixture {
    /// Remove the test's own jumphost container: a test leaves nothing
    /// running. Its directory stays: the next run mounts the same path,
    /// and OrbStack's file sharing shows a deleted-then-recreated
    /// directory as missing to new containers
    async fn teardown(&self) {
        let docker = runtime::docker::connect().await.unwrap();
        let options = bollard::query_parameters::RemoveContainerOptions { force: true, v: true, ..Default::default() };
        let _ = docker.remove_container(&self.jumphost.name, Some(options)).await;
    }

    /// Create a cluster and give the jumphost access to it
    async fn create(&self, cluster: &str, workers: u8) {
        cluster::lifecycle::create(&self.kind, &self.infra, cluster, workers, &log, &Default::default()).await.unwrap();
        self.refresh().await;
    }

    async fn delete(&self, cluster: &str) {
        cluster::lifecycle::delete(&self.kind, cluster, &log).await.unwrap();
        self.refresh().await;
    }

    async fn refresh(&self) {
        let docker = runtime::docker::connect().await.unwrap();
        self.jumphost.ensure(&docker, &log).await.unwrap();
        let placement = runtime::jumphost::app_placement(&self.kind);
        self.jumphost.refresh_access(&docker, &self.kind, &placement).await.unwrap();
    }

    /// Shell command on the jumphost, as the candidate would type it
    async fn on_jumphost(&self, cmd: &str) -> exec::Output {
        let docker = runtime::docker::connect().await.unwrap();
        exec::run(&docker, &self.jumphost.name, &["bash", "-lc", cmd], &[], None).await.unwrap()
    }
}

fn log(line: String) {
    println!("  | {line}");
}

async fn eventually(what: &str, attempts: u32, check: impl AsyncFn() -> bool) {
    for _ in 0..attempts {
        if check().await {
            println!("ok: {what}");
            return;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    panic!("timed out waiting for: {what}");
}

/// A cluster as the candidate sees it on the exam: from the jumphost,
/// a context per cluster, ssh to nodes, etcdctl, metrics, cached pulls,
/// and checks graded there.
#[tokio::test]
#[ignore]
async fn exam_cluster_from_the_jumphost() {
    let f = fixture("cluster");
    let name = "ckpro-e2e";
    let started = std::time::Instant::now();
    f.create(name, 1).await;
    println!("created in {:?}", started.elapsed());

    let docker = runtime::docker::connect().await.unwrap();
    for container in [format!("{name}-control-plane"), format!("{name}-worker"), f.jumphost.name.clone()] {
        let labels = docker.inspect_container(&container, None).await.unwrap().config.unwrap().labels.unwrap();
        assert_eq!(labels.get("com.docker.compose.project").map(String::as_str), Some("ckpro"), "{container}");
    }
    println!("ok: nodes and jumphost are in the ckpro compose project");

    let out = f.on_jumphost("kubectl config current-context && kubectl get nodes --no-headers | wc -l").await;
    assert_eq!(out.text.split_whitespace().collect::<Vec<_>>(), [name, "2"], "{}", out.text);
    println!("ok: jumphost kubectl has context {name} with 2 nodes");

    let out = f.on_jumphost(&format!(
        "ssh {name}-worker hostname && ssh {name}-control-plane 'ls /etc/kubernetes/manifests; systemctl is-active kubelet'"
    ))
    .await;
    assert!(out.text.contains(&format!("{name}-worker")) && out.text.contains("etcd.yaml") && out.text.contains("active"), "{}", out.text);
    println!("ok: ssh to nodes, static pods and kubelet visible");

    let out = f.on_jumphost(&format!(
        "d=/root/.ckpro/etcd/{name}; etcdctl --endpoints=https://{name}-control-plane:2379 --cacert=$d/ca.crt --cert=$d/client.crt --key=$d/client.key endpoint health"
    ))
    .await;
    assert!(out.text.contains("is healthy"), "{}", out.text);
    println!("ok: etcdctl from the jumphost");

    eventually("kubectl top nodes (metrics-server)", 60, async || {
        f.on_jumphost("kubectl top nodes").await.exit_code == 0
    })
    .await;

    let out = f.on_jumphost("kubectl run web --image=nginx:alpine && kubectl wait --for=condition=Ready pod/web --timeout=180s").await;
    assert_eq!(out.exit_code, 0, "{}", out.text);
    let catalog = exec::run(&docker, infra::MIRROR, &["wget", "-qO-", "http://127.0.0.1:5000/v2/_catalog"], &[], None).await.unwrap();
    assert!(catalog.text.contains("library/nginx"), "{}", catalog.text);
    println!("ok: image pulled through the docker.io cache");

    // A check script, graded on the jumphost: FAIL, then PASS
    let check = "kubectl get namespace app-team1";
    assert_ne!(lab::checks::run_script(&docker, &f.jumphost.name, name, check, 30).await.unwrap().0, 0);
    assert_eq!(f.on_jumphost("kubectl create namespace app-team1").await.exit_code, 0);
    assert_eq!(lab::checks::run_script(&docker, &f.jumphost.name, name, check, 30).await.unwrap().0, 0);
    println!("ok: a check graded on the jumphost");

    // Quitting the app stops the cluster and cache (and the app's own
    // jumphost, not this test's); starting it again brings them back,
    // workloads included
    let containers = [format!("{name}-control-plane"), format!("{name}-worker"), infra::MIRROR.to_string()];
    let running = async |container: &str| {
        docker.inspect_container(container, None).await.ok().and_then(|c| c.state?.running).unwrap_or(false)
    };
    runtime::reconcile::on_exit(&f.kind);
    eventually("quitting stops the nodes and cache", 30, async || {
        for c in &containers {
            if running(c).await {
                return false;
            }
        }
        true
    })
    .await;
    runtime::reconcile::on_startup(&docker, &f.kind, &runtime::activity::Activities::silent(), &[]).await;
    eventually("starting again brings back the nodes and the pod", 90, async || {
        let out = f.on_jumphost("kubectl get nodes --no-headers | grep -cw Ready; kubectl get pod web -o jsonpath='{.status.phase}'").await;
        out.text.split_whitespace().collect::<Vec<_>>() == ["2", "Running"]
    })
    .await;

    f.delete(name).await;
    let out = f.on_jumphost("kubectl config get-contexts -o name 2>&1").await;
    assert!(!out.text.contains(name), "{}", out.text);
    println!("ok: context removed from the jumphost");
    f.teardown().await;
}

/// The monitor notices nodes going away and coming back, live:
/// `cargo test monitor -- --ignored --nocapture`
#[tokio::test]
#[ignore]
async fn monitor_tracks_node_failure_and_repair() {
    use runtime::model::{ContainerStatus, Readiness};
    let f = fixture("monitor");
    let name = "ckpro-mon";
    let env = Arc::new(Env::new(|_| {}));
    // Readiness is followed while it is shown (the Environment page)
    env.set_watch_nodes(true);
    f.create(name, 1).await;
    runtime::monitor::start(env.clone(), f.kind.clone(), f.infra.clone(), runtime::activity::Activities::silent(), runtime::guard::Guard::new(|_| {}), vec![]);
    let worker = format!("{name}-worker");

    eventually("all nodes Ready", 120, async || {
        env.snapshot().clusters.first().is_some_and(|c| c.nodes.len() == 2 && c.nodes.iter().all(|n| n.ready == Readiness::Ready))
    })
    .await;

    let docker = runtime::docker::connect().await.unwrap();
    docker.stop_container(&worker, None::<bollard::query_parameters::StopContainerOptions>).await.unwrap();
    eventually("stopped worker reported as an issue", 60, async || {
        let s = env.snapshot();
        s.clusters.iter().flat_map(|c| &c.nodes).any(|n| n.name == worker && n.container == ContainerStatus::Stopped)
            && s.issues.iter().any(|i| i.component == worker)
    })
    .await;

    runtime::reconcile::repair(&docker, name).await.unwrap();
    eventually("worker Ready again, no issues", 120, async || {
        let s = env.snapshot();
        s.issues.is_empty() && s.clusters.first().is_some_and(|c| c.nodes.iter().all(|n| n.ready == Readiness::Ready))
    })
    .await;

    f.delete(name).await;
    eventually("cluster gone from the state", 30, async || env.snapshot().clusters.is_empty()).await;
    f.teardown().await;
}

/// A whole attempt through the exam engine, both modes, on a one-question
/// exam: `cargo test exam_engine -- --ignored --nocapture`
/// A pack with one exam ("core/one") of one question, on `cluster`
fn one_question_pack(name: &str, cluster: &str) -> (std::path::PathBuf, lab::load::LoadedPack) {
    let pack_dir = std::env::temp_dir().join(format!("ckpro-e2e-pack-{name}"));
    let _ = std::fs::remove_dir_all(&pack_dir);
    let core = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
    std::fs::create_dir_all(pack_dir.join("questions/cka")).unwrap();
    std::fs::create_dir_all(pack_dir.join("exams")).unwrap();
    std::fs::copy(core.join("pack.yaml"), pack_dir.join("pack.yaml")).unwrap();
    let question_yaml = std::fs::read_to_string(core.join("questions/cka/rbac-ci-token.yaml")).unwrap();
    std::fs::write(pack_dir.join("questions/cka/rbac-ci-token.yaml"), format!("{question_yaml}\ncluster: {cluster}\n")).unwrap();
    std::fs::write(pack_dir.join("exams/one.yaml"), "title: One\ncertification: cka\nquestions: [core/cka/rbac-ci-token]\n").unwrap();
    let (pack, findings) = lab::load::load(&pack_dir);
    assert!(findings.is_empty(), "{:?}", findings.iter().map(|f| &f.message).collect::<Vec<_>>());
    (pack_dir, pack.unwrap())
}

#[tokio::test]
#[ignore]
async fn exam_engine_practice_and_exam_modes() {
    use lab::exam::{ExamState, Exams, Mode};
    // A cluster of its own: kind names are global, and `k8s` is the app's
    // (a running exam's cluster would be replaced)
    let cluster = "ckpro-e2e-exam";
    let (pack_dir, pack) = one_question_pack("exam", cluster);

    let db = std::env::temp_dir().join("ckpro-e2e-exam.db");
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", db.display()));
    }
    let store = Arc::new(store::Store::open(&db).unwrap());
    let f = fixture("exam");
    let desktop = "ckpro-desktop-test-exam";
    // The monitor feeds the guard Docker's events, as in the app
    let guard = runtime::guard::Guard::new(|what| println!("  guard: {what}"));
    runtime::monitor::start(Arc::new(Env::new(|_| {})), f.kind.clone(), f.infra.clone(), runtime::activity::Activities::silent(), guard.clone(), vec![]);
    let exams = Arc::new(Exams::new(pack, f.kind.clone(), f.infra.clone(), f.jumphost.clone(), desktop, store.clone(), |_: &ExamState| {}, runtime::activity::Activities::new(|_| {}, |_, line: &str| println!("  | {line}")), guard.clone()));
    let question = "core/cka/rbac-ci-token";
    let wait_running = async || {
        for _ in 0..300 {
            match exams.state() {
                ExamState::Running { .. } => return,
                ExamState::Failed { message, .. } => panic!("exam failed: {message}"),
                _ => tokio::time::sleep(Duration::from_secs(1)).await,
            }
        }
        panic!("exam never started");
    };

    // Practice: check, solve, check, submit
    let started = std::time::Instant::now();
    exams.start("core/one", Mode::Practice, true).await.unwrap();
    wait_running().await;
    println!("ok: exam ready in {:.1} s (cluster, task host, desktop, setup)", started.elapsed().as_secs_f64());
    let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
    assert!(ends_at.is_none() && !attempt.questions[0].hints.is_empty());
    let failing = exams.check_question(question).await.unwrap();
    assert!(failing.iter().all(|c| !c.passed));
    println!("ok: practice check fails before solving");

    // The guard: the Mac is shut out of the API server, and what is done
    // to the environment outside the exam desktop is put back and noted
    let kubeconfig = f.kind.kubeconfig(cluster);
    eventually("kubectl from the host is refused", 30, async || {
        !std::process::Command::new("kubectl")
            .args(["--kubeconfig", &kubeconfig.to_string_lossy(), "--request-timeout=3s", "get", "ns"])
            .output()
            .is_ok_and(|o| o.status.success())
    })
    .await;
    println!("ok: kubectl from the host cannot reach the cluster during the attempt");
    let docker_cli = runtime::docker::cli().expect("docker CLI");
    let outside_cmd = |args: &[&str]| std::process::Command::new(&docker_cli).args(args).output().unwrap();
    outside_cmd(&["exec", &format!("{cluster}-control-plane"), "true"]);
    eventually("an outside exec is noted", 15, async || guard.outside().iter().any(|o| o.contains("command was run"))).await;
    outside_cmd(&["stop", "-t", "1", desktop]);
    eventually("a desktop stopped outside is started again", 30, async || {
        guard.outside().iter().any(|o| o.contains("stopped outside")) && outside_cmd(&["inspect", "-f", "{{.State.Running}}", desktop]).stdout.starts_with(b"true")
    })
    .await;
    println!("ok: an outside exec is noted; a desktop stopped outside is started again");

    // The practice coach answers about the failing check (the real model,
    // when Claude Code is installed) and keeps the conversation
    if runtime::docker::cli().is_some() {
        let streamed = std::sync::Mutex::new(String::new());
        let coach = ai::Coach::new();
        let context = ai::CoachContext { checks: true, cluster: true };
        let answer = coach
            .ask(&exams, &store, question, "Why do my checks fail? One sentence.", &failing, false, "haiku", "default", ai::Profile::Ask, context, |event| {
                if let ai::CoachEvent::Text { text } = event {
                    streamed.lock().unwrap().push_str(&text)
                }
            })
            .await
            .unwrap()
            .text;
        assert!(!answer.trim().is_empty() && !streamed.lock().unwrap().is_empty());
        assert_eq!(ai::Coach::history(&exams, &store, question).unwrap().messages.len(), 2);
        println!("ok: the practice coach answers and keeps the conversation: {}", answer.lines().next().unwrap_or_default());
    } else {
        println!("skip: the practice coach (Claude Code is not installed)");
    }

    // The exam desktop, as the candidate uses it
    let docker = runtime::docker::connect().await.unwrap();
    let session = runtime::desktop::session(&docker, desktop).await.unwrap().expect("a desktop session");
    assert!(tokio::net::TcpStream::connect(("127.0.0.1", session.port)).await.is_ok() && session.password.len() == 8);
    println!("ok: desktop VNC on 127.0.0.1:{} behind a password", session.port);
    let on_base = async |cmd: &str| {
        exec::run(&docker, desktop, &["bash", "-lc", cmd], &[], None).await.unwrap()
    };
    let out = on_base("hostname; whoami; command -v kubectl || echo no-kubectl").await;
    assert_eq!(out.text.split_whitespace().collect::<Vec<_>>(), ["base", "candidate", "no-kubectl"], "{}", out.text);
    println!("ok: the desktop is candidate@base, without kubectl");
    let out = on_base(&format!("ssh -o BatchMode=yes {cluster} 'kubectl config current-context && kubectl get nodes --no-headers | wc -l && yq --version'")).await;
    let lines: Vec<&str> = out.text.lines().collect();
    assert!(out.exit_code == 0 && lines.first() == Some(&cluster) && out.text.contains("mikefarah"), "{}", out.text);
    println!("ok: `ssh <cluster>` from base reaches the task host on its context, with yq");
    let out = on_base("cat /usr/share/firefox-esr/distribution/policies.json").await;
    assert!(out.text.contains("https://kubernetes.io/docs*") && out.text.contains("https://gateway-api.sigs.k8s.io*"), "{}", out.text);
    println!("ok: Firefox allows the CKA documentation only");

    // The candidate's day on base: ssh to the task host and the nodes, the
    // hosts' tools, the browser, the editor, the keyboard; how fast, how big
    let started = std::time::Instant::now();
    let out = on_base(&format!("ssh -o BatchMode=yes {cluster} true")).await;
    assert_eq!(out.exit_code, 0, "{}", out.text);
    println!("ok: ssh to the task host in {} ms", started.elapsed().as_millis());
    let out = on_base(&format!(
        "ssh -o BatchMode=yes {cluster}-control-plane 'test -f /etc/kubernetes/manifests/etcd.yaml && echo static-pods' \
         && ssh -o BatchMode=yes {cluster}-worker hostname"
    ))
    .await;
    assert!(out.exit_code == 0 && out.text.contains("static-pods") && out.text.contains(&format!("{cluster}-worker")), "{}", out.text);
    println!("ok: ssh from base to the nodes");
    let out = on_base(&format!(
        "ssh -o BatchMode=yes {cluster} bash -s <<'EOF'\n\
         bash -ic 'type k; complete -p k' 2>/dev/null\n\
         helm version --short\n\
         etcdctl version | head -1\n\
         etcdutl version | head -1\n\
         man -w ls\n\
         EOF"
    ))
    .await;
    for expected in ["k is aliased to `kubectl'", "complete", "v3.", "etcdctl version", "etcdutl version", "/usr/share/man"] {
        assert!(out.text.contains(expected), "no {expected:?} in {}", out.text);
    }
    println!("ok: the task host has k (with completion), helm, etcdctl, etcdutl, man");
    let out = on_base(
        "python3 -c \"import urllib.request as u; print(u.urlopen('https://kubernetes.io/pagefind/pagefind-entry.json', timeout=20).status)\"",
    )
    .await;
    assert_eq!(out.text.trim(), "200", "{}", out.text);
    println!("ok: kubernetes.io search (Pagefind) is reachable from base");
    let out = on_base(
        "codium --no-sandbox --version | head -1 && ! grep -q extensionsGallery /usr/share/codium/resources/app/product.json && command -v onboard",
    )
    .await;
    assert_eq!(out.exit_code, 0, "{}", out.text);
    println!("ok: VSCodium {} (no extension marketplace) and the virtual keyboard", out.text.lines().next().unwrap_or_default());
    // A closed window's orphans (here a shell's child) are reaped, not left as zombies
    let out = on_base("sh -c 'sleep 0.2 &' ; sleep 1; ps -eo stat= | grep -c '^Z' || true").await;
    assert_eq!(out.text.trim(), "0", "zombies on the desktop: {}", out.text);
    println!("ok: the desktop reaps orphaned processes");
    let started = std::time::Instant::now();
    assert_eq!(on_base("DISPLAY=:1 nohup firefox-esr >/tmp/firefox.log 2>&1 &").await.exit_code, 0);
    eventually("Firefox runs on the desktop", 30, async || {
        on_base("pgrep -f firefox-esr >/dev/null && ! grep -qiE 'crash|segfault' /tmp/firefox.log").await.exit_code == 0
    })
    .await;
    println!("  firefox up in {} ms", started.elapsed().as_millis());
    let stats = std::process::Command::new("docker")
        .env("PATH", runtime::docker::cli_path())
        .args(["stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}} {{.CPUPerc}}"])
        .output()
        .unwrap();
    let containers = [desktop.to_string(), f.jumphost.name.clone(), format!("{cluster}-control-plane"), format!("{cluster}-worker")];
    for line in String::from_utf8_lossy(&stats.stdout).lines().filter(|l| containers.iter().any(|c| l.starts_with(&format!("{c} ")))) {
        println!("  {line}");
    }
    assert_eq!(on_base("command -v codium").await.exit_code, 0);
    exams.reset_desktop().await.unwrap();
    // VNC itself must be back, not just the container (a stale X lock once
    // kept Xvnc down while websockify kept the container up)
    eventually("Reset desktop brings back VNC, VSCodium and the same allowed docs", 30, async || {
        runtime::desktop::session(&docker, desktop).await.ok().flatten().is_some()
            && on_base("exec 3<>/dev/tcp/127.0.0.1/5901 && grep -q kubernetes.io/docs /usr/share/firefox-esr/distribution/policies.json").await.exit_code == 0
    })
    .await;
    let solution = exams.solution(question).unwrap();
    let docker = runtime::docker::connect().await.unwrap();
    let (exit, out) =
        lab::checks::run_script(&docker, &f.jumphost.name, cluster, &solution.run, 300).await.unwrap();
    assert_eq!(exit, 0, "{out}");
    assert!(exams.check_question(question).await.unwrap().iter().all(|c| c.passed));
    println!("ok: practice check passes after solving");
    exams.submit().unwrap();
    eventually("practice graded 100%", 60, async || {
        matches!(exams.state(), ExamState::Finished { ref result, .. } if result.score == 100.0 && result.passed)
    })
    .await;
    let ExamState::Finished { result, .. } = exams.state() else { unreachable!() };
    // Exactly what was done above: not ckpro's own restarts or kind's execs
    assert!(result.outside.len() == 2 && !result.outside.iter().any(|o| o.contains("disconnected")), "{:?}", result.outside);
    println!("ok: the result lists what was done outside the exam desktop: {:?}", result.outside);
    eventually("the nodes' memory measured", 30, async || store.footprint().unwrap().control_plane_mb > 0).await;
    println!("ok: measured the nodes: {:?}", store.footprint().unwrap());
    exams.end().await.unwrap();
    assert!(matches!(exams.state(), ExamState::Idle) && !f.kind.owned_clusters().contains(&cluster.to_string()));
    assert!(runtime::desktop::session(&runtime::docker::connect().await.unwrap(), desktop).await.unwrap().is_none());
    println!("ok: ending removes the clusters and the desktop");

    // Exam: nothing hidden leaks, nothing to check, unsolved scores 0
    exams.start("core/one", Mode::Exam, true).await.unwrap();
    wait_running().await;
    let ExamState::Running { attempt, ends_at, .. } = exams.state() else { unreachable!() };
    assert!(ends_at.is_some() && attempt.questions[0].hints.is_empty());
    assert!(exams.check_question(question).await.is_err() && exams.solution(question).is_err());
    assert!(exams.coach_subject(question, false).is_err());
    println!("ok: exam mode hides hints, checks, solutions and the coach");
    // Quitting the app mid-exam: work in progress on the task host and in
    // the cluster, everything stopped (as on quit), then a new engine on
    // the same data resumes it with that work intact
    let docker = runtime::docker::connect().await.unwrap();
    let work = format!("mkdir -p /tmp/exam && echo in-progress > /tmp/exam/answer.txt && kubectl --context {cluster} create configmap work-in-progress");
    assert_eq!(lab::checks::run_script(&docker, &f.jumphost.name, cluster, &work, 60).await.unwrap().0, 0);
    let nodes = docker
        .list_containers(Some(bollard::query_parameters::ListContainersOptions {
            filters: Some(std::collections::HashMap::from([("label".to_string(), vec![format!("io.x-k8s.kind.cluster={cluster}")])])),
            ..Default::default()
        }))
        .await
        .unwrap();
    // Quitting the app: the guard stops reacting first, as on RunEvent::Exit
    guard.suspend();
    let mut stopped: Vec<String> = nodes.into_iter().flat_map(|c| c.names.unwrap_or_default()).map(|n| n.trim_start_matches('/').to_string()).collect();
    stopped.extend([f.jumphost.name.clone(), desktop.to_string()]);
    for name in &stopped {
        docker.stop_container(name, None::<bollard::query_parameters::StopContainerOptions>).await.unwrap();
    }
    println!("ok: quit mid-exam, {} containers stopped", stopped.len());
    let reopen = || {
        Arc::new(Exams::new(lab::load::load(&pack_dir).0.unwrap(), f.kind.clone(), f.infra.clone(), f.jumphost.clone(), desktop, Arc::new(store::Store::open(&db).unwrap()), |_: &ExamState| {}, runtime::activity::Activities::silent(), guard.clone()))
    };
    let resumed = reopen();
    resumed.restore();
    assert!(matches!(resumed.state(), ExamState::Resuming { .. }));
    eventually("a running exam survives restarting the app (resuming, then running)", 90, async || {
        matches!(resumed.state(), ExamState::Running { attempt: ref again, ends_at: again_ends, .. }
            if again.id == attempt.id && again_ends == ends_at)
    })
    .await;
    assert!(resumed.solution(question).is_err());
    let (exit, out) = lab::checks::run_script(
        &docker,
        &f.jumphost.name,
        cluster,
        "cat /tmp/exam/answer.txt && kubectl get configmap work-in-progress -o name",
        60,
    )
    .await
    .unwrap();
    assert!(exit == 0 && out.contains("in-progress") && out.contains("configmap/work-in-progress"), "{out}");
    println!("ok: the work on the task host and in the cluster survived");
    eventually("the desktop's VNC is back after the restart", 30, async || {
        exec::run(&docker, desktop, &["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/5901"], &[], None).await.is_ok_and(|o| o.exit_code == 0)
    })
    .await;
    exams.submit().unwrap();
    eventually("exam graded, unsolved fails", 60, async || {
        matches!(exams.state(), ExamState::Finished { ref result, .. } if !result.passed)
    })
    .await;
    // Quitting and resuming (kind reading kubeconfigs) is ckpro's own doing
    let ExamState::Finished { result, .. } = exams.state() else { unreachable!() };
    assert!(result.outside.is_empty(), "{:?}", result.outside);
    println!("ok: nothing outside noted for an attempt only ckpro touched");
    assert!(exams.solution(question).is_ok());
    println!("ok: solution available after the result");
    exams.end().await.unwrap();
    assert_eq!(exams.history().len(), 2);
    println!("ok: both attempts in history");
    let after = reopen();
    after.restore();
    assert!(matches!(after.state(), ExamState::Idle));
    println!("ok: nothing to resume once the attempt has ended");
    f.teardown().await;
}

/// The committed bindings must match the commands (also runs in CI).
#[test]
fn bindings_export() {
    specta_builder()
        .export(typescript(), std::env::temp_dir().join("ckpro-bindings.ts"))
        .unwrap();
}

/// Create's proof: an exam of the packs proven whole on a cluster made
/// for it as big as it needs, its stages and results arriving as they go,
/// then saved; a question added proven alone after every setup; a proof
/// stopped by the candidate. No cluster outlives its proof
#[tokio::test]
#[ignore]
async fn create_proves_an_exam_as_it_goes_and_stops() {
    use lab::exam::{ExamState, Exams};
    use studio::draft::{DraftStatus, ExamDraft};
    use studio::proof::{ProofStage, Proofs, Scope};
    let dir = std::env::temp_dir().join("ckpro-e2e-create");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let store = Arc::new(store::Store::open(&dir.join("ckpro.db")).unwrap());
    let f = fixture("create");
    let core = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
    let guard = runtime::guard::Guard::new(|_| {});
    let activities = runtime::activity::Activities::new(|_| {}, |_, line: &str| println!("  | {line}"));
    let exams = Arc::new(Exams::new(lab::load::load(&core).0.unwrap(), f.kind.clone(), f.infra.clone(), f.jumphost.clone(), "ckpro-desktop-test-create", store.clone(), |_: &ExamState| {}, activities.clone(), guard));
    let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
    let proofs = Proofs::new({
        let seen = seen.clone();
        move |session, proof| seen.lock().unwrap().push((session, proof.map(|p| (p.stage.clone(), p.results.len()))))
    });
    let app = || studio::Proving { store: &store, exams: &exams, proofs: &proofs, activities: &activities, infra: f.infra.clone(), data_dir: &dir };
    let fits = |_| Ok(());
    let clusters = async || {
        let out = std::process::Command::new("docker").args(["ps", "-a", "--format", "{{.Names}}"]).output().unwrap();
        String::from_utf8_lossy(&out.stdout).lines().filter(|n| n.starts_with("k8s-v")).count()
    };
    let before = clusters().await;

    // Two workers needed: its cluster has them
    let session = store.studio_new().unwrap();
    let mut draft = ExamDraft::default();
    draft.set_exam(&exams.bank(), "E2E proof", "cka", Some(30)).unwrap();
    let ids = ["core/cka-003/q02-node-maintenance-cordon-drain".to_string(), "core/cka/rbac-ci-token".to_string(), "core/cka/fix-broken-image".to_string()];
    assert!(draft.add_existing(&exams.bank(), &ids[..2]).is_empty());
    assert_eq!(draft.items.last().unwrap().content().0, ids[0], "the drain runs last");
    draft.save(&store, session).unwrap();
    let plan = studio::plan(&store, &exams, &dir, session, fits).unwrap();
    assert_eq!((plan.workers, plan.changed, plan.problem.clone()), (2, 2, None), "{plan:?}");
    let proven = studio::verify(app(), session, Scope::Changed, fits).await.unwrap();
    assert!(proven.proven(), "{:?}", proven.items);
    let stages: Vec<_> = seen.lock().unwrap().iter().filter_map(|(_, p)| p.clone()).collect();
    println!("ok: stages {stages:?}");
    assert!(matches!(stages[0], (ProofStage::Cluster { workers: 2 }, 0)));
    assert!(stages.iter().any(|(s, _)| *s == ProofStage::SettingUp));
    assert!(stages.iter().any(|(s, n)| matches!(s, ProofStage::Proving { key, .. } if *key == ids[0]) && *n == 1), "the first result came before the second ran");
    assert_eq!(seen.lock().unwrap().last().unwrap(), &(session, None));
    assert_eq!(clusters().await, before, "its cluster went with it");
    println!("ok: proven whole on a cluster of its own, removed");

    // One more: only it is checked, after every setup
    seen.lock().unwrap().clear();
    let mut draft = ExamDraft::load(&store, session).unwrap();
    draft.add_existing(&exams.bank(), &ids[2..]);
    draft.save(&store, session).unwrap();
    assert_eq!(studio::plan(&store, &exams, &dir, session, fits).unwrap().changed, 1);
    let proven = studio::verify(app(), session, Scope::Changed, fits).await.unwrap();
    assert!(proven.proven(), "{:?}", proven.items);
    let results = seen.lock().unwrap().iter().filter_map(|(_, p)| p.as_ref().map(|(_, n)| *n)).max();
    assert_eq!(results, Some(1), "only the new one was checked");
    let id = studio::save(&store, &exams, &dir, session).unwrap();
    assert!(dir.join("packs/mine/exams/custom/e2e-proof.yaml").exists(), "{id}");
    println!("ok: the change proven alone, saved as {id}");

    // Stopped while its cluster is made: nothing proven, its cluster gone
    let session = store.studio_new().unwrap();
    let mut draft = ExamDraft::default();
    draft.set_exam(&exams.bank(), "E2E stop", "cka", None).unwrap();
    assert!(draft.add_existing(&exams.bank(), &ids[1..2]).is_empty());
    draft.save(&store, session).unwrap();
    let stopping = async {
        loop {
            if proofs.list().iter().any(|(s, p)| *s == session && matches!(p.stage, ProofStage::Cluster { .. })) {
                tokio::time::sleep(Duration::from_secs(15)).await;
                proofs.stop(session);
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    let (stopped, ()) = tokio::join!(studio::verify(app(), session, Scope::All, fits), stopping);
    assert!(matches!(stopped, Err(error::AppError::Cancelled { .. })), "{stopped:?}");
    assert!(proofs.list().is_empty());
    assert!(ExamDraft::load(&store, session).unwrap().statuses().all(|(_, s)| *s == DraftStatus::Linted));
    assert_eq!(clusters().await, before, "its cluster went with it");
    println!("ok: stopped, nothing proven, its cluster gone");
    f.teardown().await;
}
