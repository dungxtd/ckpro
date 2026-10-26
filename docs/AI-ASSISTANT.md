# AI assistant: reference (TablePro) and a design for ckdry

Status: phases 1-2 built (practice coach; review and study plan); phases 3-4 proposed. Researched 2026-10-26.

## 1. Reference: what TablePro does

TablePro ([repo](https://github.com/TableProApp/TablePro),
[docs](https://docs.tablepro.app/features/ai-assistant.md)) is a native
database client with a well-built AI layer. **License: AGPL-3.0**: copy ideas,
not code.

| Area | TablePro |
|---|---|
| **Chat modes** | Ask (read-only tools), Edit (can run DML), Agent (all tools, destructive ones need confirmation). The mode decides which tools exist, not just the prompt. |
| **Actions** | Explain / Optimize / Review / *Fix with AI* (a button on the query error banner sends the failed statement and the error). Answers come as a structured "walkthrough" (text + JSON steps); the app draws the diff itself. |
| **UI** | Chat in the window's side pane; an Agent workspace (sessions with Working / Waiting on you / Ready / Failed). Shortcuts (⌘⌥A toggle, ⌘L explain). Slash commands `/explain /fix /review`, custom ones with `{{query}}` placeholders. `@` mentions attach schema, a table or results as chips. Streamed markdown; code blocks with Copy / Insert. |
| **Context** | DB type, schema (max 20 tables, then "… N more not shown"), current query (max 2,000 chars, marked truncated). Query results off by default. Actions describe only the tables the query references, within a budget, and say what was left out. |
| **Privacy gate** | Per connection: Always / Ask each time (default) / Never. Never also blocks inline suggestions and external MCP clients. |
| **Tools** | `list_tables`, `describe_table`, `execute_query`, `confirm_destructive_operation`… each declares read-only / write / agent-only. Loop capped at 25 round trips. Read-only tools run directly; write tools show an approval card (Run / Always allow / Cancel); destructive ones always need a click plus an exact confirmation phrase. One statement at a time, no file-touching statements. |
| **Providers** | Anthropic, OpenAI, Gemini, Ollama and other OpenAI-compatible, Copilot, and **Claude Code via the local `claude` CLI** (`claude -p --output-format stream-json --tools "" --strict-mcp-config`, with a 15-minute read-only MCP token per run; it uses the user's Claude subscription and strips `ANTHROPIC_API_KEY`). Keys go in the macOS Keychain. |
| **MCP server** | Loopback-only HTTP plus a stdio bridge binary, so `claude mcp add tablepro -- …/tablepro-mcp` works. About 47 tools (schema, queries, opening tabs in the app). Bearer tokens (read-only / read-write / full), a native approval dialog on first access (never through MCP elicitation), an audit log, and error redaction. |
| **History** | One JSON file per conversation. |

Their main lesson is **one tool layer and one safety gate**, shared by the
in-app chat and the MCP server.

## 2. What ckdry already has that an assistant can use

- **A question carries its own context**: statement (Markdown, vars resolved
  per attempt), cluster/host, namespace, domain per certification,
  difficulty, tags, hints, `solution.explain` / `solution.run`, `checks`, and
  the allowed `references`.
- **Grading explains failures**: "Check my work" returns each check with
  pass/fail and a `detail` ("expected 3 replicas, got 1").
- **The allowed documentation per certification** (`pack.yaml`
  `certifications.*.resources`), and kubernetes.io search (Pagefind) is
  already reachable from the desktop.
- **A desktop to act on**: `copyToDesktop` (the clipboard), Firefox with the
  allowed docs, and `docker exec` into the task host / nodes (read-only
  kubectl).
- **A validator for generated content**: the pack JSON schema, `ckdry lab
  lint`, and `ckdry lab verify`, which runs setup on a real kind cluster,
  checks that the checks fail first, runs the solution, and checks that they
  pass. An AI-generated question can be **proved** before anyone sees it.
- **SQLite** for history and progress, and a headless CLI in the same binary
  (`ckdry <command>`).

## 3. Proposed features

### Rule zero: never in exam mode
The real exam has no AI. The assistant exists in **practice mode**, on the
**results / review** screen and on the **home** screen (study and generate),
and is absent while an exam-mode attempt runs. This is enforced in Rust, not
just hidden in the UI: tools refuse while an exam-mode attempt is
`running`.

### A. Coach (practice): help resolve the current question
- **Context it reads automatically**: the question (as the candidate sees it),
  host, namespace, domain, the last "Check my work" results, and which hints
  were already shown. **Not the reference solution** unless the user pressed
  *Show solution*: the coach should teach, not leak.
- **Graded help, the hints' way**: `/hint` (a nudge), `/explain` (the
  concept), `/docs` (where to read), `/why` (why a check fails), `/solution`
  (only after the user asks twice or opens the solution).
- **"Why did this fail?" on failing checks**, TablePro's *Fix with AI*: a
  button next to each red check sends the check, its detail and a read-only
  look at the cluster.
- **Read-only cluster tools**: `kubectl get/describe/logs/events/explain`,
  `auth can-i` on the question's cluster, run from the task host (the
  context the candidate has), with output capped and marked truncated.
- **Answers act on the desktop**: code blocks get *Copy to desktop* (the
  existing click-to-copy path, so Ctrl+Shift+V works in the terminal), and
  doc links get *Open in exam Firefox*.

### B. Docs and search keywords (practice and review)
- `search_docs(query)` on the **kubernetes.io Pagefind index** (the same
  search the exam allows), returning title, URL and snippet, plus
  `fetch_doc(url)` limited to the certification's allowed resources.
- It answers with **the search keywords to type in the exam's search box** and
  **which page and section to open**, not just the answer. This trains the
  real skill: finding the YAML in the allowed docs in under a minute.
- A "Docs for this question" card per question, cached in SQLite.

### C. Review and study plan (after results)
- Per failed question: what went wrong (checks), the concept, the doc pages,
  and the 2–3 kubectl commands that would have solved it.
- A study plan from **history**: weak domains weighted by the curriculum
  (e.g. troubleshooting 30%), with suggested questions or a targeted
  generated set.

### D. Generate questions and exams (home)
- **Generate a question**: pick a certification, domain, difficulty and topic.
  The model writes question YAML against `pack.schema.json` (statement with
  vars, setup, checks, hints, solution, references to allowed docs).
- **The app proves it** before saving: `lab lint` → `lab verify` on a real
  cluster (checks fail before setup is solved, the solution makes every
  check pass). Failures go back to the model to fix (a bounded loop, e.g. 3
  tries); only verified questions land in a local **"My questions" pack**.
- **Generate an exam**: a blueprint (duration, pass score, domain weights)
  filled from existing plus generated questions, with variety (vars).
- This is the feature where an agent loop (tools: write file, lint, verify)
  makes sense, with progress shown as an Activity (the existing
  `activity.rs`).

### E. MCP server: ckdry for Claude Code and other agents
- `ckdry mcp` (stdio, the same binary as the CLI): `claude mcp add ckdry --
  ckdry mcp`.
- Tools: `list_exams`, `get_question`, `search_docs`, `lint_question`,
  `verify_question`, `add_question`, `history_summary`, and, with an active
  practice attempt, `get_current_question` and `check_my_work`.
- The **same tool layer** as the in-app coach (TablePro's lesson), the same
  exam-mode refusal, and read-only by default.

## 4. Architecture sketch

```
desktop/src (React)                 desktop/src-tauri (Rust)
┌────────────────────────┐          ┌─────────────────────────────────────┐
│ Coach tab (task panel) │  invoke  │ ai/                                  │
│ /hint /docs /why …     │ ───────► │   context.rs  question + checks …   │
│ approval cards         │ ◄─────── │   tools.rs    one registry, each    │
│ streamed markdown      │  events  │               read-only / write     │
└────────────────────────┘          │   gate.rs     exam-mode refusal,     │
                                     │               approval, budgets     │
                                     │   provider/   claude_cli.rs,        │
                                     │               anthropic.rs          │
                                     │   store       chats in SQLite       │
                                     │ mcp.rs        `ckdry mcp`: same tools│
                                     └─────────────────────────────────────┘
```

- **Providers, in order**:
  1. **Claude Code CLI** (`claude -p --output-format stream-json`, tools
     disabled, ckdry's tools through a short-lived MCP config, as TablePro
     does). It uses the user's existing Claude login, so there are no keys to
     manage.
  2. **Anthropic API key** in the OS keychain.

  Others only if asked.
- **Models**: a fast one for the coach, and the most capable one for
  generating questions (it has to write correct checks and solutions).
- **Streaming**: the Rust side forwards stream events as Tauri events, as
  activities do today.
- **Budgets**: per-tool output caps that say what was truncated, a
  round-trip cap, and timeouts on kubectl.
- **Storage**: conversations per attempt and question in SQLite (the existing
  store), not loose files.

## 5. UI placement

- **Practice desk**: a **Task | Coach** switch at the top of the task panel.
  The desktop keeps its width, and the coach sits next to the question it is
  about. A "Why?" button sits on each failing check.
- **Results**: a "Review with coach" button per failed question.
- **Home**: "Generate" (question or exam) next to the catalog, with progress
  as an activity and the result in "My questions".
- **Settings**: provider (Claude Code / API key), model, what context is sent
  (cluster reads on/off), and a link to `claude mcp add ckdry -- ckdry mcp`.

## 6. Phases

1. **Coach (practice) + docs search**: Claude Code provider, question and
   check context, `search_docs` / `fetch_doc` / read-only kubectl, the
   Coach tab, `/hint /docs /why`, Copy to desktop / Open in Firefox, chats
   in SQLite.
2. **Review and study plan** on results and history.
3. **Question and exam generator** with lint + verify, and "My questions".
4. **`ckdry mcp`** for Claude Code and other agents.

## 7. Risks

- **Spoilers**: a coach that gives the answer defeats practice. Keep the
  solution out of the context until it's unlocked, and grade the help.
- **Exam integrity**: enforced in Rust (rule zero).
- **Generated questions can be wrong**: only `lab verify`-proven ones are
  saved.
- **Claude Code CLI headless use**: this is how TablePro does it, but the
  flags can change between releases. Pin a tested version range, fall back
  to an API key, and show a short disclosure (usage counts against the
  user's Claude plan).
- **Cost and latency**: the coach should answer from the question context
  first and only call cluster or docs tools when needed.
