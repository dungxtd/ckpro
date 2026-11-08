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
- **Home**: the exam you aim at and its date, set from a terminal line;
  readiness by curriculum domain and a predicted score once enough is
  measured; a prep map of your study days; today's plan.
- **Calendar**: plan exams on days, as exams or practice, drag them to
  another day.
- **Results**: the score against the pass line, what to do next (the
  questions missed, a retake on your next study day, the exam to take next),
  each question's checks and solution.
- **Create** (with the assistant): ask for an exam in a chat; Claude reads
  your results and builds it from the bank and new questions, which are
  proven on a cluster before you save.
- **Assistant** (practice): Claude, signed in with your own account. Ask
  reads the task, your last check and a look at the cluster; Agent explores
  the cluster itself and changes it only with your OK. Your own notes go with
  every conversation. Exam mode never has it, and every feature works with it
  off.
- **Question bank**: 111 tasks across 7 exams, plus the ones you build.
- **Environment**: Docker's memory and what uses it, each cluster's nodes and
  purpose, the disk and kernel limits kind needs, the image cache; problems
  come with what to do.
- **Environment guard**: during an attempt the clusters refuse the host's
  `kubectl`, and changes made outside the exam desktop are undone and listed
  on the result.
- **History**: every attempt, scores per certification and domain, and the
  assistant sessions of each attempt.

## Install

macOS or Linux, with [Homebrew](https://brew.sh) (casks on Linux need
Homebrew 4.5 or later):

```bash
brew install --cask dungxtd/tap/ckpro
```

Windows: the installer for your PC (`ckpro_windows-x64_….exe`, or
`ckpro_windows-arm64_….exe` on Windows on Arm) from the
[latest release](https://github.com/dungxtd/ckpro/releases/latest). It is not
signed yet: SmartScreen asks once (More info, then Run anyway).

Linux without Homebrew: the AppImage or the `.deb` for your machine
(`linux-x64` or `linux-arm64`) from the same release:

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
