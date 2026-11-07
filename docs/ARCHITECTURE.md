# Architecture

CKtry (`cktry`) is a Tauri v2 app: a Rust core that owns the environment,
the exam, the study plan and the assistant, and a React 19 interface that
shows their state. Everything runs in the host's Docker engine; the app
keeps its state in one SQLite database in its data directory. Every feature
works without AI; the assistant is turned on in Settings, and never runs in
exam mode.

## Layout

```
desktop/
  src/                    React 19, Vite, Tailwind v4, Zustand
    tauri/                the only module that talks to Rust (api.ts, generated bindings.ts)
    stores/               exam, environment, activity, settings, study, coach, studio
    routes/               home, calendar, create, catalog (exams), exam, history,
                          environment, settings
    components/           exam/ (the desk), assistant/, text/, shell/ (sidebar,
                          title bar, capsule), study/ (shared by Home and Calendar),
                          then one folder per screen
    kit/gallery.tsx       the design system, live (desktop/kit.html)
  src-tauri/src/
    runtime/              the environment: Docker, live state, infra, guard, activities
    cluster/              kind clusters: create, repair, delete (one job per cluster)
    lab/                  packs, checks, lint, verify, the candidate's own pack (mine)
      exam/               the exam engine: draw, prepare, grade, plans, readiness
    studio/               Create: the draft exam, its script rules, proofs, save
    ai/                   the assistant: ACP client, agent, sessions, permissions,
                          login, MCP tools (coach and Create), policy
    store/                SQLite: schema, attempts and history, settings, plans,
                          coach and Create conversations
    commands.rs           the commands the interface calls
    lib.rs                setup, managed state, events
    error.rs              AppError, the typed error contract
    cli.rs                `cktry lab …`, `cktry images`
    e2e.rs                end-to-end tests on Docker (opt-in)
  src-tauri/resources/    images: desktop, task host (jumphost), nodes
packages/cktry-ui/        the UI kit (Radix, cva)
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
  using what nodes were measured to take on this machine. It is the only
  judge of whether an exam fits; the interface's memory hint is a display.
- `guard.rs` keeps a running attempt's environment as it was set up: the
  control planes drop the host's API traffic, containers stopped or paused
  outside the app are started again, outside `docker exec`s and network
  changes are recorded and shown on the result. The app's own execs (checks,
  the agent's commands) are registered so they are not counted.
- `activity.rs` is every long operation the user waits on (preparing,
  grading, creating or repairing clusters): its steps, elapsed time and log,
  shown the same way everywhere and kept for the Activity list.
- `reconcile.rs` restarts what an app quit left stopped.

## Exam engine (`lab/`)

- A pack is YAML validated against generated JSON Schemas (`cktry lab lint`);
  every question is proven on real clusters (`cktry lab verify`): its checks
  fail after setup and pass after the solution.
- `exam/` draws an attempt (random draws favour unseen and unsolved
  questions), prepares clusters, task host and desktop, runs the timer,
  grades with the checks and keeps history. A running attempt survives
  quitting the app. It also remembers what the candidate saw during the
  attempt ("Check my work" results, solutions opened), which is what the
  coach may be told.
- `exam/plan.rs` is the study plan, worked out from the history without AI:
  plans (an exam on a day, as an exam or as practice) and readiness for the
  target exam. A score is predicted only once enough of the exam is measured
  (`predict_at`). Days are the candidate's own (the interface sends its
  offset).
- `mine.rs` is the candidate's own pack (`packs/mine` in the data
  directory), merged with the bundled one: questions written in Create, an
  exam per certification of them all, and exams built in Create
  (`exams/custom`). A save writes its files as one step: when any part
  fails, what was written is removed.

## Study (Home, Calendar)

- Home: the target exam set from a terminal line (`kubectl set exam …`), the
  day's plan, the week, readiness, and the prep map (each day of the
  preparation tinted by its best score).
- Calendar: month, week and day views of plans and attempts; an exam is
  planned on a day from a picker, switched between exam and practice, moved
  or removed.
- Both read the same figures (`stores/study.ts`, `components/study/`), read
  again when Rust says the study changed (`StudyChanged`): an attempt ends, a
  plan or the target changes, an exam is deleted or saved.

## Create (`studio/`, `ai/studio*.rs`)

- A conversation builds an exam: Claude reads what the app knows through
  read-only MCP tools (`ai/studio_tools.rs`: the target, readiness, attempts
  and their failed checks, plans, exams, questions) and changes only the
  draft. It runs nothing.
- `studio/draft.rs` checks each question as it comes (format,
  certification, the proof cluster's shape, no twin of an existing
  question, lint, and the script rules of `rules.rs`, enforced in code). One
  question at most changes the nodes, and it runs last. Every change to the
  draft goes through `studio::edit`, refused while the exam is being
  proven.
- `studio/proof.rs` proves the whole exam as an exam runs it: a cluster as
  big as the exam needs, made for the proof and removed after it. Only
  questions added or changed since their last proof run again. Proofs stop
  when an exam-mode attempt starts.
- Save is the candidate's, once every new question is proven: the questions
  and the exam go into `mine`, and the catalog reads them again.
- Works with the assistant off too: the screen says so instead of a chat.

## Assistant (`ai/`)

- `acp.rs` is an Agent Client Protocol client over stdio; `agent.rs` runs the
  Claude adapter through npx on the Mac's Claude CLI (found, or a path set in
  Settings) and its existing login; `account.rs` reads that login and signs
  in with the CLI when there is none. One switch turns the assistant on or
  off (`policy::AgentSettings`); off, nothing asks an agent. The adapter
  stops after a while unused.
- `sessions.rs`: coach sessions are per question, several each (New Session
  keeps the earlier ones; History reads a finished attempt's back),
  renamable and kept in SQLite, named by a quick model from their first
  question. `prompt.rs` holds what the coach is told; only what the
  candidate saw goes with a question (checks run, a solution opened).
- Ask profile: no tools. Agent profile (practice only): Claude's built-in
  tools stay off; the session gets the app's own MCP server (`mcp_http.rs`:
  Streamable HTTP on the loopback, one token per run) with `run_command`
  (bash on the task host with the task cluster's kubeconfig, a time limit and
  an output cap) and `check_my_work` (`mcp.rs`). Each call is an ACP
  permission request (`permissions.rs`) shown as a card; `policy.rs` and
  Settings > Assistant > Tool access decide what runs unasked and what never
  runs. Privacy settings decide whether the last check and a cluster
  snapshot go with a question. A question the agent touched shows "Claude
  helped" on the result.
- `generate.rs` writes one question for `cktry lab generate` (the CLI); its
  rules and schema are also what Create's conversation is told.

## Rules the core keeps

- **One guard for the assistant**: `Exams::assistant_allowed()` refuses
  every assistant command and MCP tool while an exam-mode attempt runs
  (`AppError::ExamMode`); `Coach::require_enabled` refuses while it is off
  (`AssistantOff`).
- **Errors are typed** where they happen (`AppError`: `DockerUnavailable`,
  `Busy`, `ExamMode`, `AssistantOff`, `Preflight`, `ClustersExist`, …) and
  reach the interface as `{ code, message }`; it branches on `code`.
- **Events, not polling**: Rust pushes `EnvChanged`, `ExamChanged`,
  `ActivityChanged` and `ActivityLog`, `GuardNotice`, `StudyChanged`,
  `StudioDraft` and `StudioProof`; the stores follow them for the life of
  the app. A wait Rust can answer (the exam desktop coming up) is one long
  call, not a loop.
- **State lives in SQLite** (`store/`): new fields get `#[serde(default)]`;
  schema changes are new migrations.

## Interface

- One rule for controls: the kit first (`@cktry/ui`); a pattern used twice
  becomes a kit component or variant, shown in the gallery.
- Layout is CSS: the shell's state is a few data attributes on its root
  (`data-morphing`, `data-inspecting`) and CSS variables; script only
  decides what CSS cannot (whether the capsule fits whole or as a dock).
- Each view subscribes to the fields it reads from a store, not the whole
  store.
- Settings (⌘,): Interface, Exam desk and Assistant (the one switch;
  the agent's CLI, account, model and effort; Tool access and Privacy), each
  a page, with the app's version and data folder below. Layout, panel
  sizes, the sidebar and desk settings are kept in the database; the window
  keeps its size and place.
- Starting an exam whose clusters exist asks first, from any screen; a start
  that fails says why in a toast.
- Areas that stop pointer events (the VNC canvas) register with the kit's
  `useDismissSurface`, so menus still close on a press there.
