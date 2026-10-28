# CK --dry-run

A desktop app for practising the CKA, CKAD and CKS exams on real Kubernetes
clusters, in an environment laid out like the exam itself.

Each attempt gets its own kind clusters, a task host to `ssh` into and a
remote XFCE desktop with a terminal, Firefox (limited to the allowed
documentation) and VSCodium. Tasks are graded by running their checks against
the cluster.

## Features

- **Exam mode**: timed, no hints, no assistant, graded at the end.
- **Practice mode**: no time limit, hints, per-task checks and reference
  solutions.
- **Assistant** (practice): Claude, signed in with your own account, reads the
  task and your last check. In Agent mode it can run commands on the task
  host, each one after you allow it. Exam mode never has it.
- **Question bank**: 111 tasks across 7 exams, plus your own questions,
  generated and proven on a cluster before they are kept.
- **Environment guard**: during an attempt the clusters refuse the host's
  `kubectl`, and changes made outside the exam desktop are undone and listed
  on the result.
- **History and study plans** per certification and curriculum domain.

## Requirements

- macOS (Apple silicon or Intel)
- A Docker engine: OrbStack, Docker Desktop, Colima or Rancher Desktop,
  with 4 GB of memory or more
- Node.js 22 or later, for the assistant only

Nothing else is installed on the host: kind, the cluster images and the exam
desktop are fetched and run by the app, and their kubeconfigs stay in the
app's data directory.

## Development

```bash
pnpm install
pnpm dev                                   # the app, with hot reload
cd desktop/src-tauri && cargo test         # unit tests
cargo test -- --ignored                    # end-to-end tests on Docker
cargo run -- lab lint ../../packs/core     # check the question pack
cargo run -- lab verify ../../packs/core   # prove it on real clusters
```

The command line also serves the question bank to agents over MCP:
`claude mcp add ckdry -- /Applications/ckdry.app/Contents/MacOS/ckdry mcp`.

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
