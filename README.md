# SYNX

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-5.0.0-green.svg)
![Node](https://img.shields.io/badge/node->=18.0.0-brightgreen.svg)
![Build](https://img.shields.io/badge/build-passing-success.svg)

> A file-driven AI agent orchestrator that runs a specialized expert squad directly inside your repository.

---

## 🤖 AI Agent Context

<ai-context>
SYNX is a CLI orchestrator for a multi-agent AI pipeline. It manages autonomous software development tasks inside local repositories using a file-driven, stage-based approach.

**Dream Stack 2026 – Active Architecture:**
Project prompts are first decomposed by the Project Orchestrator; single tasks are triaged by the Dispatcher and routed directly to the right expert.

Expert Squad:
- `Synx Front Expert` – Next.js App Router, TailwindCSS, WCAG 2.1
- `Synx Mobile Expert` – Expo, React Native, Reanimated, EAS
- `Synx Back Expert` – NestJS/Fastify, Prisma ORM, Strict TypeScript
- `Synx SEO Specialist` – Core Web Vitals, JSON-LD, Next.js Metadata API
- `Synx QA Engineer` – Playwright E2E + Vitest; auto-routes failures back to the originating expert


**Key architectural points:**
- Core orchestrator lives in `src/` (TypeScript, ESM)
- Workers apply real file edits in the target workspace
- On-demand Researcher for external technical context
- Config precedence: Global `~/.ai-agents/config.json` → Project `.ai-agents/config/project.json`
- Primary commands: `setup`, `start`, `new`, `status`, `approve`, `reprove`, `doctor`, `resume`, `fix`, `metrics`
- Prompt stubs for each expert live in `.ai-agents/prompts/`
- Full docs in the `docs/` folder

You can now configure a specific model for each agent and connect to external providers: OpenAI and Google models can be used by supplying the appropriate API key in the agent configuration. Anthropic Claude Code models are also available when you provide the Anthropic API key. Set the desired model/provider per agent before running `synx run` so every specialist executes with the intended stack. SYNX automatically reads a `.env` file in the repository root (copy `.env.example` to `.env` and fill the placeholders), so you can keep `AI_AGENTS_OPENAI_API_KEY`, `AI_AGENTS_GOOGLE_API_KEY`, `AI_AGENTS_ANTHROPIC_API_KEY`, or provider-specific secrets in that file (make sure it stays ignored by Git) and reload the CLI to pick them up.
</ai-context>

---

## 📖 Overview

SYNX orchestrates a squad of specialized AI agents that work autonomously inside your repo. Project prompts go through Project Intake (`Project Orchestrator`) to create subtasks. Individual tasks go directly through the Dispatcher, then to the right domain expert — front-end, mobile, back-end, SEO, and others — before QA and human review.

The pipeline is file-driven: every stage writes a JSON handoff to `.ai-agents/tasks/<task-id>/`, enabling crash recovery, auditing, and human review at any point.

---

## ✨ Features

- **Domain Expert Squad:** Specialized agents for web (Next.js), mobile (Expo/RN), backend (NestJS/Fastify), and SEO (Core Web Vitals / JSON-LD).
- **Smart QA Loop:** QA Engineer runs Playwright (E2E) or Vitest (unit) and automatically routes failures back to the originating expert, capped at 3 retries.
- **Root Cause Intelligence:** QA carries structured failure context (`issue`, `expectedResult`, `receivedResult`, `evidence`, `recommendedAction`) in every handoff.
- **Provider Agnostic:** Supports LM Studio (local) and any OpenAI-compatible cloud endpoint.
- **Real Workspace Edits:** Agents create, replace, patch, and delete real files in target directories (protected paths blocked).
- **On-demand Research:** Gated Researcher synthesizes web evidence without editing code.
- **Resilient Execution:** Stale lock eviction, orphan recovery, interrupted task requeue, task cancellation.
- **Rich Diagnostics:** `doctor`, `status`, `metrics` for full pipeline visibility.

*(See [docs/FEATURES.md](docs/FEATURES.md) for the full capability list.)*

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A local AI provider ([LM Studio](https://lmstudio.ai/)) or an OpenAI-compatible cloud endpoint.

### Installation

```bash
cd ~/Workspace/synx-js
npm install
npm run build
npm link
```

### Initialize in your target project

```bash
cd /path/to/your-project
synx setup
```

Follow the interactive prompts to configure your provider, model, and human reviewer name.

---

## 🕹️ Usage

### Typical workflow

```bash
# 1. Configure (once per machine / repo)
synx setup

# 2. Start the engine (leave this running)
synx start

# 3. Open the web UI in your browser
synx ui
```

In the web UI, type what you want to build in the prompt bar and hit **Send**. The Project Orchestrator decomposes your request into independent subtasks and the agent squad picks them up in parallel — exactly like a dev team.

---

### Web UI

```bash
synx ui
synx ui --read-only          # disable mutations (safe for sharing)
synx ui --port 4317
```

Three tabs:

- **Tasks** — searchable table with per-task Approve / Reprove / Cancel.
- **Review** — focused queue of tasks waiting for your decision.
- **Stream** — real-time SSE event log.

The **prompt bar** at the top lets you describe a feature or project in plain text. SYNX creates project subtasks automatically and runs them in parallel.

---

### CLI: Create a single task

```bash
synx new "Add dark mode toggle" --type Feature
synx new "Fix auth regression" --type Bug --e2e required --e2e-framework playwright
synx new  # interactive menus
```

**Task types:** `Feature`, `Bug`, `Refactor`, `Research`, `Documentation`, `Mixed`

> **Tip:** For Research and Documentation tasks, E2E questions are skipped automatically.

---

### Engine

```bash
synx start
synx start --dry-run        # simulate edits without writing files
synx start --no-progress    # quiet stdout mode
```

In interactive TTY mode, `start` shows a live progress panel with quick hotkeys (`?`, `F1`–`F4`, `F10`) and an inline `HUMAN INPUT` panel for approve/reprove.

---

### Review

```bash
synx approve
synx reprove --reason "Main flow still fails after QA"
synx reprove --rollback task  # restore tracked files for this task
```

---

### Check progress

```bash
synx status        # focused view: current or latest task
synx status --all  # full history
```

---

### Advanced operations

```bash
synx cancel <task-id>     # graceful cancellation
synx doctor               # diagnose engine issues
synx resume               # recover interrupted executions
synx fix                  # automatic repair
synx metrics --since 2026-03-16T00:00:00Z
```

*(See [docs/MANUAL.md](docs/MANUAL.md) for full operation manual.)*

---

## 🧠 Architecture — Dream Stack 2026

SYNX uses a project-intake + execution model: the Project Orchestrator breaks high-level requests into subtasks, then the Dispatcher routes each subtask to the right expert.

### Official Vocabulary

- `project`: a high-level prompt that may produce multiple implementation subtasks.
- `epic`: a thematic slice of a project (tracked by convention today; first-class graph support is planned).
- `task`: one executable unit with its own task folder under `.ai-agents/tasks/<task-id>/`.
- `subtask`: a task created by Project Orchestrator from a project intake prompt.
- `stage`: one handoff step in a task lifecycle (for example `dispatcher`, `synx-front-expert`, `synx-qa-engineer`).
- `agent`: the worker responsible for one stage.
- `capability`: the skill/profile used to decide which agent should execute a task type.

### Routing

```
Project prompt (web UI prompt bar or /api/project):
  Project Intake ──► Project Orchestrator ──► creates N subtasks

Subtask execution:
  Dispatcher ──► Expert ──► QA Engineer ──► Human Review
```

Project intake tasks are marked complete after decomposition. Project-level aggregation/final-review tracking across child tasks is planned in later phases.

### Expert Squad

| Agent | Domain |
|---|---|
| `Synx Front Expert` | Next.js App Router · TailwindCSS · WCAG 2.1 · RSC patterns |
| `Synx Mobile Expert` | Expo · React Native · Reanimated · EAS managed workflow |
| `Synx Back Expert` | NestJS / Fastify · Prisma ORM · Strict TypeScript · Vitest integration |
| `Synx SEO Specialist` | Core Web Vitals · JSON-LD / Schema.org · Next.js Metadata API · Lighthouse ≥ 90 |
| `Synx QA Engineer` | Playwright E2E · Vitest unit · auto-routes failures to originating expert |

### QA Failure Loop

When QA fails, it routes back to the expert that built the feature, carrying structured context. After 3 failed retries, the task escalates to `waiting_human`.

### Configuration Layers

Priority (lowest → highest):

1. Internal runtime defaults
2. Global: `~/.ai-agents/config.json`
3. Project: `<repo>/.ai-agents/config/project.json`

---

## 🧪 Testing

Uses **Vitest** with V8 coverage. Minimum 80% coverage gate.

```bash
npm test              # run test suite
npm run test:coverage # generate coverage report
npm run check         # TypeScript type check
```

**Current status (2026-03-24):** 126 test files · 823 tests · 100% pass

---

## 🧩 Web UI

`synx ui` starts a local web interface with three tabs:

- **Tasks** — searchable table, click to expand with inline Approve / Reprove / Cancel.
- **Review** — focused queue of `waiting_human` tasks.
- **Stream** — real-time SSE event log.

No build step required for the UI — `npm run build` compiles TypeScript only.

```bash
npm run build
npm run check
npm test
```

See [docs/WEB-UI.md](docs/WEB-UI.md) for full usage and API reference.

---

## 📚 Documentation

| File | Purpose |
|---|---|
| [FEATURES.md](docs/FEATURES.md) | Full capability list |
| [MANUAL.md](docs/MANUAL.md) | Day-to-day operation, recovery flows, environment variables |
| [WEB-UI.md](docs/WEB-UI.md) | Local web UI operation guide (`synx ui`) |
| [IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md) | Architecture decisions and iteration history |
