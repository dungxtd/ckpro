# ckpro

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

macOS:

```bash
brew tap dungxtd/ckpro https://github.com/dungxtd/ckpro
brew install --cask ckpro
```

Windows: the installer for your PC (`ckpro_windows-x64_….exe`, or
`ckpro_windows-arm64_….exe` on Windows on Arm) from the
[latest release](https://github.com/dungxtd/ckpro/releases/latest). It is not
signed yet: SmartScreen asks once (More info, then Run anyway).

Linux: the AppImage or the `.deb` for your machine (`linux-x64` or
`linux-arm64`) from the same release:

```bash
sudo apt install ./ckpro_linux-x64_*.deb   # Debian, Ubuntu
chmod +x ckpro_linux-x64_*.AppImage && ./ckpro_linux-x64_*.AppImage
```

## Requirements

- macOS (Apple silicon or Intel), Windows 10/11 (x64, or Arm on Windows 11)
  or Linux (x64 or arm64, with WebKitGTK 4.1: Ubuntu 22.04 or later)
- A Docker engine with 4 GB of memory or more: OrbStack or Docker Desktop on
  macOS, Docker Desktop on Windows, Docker Engine on Linux (your user in the
  `docker` group)

That is all. Everything else runs in Docker or in the app's data directory:
the clusters, task host, exam desktop and registry cache, kind and the
kubeconfigs. The assistant, optional, uses the agent CLIs installed on the
computer and their own logins: Claude Code (with Node.js, which runs its adapter).

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
