# ckpro

Tauri v2 desktop app for practising the CKA/CKAD/CKS exams on local kind
clusters: Rust core in `desktop/src-tauri`, React 19 interface in
`desktop/src`, UI kit in `packages/ckpro-ui`, question bank in `packs/core`.
Architecture: `docs/ARCHITECTURE.md`.

## Invariants

- **Exam mode is AI-free.** Every assistant command and MCP tool refuses
  while an exam-mode attempt runs; Agent (commands) is practice-only.
- **The host needs only Docker.** Clusters, task host, desktop and mirror run
  in Docker under the `ckpro` compose project; kind and kubeconfigs stay in
  the data directory. The optional host tools are the agent CLIs (Claude
  Code, with Node.js for its adapter), used with their own logins. During an
  attempt the guard keeps the
  environment as set up.
- **State lives in SQLite** (`store/`): settings, attempts, history, coach
  sessions, encrypted (SQLCipher) with a key bound to this computer
  (`store/key.rs`). New fields get `#[serde(default)]`; schema changes are new
  migrations, never edits to old ones.
- **Rust owns the truth**; the interface renders events and never polls.
- **Errors are typed** (`AppError`) where they happen; the interface branches
  on `code`.
- **One place knows the system**: what differs between macOS, Linux and
  Windows is a `Platform` method (`src-tauri/src/platform/`), implemented
  per system; no `cfg` on the system outside it (tests that need a Unix
  shell aside).
- **Programs, not shells**: every program the app starts goes through
  `platform::command`, its arguments as a list, never a shell line; one
  that starts others runs in a `platform::ProcessTree`, so they all stop
  together. What a script would do on the host is Rust (the `docker`
  stand-in kind runs is the app itself).

## Interface rules

- **Where components live** (`desktop/src/components/`): `exam/` the exam
  desk, `assistant/` everything Claude (pane, composer, answers, sign-in),
  `text/` what the candidate reads (Markdown, click-to-copy values and code,
  documentation links), `shell/` the window's chrome (sidebar, title bar,
  capsule), `study/` what Home and the Calendar share (figures),
  then one folder per screen (`home/`, `calendar/`, `create/`, `catalog/`,
  `history/`, `environment/`, `settings/`, `activity/`). Shared across screens means the
  kit, not another screen's folder.

- **The kit first.** `@ckpro/ui` (`@ckpro/ui/components/<name>`) owns every
  control and surface: `Button`, `IconButton` (its label is the tooltip),
  `SegmentedControl`, `Stepper`, `Select`, `Switch`, `Popover` with the
  `menu` classes, `DropdownMenu` (submenus), `Dialog`/`AlertDialog`,
  `ConfirmDialog`, `Tooltip`, `Truncated`, `Card` (`CardHeader`, `CardTitle`, `CardDescription`), `Alert`, `CodeBlock`,
  `Badge` (`BadgeButton`), `Chip`, `StatusDot`, `Sidebar`, `Capsule`, `Stat`, `Terminal` (`Terminal.Prompt`), `Placeholder`, `Progress` (`marker`), `ProgressRing`, `ResizeHandle`, `Splitter` (`usePanelSize`), `Spinner`, `Loading`,
  `MenuItem`, `DisclosureButton`, `InlineCode`, `DayMarker`, `RowCover` (a list row pressed as a whole). A hand-rolled control or a class
  string used twice becomes a kit component or variant.
- **Kit helpers**: `useElementSize` (an element's size as it changes),
  `useDragOrder`.
- **The design system, live**: `desktop/kit.html` (`pnpm exec vite`, then
  `/kit.html`). New components and variants go there.
- **Tokens, not colours**: the kit's theme tokens (`background`, `card`,
  `muted`, `border`, `highlight`, `assistant`, …) and app tokens in
  `desktop/src/index.css` (`exam-value`, `exam-concept`; `claude` only
  beside Claude Code's own logo). No hex values in classNames.
- **Nothing selects but content**: the body is `select-none`; what is
  there to read or copy opts in with `select-text` (Markdown, `CodeBlock`,
  `Terminal`, messages, `Alert`), and inputs select as they type.
- **Accessible names** on icon-only controls; `sr-only`, not `hidden`.
- Areas that stop pointer events (the VNC canvas) register with
  `useDismissSurface` so menus still close.

## Commits

Conventional Commits: `type(scope): subject`, imperative, lower case, no
period, at most 72 characters; a body of plain prose for the why. No
trailers, no tool or AI mentions, no references to other projects. Local
only until asked to push.

Commit only what is settled: a change the user has agreed to keep, as one
commit per finished piece of work. Not after every exchange; work still
being tried or reviewed stays uncommitted until it is settled.

## Checks

```bash
cd desktop && pnpm typecheck && pnpm test   # unit tests (vitest) beside the code
pnpm exec biome check <files you touched> --write
cd src-tauri && cargo clippy --all-targets -- -D warnings
cargo test                            # unit tests; e2e: cargo test -- --ignored
cargo run -- lab lint ../../packs/core
```

Commands or types changed: regenerate the bindings with
`cargo test bindings_export` and copy `$TMPDIR/ckpro-bindings.ts` to
`desktop/src/tauri/bindings.ts`. Image files changed: regenerate the manifest
with `cargo run -- images > resources/images.json`. Icon changed: `pnpm
tauri icon src-tauri/icons/source.svg` (macOS's grid, a margin round the
tile), then from `source-windows.svg` (the same tile, no margin: Windows
draws icons to the edge of their box) keep only `icon.ico`, `Square*Logo.png` and
`StoreLogo.png`.
