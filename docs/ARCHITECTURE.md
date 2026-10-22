# CKX Desktop — architecture and roadmap

## Why

CK-X sets up exam environments with shell scripts chained over ssh
(facilitator → jumphost → dind → env-setup). Failures surface late and
vaguely, and state lives in several places. CKX Desktop is a native app that
**controls the runtime itself and always knows the environment state**:
if Docker stops, a node goes NotReady, a cache dies or a pod is stuck, the UI
shows it live with a fix hint — no "run script, read logs".

Stack follows `/Users/d/pwd/nextflix` (Tauri v2, React 19, Vite, Tailwind v4,
Zustand, tauri-specta, rusqlite, tracing, updater + Homebrew), adapted to an
infrastructure app.

## Shape

```
ckx-desktop/                      pnpm monorepo
├─ desktop/                       Tauri app
│  ├─ src/                        React 19
│  │  ├─ tauri/                   the ONLY place that imports @tauri-apps/api
│  │  │                           (invoke wrappers + typed event subscriptions)
│  │  ├─ stores/                  zustand slices: env, jobs, exam, settings
│  │  ├─ routes/                  catalog · environment · exam · results · settings
│  │  └─ components/              exam/, terminal/, env/
│  └─ src-tauri/src/
│     ├─ error.rs                 AppError (thiserror) built at the source, typed codes
│     ├─ runtime/                 environment controller
│     │  ├─ docker.rs             engine connection (OrbStack/Docker Desktop/…)
│     │  ├─ model.rs              EnvState: docker, clusters/nodes, jumphost, caches, issues
│     │  ├─ monitor.rs            Docker events + Kubernetes watches → EnvState → UI
│     │  ├─ reconcile.rs          startup/periodic: orphans, stopped nodes, caches
│     │  ├─ preflight.rs          resources/ports/engine checks before a lab
│     │  └─ jobs.rs               long operations: steps, progress, cancel, cleanup
│     ├─ cluster/                 kind binary, topology → kind config, node image
│     │                           (sshd), registry caches, jumphost image
│     ├─ lab/                     typed lab schema, lab pack loading, exam engine,
│     │                           scoring (scripts run in the jumphost)
│     ├─ terminal/                docker exec TTY over tauri::ipc::Channel
│     ├─ db/                      rusqlite: attempts, results, settings
│     └─ observability/           tracing + rolling logs + optional Sentry
├─ packages/ckx-ui                UI kit forked from @nextflix/ui
└─ labs/                          lab pack (from CK-X) + JSON schema, versioned
```

## Improvements over nextflix (domain-specific)

| Area | nextflix | CKX Desktop |
|---|---|---|
| Errors | `CmdError` classified by sniffing message text | `AppError` variants created where the failure happens (`DockerUnavailable`, `InsufficientResources`, `ClusterFailed`, `LabInvalid`, `Cancelled`, …) |
| Events | untyped `app.emit("x://y")`, listened outside `src/tauri/` | typed specta events; listening only in `src/tauri/` |
| Streams | global events | `tauri::ipc::Channel` per terminal / job |
| Shutdown | empty `RunEvent` handler | `RunEvent::Exit` stops jobs; reconcile on next start cleans orphans (everything labelled `ckx.*`) |
| Content | from APIs | lab pack separate from the binary, schema-validated at load, updatable without an app release |
| Long work | ad-hoc spawns | `jobs` with steps, progress, cancellation and rollback |
| Tests | none by policy | a few opt-in e2e tests on real Docker (cluster lifecycle, scoring, cleanup); UI checked by hand |
| Release | ad-hoc signed | same pipeline, plus Apple notarization since the app is distributed |
| TS | desktop `strict:false` | strict everywhere |

## Runtime model (the core idea)

`EnvState` is the single source of truth in Rust, pushed to the UI on change:

- **docker**: reachable?, engine, CPUs/memory
- **clusters**: per cluster, per node: container state, Kubernetes Ready, kubelet
- **jumphost**, **registry caches**: container state
- **exam**: phase (preparing/ready/grading/…), current job
- **issues**: derived list `{severity, component, message, hint}`, e.g.
  "Docker stopped", "node k8s-worker2 NotReady (kubelet)", "cache down: pulls
  go upstream", "4 GB free, lab needs 5 GB"

Sources: Docker events (filtered by `ckx.*` labels) and Kubernetes watches on
nodes/pods, plus a slow periodic sweep as a safety net. The UI never polls.

## Roadmap

1. **Foundation**: monorepo, React/Tailwind/@ckx/ui, tauri-specta, AppError,
   observability, db; port the spike (cluster, script, terminal) onto it.
2. **Runtime controller**: EnvState + monitor + issues panel, preflight,
   reconcile, jobs with cancel.
3. **Cluster parity with CK-X**: node image with sshd, registry caches,
   metrics-server, jumphost image, multi-cluster contexts.
4. **Lab engine**: lab pack + schema, exam flow (setup → timer → terminal →
   submit → score → results/history).
5. **Distribution**: updater, release CI matrix, Homebrew cask, notarization.

Each phase ends with `tsc --noEmit`, `biome check`, `cargo check`, the opt-in
e2e tests and a manual run.
