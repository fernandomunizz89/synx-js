# SYNX – Features

## CLI & UX

- Interactive terminal menus (arrow keys + Enter) for `setup`, `new`, `approve`, `fix`.
- Live `start` progress panel: spinner, per-task status bars, task counters, event stream.
- Inline `HUMAN INPUT` panel for approve/reprove without a second terminal.
- Hotkeys during `start`: `?` help, `F1` extended help, `F2` new-task template, `F3` pause/resume, `F4` toggle console/stream, `F10` graceful stop.
- Task type flags for `new`: `Feature`, `Bug`, `Refactor`, `Research`, `Documentation`, `Mixed`.
- Per-task E2E preferences via `--e2e`, `--e2e-framework`, `--qa-objective`.
- `status` defaults to focused view (current or latest task); `--all` for full history.
- `ui` starts a local observability and human-review web surface with three tabs — **Tasks** (searchable, inline approve/reprove/cancel), **Review** (focused `waiting_human` queue), and **Stream** (live SSE event log) — with optional `--read-only` mode.

## Setup & Configuration

- Guided `setup` with required human reviewer name.
- Provider selection via interactive menu with model discovery (LM Studio auto-detect).
- Optional per-expert provider configuration in `setup` — assign different providers/models to Front, Mobile, Back, QA, and SEO experts individually.
- Config cascade: global `~/.ai-agents/config.json` → project `.ai-agents/config/project.json`.
- `show-config` command to inspect resolved config.

## Dream Stack 2026 – Expert Agent Squad

- **Dispatcher:** triages tasks and routes directly to the correct domain expert (or to Spec Planner for complex tasks with `targetExpert` hint).
- **Conditional Planning:** Spec Planner is invoked only when the Dispatcher flags a task as complex/multi-step; it decomposes the task and routes to the expert identified by `targetExpert`.
- **Synx Front Expert:** Next.js App Router, TailwindCSS, WCAG 2.1, RSC patterns, React Testing Library.
- **Synx Mobile Expert:** Expo, React Native, Reanimated (UI-thread), EAS managed workflow, Jest/RNTL.
- **Synx Back Expert:** NestJS/Fastify, Prisma ORM, strict TypeScript, Vitest integration tests with mock injection.
- **Synx SEO Specialist:** Core Web Vitals (LCP/INP/CLS), JSON-LD Schema.org, Next.js Metadata API (`generateMetadata`), Lighthouse ≥ 90/90/90/95, robots.txt / sitemap.xml audits.
- **Synx QA Engineer:** Playwright (E2E) + Vitest (unit); produces structured verdicts with `issue`, `expectedResult`, `receivedResult`, `evidence`, `recommendedAction` per finding; auto-routes failures back to the originating expert.

## QA & Quality Gates

- QA failure context is cumulative across retries (previous findings carried forward).
- QA retry loop capped at 3 (default). Exceeded cap → `waiting_human` escalation.
- Root-cause intelligence: QA surfaced hints map to source files and git-changed files.
- Post-edit sanity checks after every expert stage (lint, TypeScript compile, build).
- E2E enforcement for `Feature`, `Bug`, `Refactor`, `Mixed` tasks. `Research` and `Documentation` tasks skip E2E questions automatically.
- QA strategy: Playwright for web E2E; Vitest for isolated logic. Never mixed.
- Language-aware fallback checks (TypeScript/Python/Go/Rust/Java) when no package scripts match.

## Recovery & Operations

- Stale lock detection by age and dead PID.
- Orphaned `working/` file recovery to inbox.
- Interrupted task requeue logic.
- Task cancellation (graceful, mid-stage).
- `doctor`, `resume`, `fix` for full repair coverage.

## Research (On-demand)

- Gated Researcher service: activated when confidence < 0.6 or the same QA failure repeats.
- Synthesizes web evidence (DuckDuckGo or Tavily) into structured guidance without editing code.
- Anti-loop guard: if recommendation repeats while the issue persists, task escalates to `waiting_human`.
- Max 2 web searches per stage (default, configurable).

## Custom Agents & Pipelines

- **`synx agent list/show/create`** — manage custom agent definitions stored in `.ai-agents/agents/*.json`.
- **Interactive wizard** (`synx agent create`) or fully non-interactive via `--id`, `--name`, `--provider`, `--model`, `--output-schema`, `--default-next-agent`, `--domains`, `--frameworks`, `--languages`, `--task-types`, `--risk-profile`, `--verification-modes`, `--no-prompt-file` flags.
- **Starter prompt generation** — `create` writes a pre-structured `.md` prompt to `.ai-agents/prompts/<id>.md` with role, responsibilities, context, and output format sections.
- **Output schemas**: `generic` (`summary`, `result`, `nextAgent`) or `builder` (`implementationSummary`, `filesChanged`, `edits`, `nextAgent`).
- **Capability-based registry** — custom agents can declare domain/framework/language/task/risk/verification capabilities and become eligible for autonomous Dispatcher routing.
- **Provider defaults per type** — `anthropic`, `openai-compatible`, `google`, `lmstudio`, `mock` each get smart defaults (apiKeyEnv, baseUrl, autoDiscoverModel).
- **`synx pipeline list/show`** — browse pipeline definitions in `.ai-agents/pipelines/*.json`.
- **`synx pipeline run <id> <input>`** — start a pipeline; creates a task and queues the Pipeline Executor worker.
- **Pipeline Executor** — built-in worker that runs each step in order, accumulates outputs in `pipelineContext.previousSteps`, and re-queues itself until done.
- **Routing modes**: `sequential` (ordered), `dynamic` (output-driven), `conditional` (expression + defaultNextStep).
- **Mixed agent steps** — pipelines can reference both built-in agents (`Synx Back Expert`, `Synx QA Engineer`, etc.) and custom agents by ID in the same pipeline.
- **Per-step provider override** via shorthand `provider/model?apiKeyEnv=...&baseUrl=...`.
- **Provider fallback chain** — `providerFallbacks` array; executor tries each in order on failure before raising.
- **Step output persistence** — each completed step is saved to `done/pipeline-step-<N>.done.json` for audit and resume.

## Provider & LLM

- Supports LM Studio (local, runtime model auto-discovery), OpenAI-compatible endpoints, Google Generative AI, and Anthropic Claude Code.
- Stateless calls: each LLM call sends only current stage context (no chat history reuse).
- Dynamic temperature per agent and task type, with full env-override support.
- SSE streaming mode optional (`AI_AGENTS_PROVIDER_STREAMING=true`).
- Backoff/retry for transient provider errors with jitter.
- Local rate-limit window and max-concurrent-requests controls.
- Token and cost estimation per stage, reported in `metrics`.

## Diagnostics & Observability

- `synx metrics [--since <timestamp>] [--json]` for pipeline performance data.
- `synx status [--all]` for task state overview.
- `synx doctor` for preflight checks: config, prompts, provider health, stale locks.
- Structured JSONL logs: `polling-metrics`, `queue-latency`, `provider-throttle`, `stage-metrics`, `provider-model-resolution`.

## Learning Loop

- **Automatic outcome recording** — `synx approve` writes one `LearningEntry` per completed pipeline step; `synx reprove` writes one entry for the last step including the human's feedback reason.
- **Prompt injection** — before each pipeline step the executor loads the agent's 5 most recent entries and appends a *"Your recent performance"* section to the system prompt.
- **Append-only JSONL storage** — one file per agent at `.ai-agents/learnings/<agent-id>.jsonl`; no data is ever overwritten or deleted.
- **`synx learn [agent-id]`** — CLI command showing approval rate, counts, and recent entry history for all agents or a specific one.
- **Stats API** — `computeLearningStats()` returns `total`, `approved`, `reproved`, `approvalRate`, `mostRecentOutcome`, and `lastTimestamp`.
