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
  src-tauri/resources/    images for the desktop, task host and nodes
packages/ckdry-ui/        the UI kit (Radix, cva); live at desktop/kit.html
packs/core/               the question bank (YAML) and its JSON Schemas
```

## Environment (`runtime/`, `cluster/`)

- `docker.rs` finds the engine (OrbStack, Docker Desktop, Colima, Rancher)
  and keeps one client while it answers.
- `model.rs` holds `EnvState`, the single source of truth pushed to the
  interface on change: the engine, clusters and nodes, shared services.
- `monitor.rs` follows Docker events (container, network, volume), pings
  every 30 s and re-syncs every 5 min; node watches run only while shown. It
  backs off while Docker is down and retries on request.
- `infra.rs` runs the registry mirror and pulls (or builds) the images listed
  in `resources/images.json`; `jumphost.rs` and `desktop.rs` run the task host
  and the exam desktop.
- `preflight.rs` sizes an exam against the engine's memory before it starts,
  using what nodes were measured to take on this machine.
- `guard.rs` keeps a running attempt's environment as it was set up: the
  control planes drop the host's API traffic, containers stopped or paused
  outside the app are started again, outside `docker exec`s and network
  changes are recorded and shown on the result.
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
  Claude adapter in a container of the `agent` image (`docker run -i`, one
  per connection) on the candidate's own Claude login, kept in the
  `ckdry-claude` volume; `account.rs` reads it and signs in and out with the
  Claude CLI in that container (the link opens on the host, the code is
  pasted back).
- Sessions are per question, named from their first question, with the
  models and effort levels the agent offers.
- Ask profile: no tools. Agent profile: Claude's built-in tools stay off; the
  session gets the app's own MCP server (`mcp_http.rs`: Streamable HTTP on
  the host's loopback, reached as `host.docker.internal`, one token per run)
  with
  `run_command` (bash on the task host, the task cluster's kubeconfig, a time
  limit and an output cap) and `check_my_work`. Each call is a permission
  request the interface shows as a card; `policy.rs` decides what runs
  unasked and what never runs.
- Exam mode has no assistant: every assistant command and every MCP tool
  refuses while an exam-mode attempt runs.

## Interface

- One rule for controls: the kit first (`@ckdry/ui`); a pattern used twice
  becomes a kit component or variant.
- State comes from Rust events (exam, environment, activities); the
  interface never polls.
- Layout, panel sizes, the assistant's model and effort, and desk settings
  are kept in the database and restored on start.
