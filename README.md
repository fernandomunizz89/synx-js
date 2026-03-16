# SYNX

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-5.0.0-green.svg)
![Node](https://img.shields.io/badge/node->=18.0.0-brightgreen.svg)
![Build](https://img.shields.io/badge/build-passing-success.svg)

> A human-friendly CLI for running a file-driven AI agents pipeline inside each repository.

---

## 🤖 AI Agent Context
<ai-context>
This project is an AI agent orchestration CLI named "SYNX". 
It manages a multi-agent system executing directly within local repositories. The typical workflow stages include Dispatching, Planning, Investigating, Building/Fixing, Reviewing, QA Validation, and PR Creation. It runs autonomously in `.ai-agents/` within the target repository, utilizing structured JSON output from LLM providers (e.g., LM Studio, OpenAI, OpenRouter).

Key architectural points for agents operating in this repository:
- **Core Orchestrator:** This repo contains the orchestrator written in TypeScript (`src/index.ts` entrypoint).
- **Agent Pipelines:** Implementations (`Bug Fixer`, `Feature Builder`, `QA`) apply real file edits in target workspaces.
- **Config Precedence:** Global `~/.ai-agents/config.json` -> Project `<repo>/.ai-agents/config/project.json`.
- **Primary Commands:** `setup`, `start`, `new`, `status`, `approve`, `doctor`, `resume`, `fix`, `metrics`.
- **References:** Full operational manuals and implementation details reside in the `docs/` folder.
</ai-context>

---

## 📖 Overview

SYNX is an advanced agentic orchestrator that reduces operator friction by combining guided setup, interactive terminal menus (arrow keys + Enter), global and local config overrides, auto-repo discovery, robust crash recovery, and rich human-readable diagnostics.

Whether you're dispatching a new minor feature or debugging a complex regression, SYNX spins up a structured, role-based pipeline of AI agents (e.g., Spec Planner, Builder, QA Validator) working autonomously in a secured `.ai-agents` environment.

## ✨ Features

- **Guided CLI:** Interactive terminal menus.
- **Provider Agnostic:** Supports local models (e.g., LM Studio) and cloud models (OpenAI-compatible endpoints).
- **Task Variety:** Easily trigger tasks typed as `Feature`, `Bug`, `Refactor`, `Research`, `Documentation`, or `Mixed`.
- **Robust Quality Assurance:** Dynamic E2E test execution, strict sanity checks (lint, typescript compile), automatic remediation loops, and root-cause failure analysis.
- **Resilient Workflows:** Recovery of unfinished executions, stale lock eviction, and step-by-step pipeline re-entries.
- **Real Workspace Edits:** Agents actually construct, refactor, and delete real code in target directories (minus protected zones).
- **Actionable Diagnostics:** Tools like `doctor`, `status`, and `metrics` provide comprehensive views of the local orchestration.

*(See [docs/FEATURES.md](docs/FEATURES.md) for a comprehensive list of capabilities).*

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- A local AI provider (like [LM Studio](https://lmstudio.ai/)) or API keys for a cloud provider.

### Installation & Initialization

1. **Clone the repository and build:**
   ```bash
   cd ~/Workspace/SYNX
   npm install
   npm run build
   npm link
   ```

2. **Initialize SYNX in your target project:**
   Navigate to the repository you want SYNX to monitor, then run:
   ```bash
   synx setup
   ```
   *Follow the interactive prompts to define your human reviewer name, establish global and local settings, and pinpoint your LLM provider options.*

## 🕹️ Usage & Commands

The main commands to interact with SYNX are highly human-friendly. 

- **Start processing loops:**
  ```bash
  synx start
  ```
  *(Add `--dry-run` to emulate changes without writing to disk, and `--no-progress` for quiet standard outputs).*

- **Create a new task:**
  ```bash
  synx new "Add dark mode toggle" --type Feature
  ```

- **Check progress and pending interactions:**
  ```bash
  synx status
  ```

- **Approve finalized pull requests:**
  ```bash
  synx approve
  ```

### Advanced Operations

- **Cancel a task:** `synx cancel <task-id>`
- **Diagnose engine issues:** `synx doctor`
- **Resume interrupted executions:** `synx resume`
- **Apply automatic repairs:** `synx fix`
- **View pipeline metrics:** `synx metrics --since 2026-03-15T21:25:19Z`

*(For extensive day-to-day operation manuals and edge cases, see [docs/MANUAL.md](docs/MANUAL.md)).*

## 🧠 Architecture & Configuration

SYNX operates via a sequential multi-agent model orchestrated completely within the CLI context:

### The Agentic Pipeline
Depending on the task type (e.g., `Feature` vs `Bug`), the CLI routes the request differently:
- **Bugs:** `Dispatcher ➔ Bug Investigator ➔ Bug Fixer ➔ Reviewer ➔ QA ➔ PR Writer ➔ Human Appr.`
- **Standard (Features/Refactors):** `Dispatcher ➔ Spec Planner ➔ Feature Builder ➔ Reviewer ➔ QA ➔ PR Writer ➔ Human Appr.`

### Configuration Layers
Configuration cascades locally to globally:
1. Internal runtime defaults.
2. Global environment: `~/.ai-agents/config.json`
3. Targeted local overrides: `<repo>/.ai-agents/config/project.json`

*(See [docs/IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md) for detailed structural changes and historical pipeline stability iterations).*

## 📚 Documentation Reference

For more elaborate context around the architecture, feature sets, and operational guides, please refer to the documents structured in the `/docs` directory:

- [FEATURES.md](docs/FEATURES.md) – Exhaustive, bulleted features present in the current build.
- [IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md) – Structural decisions, iteration highlights, and provider execution details.
- [MANUAL.md](docs/MANUAL.md) – The extensive human user manual on recovering flows, troubleshooting providers, adjusting node scripts, and understanding agent stateless calls.
