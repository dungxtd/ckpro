# CKtry

A desktop app for practising the CKA, CKAD and CKS exams on real Kubernetes
clusters, in an environment laid out like the exam itself.

Each attempt gets its own kind clusters, a task host to `ssh` into and a
remote XFCE desktop with a terminal, Firefox (limited to the allowed
documentation) and VSCodium. Tasks are graded by running their checks against
the cluster.

## Features

- **Exam and practice**: timed and graded, or with hints, checks and solutions.
- **Study plan**: target date, readiness by domain, a calendar of exams.
- **Results**: your score, what you missed, and what to do next.
- **Create**: ask for an exam in a chat; new questions are proven on a cluster.
- **Assistant** (optional, practice only): Claude explains or explores the
  cluster with your OK. Never in exam mode.
- **Environment**: what uses Docker's memory and disk, with fixes.
- **Guard**: during an attempt, changes from outside the exam desktop are
  undone and reported.

## Install

macOS or Linux, with [Homebrew](https://brew.sh) (casks on Linux need
Homebrew 4.5 or later):

```bash
brew install --cask dungxtd/tap/cktry
```

Windows: the installer for your PC (`cktry_windows-x64_….exe`, or
`cktry_windows-arm64_….exe` on Windows on Arm) from the
[latest release](https://github.com/dungxtd/cktry/releases/latest). It is not
signed yet: SmartScreen asks once (More info, then Run anyway).

Linux without Homebrew: the AppImage or the `.deb` for your machine
(`linux-x64` or `linux-arm64`) from the same release:

```bash
sudo apt install ./cktry_linux-x64_*.deb   # Debian, Ubuntu
chmod +x cktry_linux-x64_*.AppImage && ./cktry_linux-x64_*.AppImage
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
