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
- **History**: scores per certification and curriculum domain, the domains to practise next, and the assistant sessions of each attempt.

## Install

```bash
brew tap dungxtd/ckdry https://github.com/dungxtd/ckdry
brew install --cask ckdry
```

## Requirements

- macOS (Apple silicon or Intel)
- A Docker engine: OrbStack or Docker Desktop, with 4 GB of memory or more

That is all. Everything else runs in Docker or in the app's data directory:
the clusters, task host, exam desktop and registry cache, kind and the
kubeconfigs. The assistant, optional, uses the agent CLIs installed on the Mac
and their own logins: Claude Code (with Node.js, which runs its adapter).

## Development

```bash
pnpm install
pnpm dev                                   # the app, with hot reload
cd desktop/src-tauri && cargo test         # unit tests
cargo test -- --ignored                    # end-to-end tests on Docker
cargo run -- lab lint ../../packs/core     # check the question pack
cargo run -- lab verify ../../packs/core   # prove it on real clusters
```

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
