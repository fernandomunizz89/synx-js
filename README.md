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
The engine runs a specialized squad of domain experts. The Dispatcher triages each task and routes it — either directly to the right expert (simple/clear tasks) or through the Spec Planner first (complex/ambiguous tasks).

Expert Squad:
- `Synx Front Expert` – Next.js App Router, TailwindCSS, WCAG 2.1
- `Synx Mobile Expert` – Expo, React Native, Reanimated, EAS
- `Synx Back Expert` – NestJS/Fastify, Prisma ORM, Strict TypeScript
- `Synx SEO Specialist` – Core Web Vitals, JSON-LD, Next.js Metadata API
- `Synx QA Engineer` – Playwright E2E + Vitest; auto-routes failures back to the originating expert

**Conditional Planning:**
The Dispatcher sets `nextAgent: "Spec Planner"` with a `targetExpert` hint for complex tasks. The Spec Planner decomposes the task and routes directly to the correct expert.

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

SYNX orchestrates a squad of specialized AI agents that work autonomously inside your repo. Each task is triaged by the Dispatcher and routed to the right domain expert — front-end, mobile, back-end, or SEO — before reaching the QA Engineer for validation.

The pipeline is file-driven: every stage writes a JSON handoff to `.ai-agents/tasks/<task-id>/`, enabling crash recovery, auditing, and human review at any point.

---

## ✨ Features

- **Domain Expert Squad:** Specialized agents for web (Next.js), mobile (Expo/RN), backend (NestJS/Fastify), and SEO (Core Web Vitals / JSON-LD).
- **Conditional Planning:** The Dispatcher routes simple tasks directly to experts; complex tasks go through the Spec Planner first with a `targetExpert` hint.
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

### Start the engine

```bash
synx start
```

In interactive TTY mode, `start` shows a live progress panel with per-task status, quick hotkeys (`?`, `F1`–`F4`, `F10`), and an inline `HUMAN INPUT` panel for approve/reprove without opening a second terminal.

```bash
synx start --dry-run    # simulate edits without writing files
synx start --no-progress  # quiet stdout mode
```

### Create a task

```bash
synx new "Add dark mode toggle" --type Feature
synx new "Fix auth regression" --type Bug --e2e required --e2e-framework playwright
synx new  # interactive menus
```

**Task types:** `Feature`, `Bug`, `Refactor`, `Research`, `Documentation`, `Mixed`

### Check progress

```bash
synx status        # focused view: current or latest task
synx status --all  # full history
```

### Approve / Reprove

```bash
synx approve
synx reprove --reason "Main flow still fails after QA"
synx reprove --rollback task  # restore tracked files for this task
```

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

SYNX uses a **Conditional Planning** model: the Dispatcher decides in real time whether a task needs decomposition or can flow directly to an expert.

### Routing

```
Simple / clear tasks:
  Dispatcher ──────────────────────────────► Expert ──► QA Engineer ──► Human Review

Complex / ambiguous tasks:
  Dispatcher (targetExpert hint)
      │
      ▼
  Spec Planner (decomposes → routes to targetExpert)
      │
      ▼
  Expert ──► QA Engineer ──► Human Review

Bug tasks:
  Dispatcher ──► Bug Investigator ──► Bug Fixer ──► QA Engineer ──► Human Review
```

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

**Current status:** 41 test files · 164 tests · 100% pass

---

## 📚 Documentation

| File | Purpose |
|---|---|
| [FEATURES.md](docs/FEATURES.md) | Full capability list |
| [MANUAL.md](docs/MANUAL.md) | Day-to-day operation, recovery flows, environment variables |
| [IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md) | Architecture decisions and iteration history |
