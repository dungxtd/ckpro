# Architecture

CK --dry-run (`ckdry`) is a Tauri v2 app: a Rust core that owns the
environment and the exam, and a React 19 interface that shows its state.
Everything runs in the host's Docker engine; the app keeps its state in one
SQLite database in its data directory.

## Layout

```
desktop/
  src/                    React 19, Vite, Tailwind v4, Zustand
    tauri/                the only module that talks to Rust (api.ts, generated bindings.ts)
    stores/               exam, coach, environment, activity, settings
    routes/               catalog, exam, history, environment, settings
    components/           exam desk, assistant, activity, history, account
  src-tauri/src/
    runtime/              the environment: Docker connection, live state, guard
    cluster/              kind clusters: create, delete, node access
    lab/                  question packs, checks, exam engine
    ai/                   the assistant: ACP client, agent, MCP server, policy
    terminal/             interactive shells over a Tauri channel
    store.rs              SQLite (migrations, settings, history, sessions)
    commands.rs           the commands the interface calls
    cli.rs                `ckdry lab …`, `ckdry mcp`, `ckdry images`
  src-tauri/resources/    images: agent, desktop, task host (jumphost), nodes
packages/ckdry-ui/        the UI kit (Radix, cva); live at desktop/kit.html
packs/core/               the question bank (YAML) and its JSON Schemas
```

## Environment (`runtime/`, `cluster/`)

- `docker.rs` finds the engine (OrbStack or Docker Desktop; Colima and
  Rancher sockets are tried too) and keeps one client while it answers. The
  host needs nothing else: kind is downloaded into the data directory, and
  kubeconfigs stay there.
- `model.rs` holds `EnvState`, the single source of truth pushed to the
  interface on change: the engine, clusters and nodes, shared services.
- `monitor.rs` follows Docker events (container, network, volume), pings
  every 30 s and re-syncs every 5 min; node watches run only while shown. It
  backs off while Docker is down and retries on request.
- `infra.rs` runs the registry mirror and pulls (or builds) the images listed
  in `resources/images.json` (tags are hashes of their files; CI publishes
  them); `jumphost.rs` and `desktop.rs` run the task host and the exam
  desktop. The desktop is XFCE over VNC (noVNC in the app): it has no logout,
  a session that ends anyway is started again, and it takes a new size only
  once a window or panel resize has stopped.
- `preflight.rs` sizes an exam against the engine's memory before it starts,
  using what nodes were measured to take on this machine.
- `guard.rs` keeps a running attempt's environment as it was set up: the
  control planes drop the host's API traffic, containers stopped or paused
  outside the app are started again, outside `docker exec`s and network
  changes are recorded and shown on the result. The app's own execs (checks,
  terminals, the agent's commands) are registered so they are not counted.
- `reconcile.rs` restarts what an app quit left stopped.

## Exam engine (`lab/`)

- A pack is YAML validated against generated JSON Schemas (`ckdry lab lint`);
  every question is proven on real clusters (`ckdry lab verify`): its checks
  fail after setup and pass after the solution.
- `exam/` draws an attempt (random draws favour unseen and unsolved
  questions), prepares clusters, task host and desktop, runs the timer,
  grades with the checks and keeps history. A running attempt survives
  quitting the app.
- `mine.rs` keeps the candidate's own questions, written by the assistant and
  verified before they are added.

## Assistant (`ai/`)

- `acp.rs` is an Agent Client Protocol client over stdio; `agent.rs` runs the
  Claude adapter through npx on the Mac's Claude CLI (found, or a path set in
  Settings) and its existing login; `account.rs` reads that login and signs
  in with the CLI when there is none. Agents are turned on one by one
  (`policy::AgentSettings::enabled`); the assistant offers those turned on
  and signed in, and the core refuses the others.
- Sessions are per question (renamable, kept in SQLite), named by a quick
  model from their first question, with the models and effort levels the
  agent offers for the signed-in plan.
- Ask profile: no tools. Agent profile (practice only): Claude's built-in
  tools stay off; the session gets the app's own MCP server (`mcp_http.rs`:
  Streamable HTTP on the loopback, one token per run) with `run_command` (bash on the task host with the task
  cluster's kubeconfig, a time limit and an output cap) and `check_my_work`.
  Each call is an ACP permission request shown as a card; `policy.rs` and
  Settings > AI > Tool access decide what runs unasked and what never runs.
  Privacy settings decide whether the last check and a cluster snapshot go
  with a question, and whether Claude Code reports telemetry.
  Commands run go into the answer; a question they touched shows "Claude
  helped" on the result.
- `mcp.rs` holds the tools, shared by the HTTP server and `ckdry mcp` (stdio,
  read-only, for agents outside the app).
- `generate.rs` writes a question with the assistant, lints it and proves it
  on a cluster before it joins the candidate's own pack.
- Exam mode has no assistant: every assistant command and every MCP tool
  refuses while an exam-mode attempt runs.

## Interface

- One rule for controls: the kit first (`@ckdry/ui`); a pattern used twice
  becomes a kit component or variant.
- State comes from Rust events (exam, environment, activities); the
  interface never polls.
- Layout, panel sizes, the assistant's model and effort, and desk settings
  are kept in the database and restored on start; the window keeps its size
  and place.
- Settings (⌘,), in tabs: Exam desk; AI (the assistant switch and profile;
  the agents as a list, each opening in a side panel: on or off, its CLI,
  account, model, effort, telemetry; Tool access and Privacy for every
  agent); About.
- Areas that stop pointer events (the VNC canvas) register with the kit's
  `useDismissSurface`, so menus still close on a press there.
