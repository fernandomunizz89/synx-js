# SYNX - Human-friendly manual

## What this tool does
It runs a local agents pipeline inside your repository.

The system:
- creates a safe hidden work area in `.ai-agents/`
- creates tasks
- moves tasks through stages automatically
- routes bug tasks through `Bug Investigator -> Bug Fixer`
- stops at the final human approval step
- logs how long every stage took
- can recover unfinished work after interruptions
- runs all pipeline agents with provider-backed structured outputs
- sends failed QA back to the right implementation agent automatically

## The 4 commands you will use most

### 1. `setup`
Use once per machine or when starting in a new repo.

It:
- finds your repo
- creates global config if needed
- creates local `.ai-agents/`
- creates prompts
- updates `.gitignore`
- asks for human reviewer name explicitly (required)
- lets you choose provider in an interactive menu
- saves LM Studio connection in global config by default (so you do not need manual exports each terminal)
- lets you pick model in a list when provider discovery is available
- supports LM Studio auto model detection (`model: auto`) based on the currently loaded local model
- supports OpenAI-compatible cloud presets (OpenAI, OpenRouter, custom endpoint)
- validates provider and model before finishing

### 2. `start`
Starts the engine.

It:
- runs readiness checks first (does not assume config is valid)
- checks health
- recovers unfinished work
- clears stale locks
- starts the processing loop

If setup is broken, it stops with guidance and asks you to run:
```bash
synx setup
```

When running in an interactive terminal, `start` also shows a live progress panel:
- SYNX cyber logo + tagline
- control-flow diagram: `[SYNX] ➔ [Dispatcher] ➔ [Planner]`
- double-line cards for control/config/task states
- integrated prompt below `TASK BUS`: `SYNX > ...`
- inline event stream card (clean runtime updates without terminal pollution)
- automatic `HUMAN INPUT` card when a task reaches `waiting_human`
- per-task status palette:
  - cyan: `Processing`
  - green: `Success`
  - red: `Critical Error`
  - yellow: `Waiting Human`

You can operate SYNX from the same terminal while `start` is running:
- type commands directly in the prompt (`new`, `status --all`, `approve`, `reprove --reason "..."`, `stop`)
- use quick hotkeys:
  - `F1`: help
  - `F2`: preload new-task template in prompt
  - `F3`: pause/resume processing loop
  - `F10`: request graceful stop

When `HUMAN INPUT` mode is active, free-text replies are treated as reprove reasons for the waiting task unless you type an explicit command.

To disable it:
```bash
synx start --no-progress
```

In quiet mode (`--no-progress`), runtime logs are emitted as a data stream:
```text
[2026-03-16 01:14:22] :: SYNX :: Handoff to Feature Builder (builder) for task-...
```

For a preview run that does not write code changes:
```bash
synx start --dry-run
```

### 3. `new`
Creates a task.

You can use:
```bash
synx new
```

Or:
```bash
synx new "Add dark mode toggle" --type Feature
```

You can also set human QA direction for E2E in the task itself:
```bash
synx new "Fix import/export mismatch and failing E2E selectors" --type Bug --e2e required --e2e-framework playwright --qa-objective "Get Playwright main flow tests passing."
```

Supported task types:
- `Feature`
- `Bug`
- `Refactor`
- `Research`
- `Documentation`
- `Mixed`

Routing summary:
- `Bug`: Dispatcher -> Bug Investigator -> Bug Fixer -> Reviewer -> QA -> PR Writer -> Human approval
- Other types: Dispatcher -> Spec Planner -> Feature Builder -> Reviewer -> QA -> PR Writer -> Human approval
- QA fail: loops back to Bug Fixer (bug tasks) or Feature Builder (other task types)
- QA captures compact diagnostics from failed checks (including E2E) and sends expected-vs-received evidence in the handoff
- QA/implementation now follow human per-task E2E preferences (`--e2e`, `--e2e-framework`, `--qa-objective`)
- QA fail handoff includes structured context per blocker: expected result, received result, evidence, and recommended action
- QA return context is cumulative and updated on each loop so the next implementation attempt sees prior QA findings
- QA now emits explicit test cases with expected vs actual results (real QA mindset)
- In repeated QA loops, implementation agents are instructed to change strategy, not repeat the same failed approach
- QA retry loop is capped (default 3 fails). After the cap, the task is escalated to human review (`waiting_human`).

If you omit fields, the CLI uses interactive menus (arrow keys + Enter).

### 4. `status`
Shows what is happening in simple terms.

It tells you:
- whether basic readiness checks passed
- summary counters (active, waiting, failed, done)
- by default, only the most relevant task:
  - current in-progress task, or
  - latest completed task when nothing is active

To list all tasks/history:
```bash
synx status --all
```

## Final human step
When a task reaches `waiting_human`, you can either approve or reprove it.

Approve:

```bash
synx approve
```

`approve` now lets you select from pending tasks when more than one is waiting.

Reprove (send back to implementation):

```bash
synx reprove --reason "Expected timer to change, received static value"
```

Rollback behavior on `reprove`:
- default is safe mode (`--rollback none`): no code rollback is executed automatically
- optional scoped rollback: `--rollback task` restores tracked files and removes untracked files referenced by this task implementation artifacts
- rollback is explicit by design to avoid reverting unrelated valid work

## Cancel an active task
To stop an active task without killing the engine process:

```bash
synx cancel <task-id>
```

Notes:
- cancellation is graceful: the current stage is interrupted safely when possible
- task status becomes `blocked`
- if you omit `<task-id>`, the CLI tries the most recently active task

## When something goes wrong

### `doctor`
Use this when you are not sure what is broken.

It checks:
- repo detection
- global config
- local config
- human reviewer presence
- prompts
- provider reachability
- loaded model
- stale locks
- orphan working files
- interrupted tasks
- required prompt files (including `bug-fixer.md`)

When issues are found, doctor can run safe fixes immediately.

### `resume`
Use this when a previous execution stopped halfway.

It:
- clears stale locks
- recovers orphaned work back to inbox
- requeues interrupted tasks when safe
- prepares the system to continue

### `fix`
Use this when you want the tool to repair common issues automatically.

It can:
- recreate missing config
- recreate prompts
- clear stale locks
- requeue interrupted work
- requeue recoverable interrupted tasks

## Typical daily flow

### Start
```bash
synx start
```

### Create a task
```bash
synx new
```

### Watch progress
```bash
synx status
```

### Check bottlenecks
```bash
synx metrics
```

### Compare iterations with a time window
```bash
synx metrics --since 20260315-212519
synx metrics --since 1773609919792 --until 1773613519792
synx metrics --since 2026-03-15T21:25:19Z --json
```

### Approve final result
```bash
synx approve
```

### Reprove final result
```bash
synx reprove --reason "QA evidence is still insufficient"
# optional scoped rollback
synx reprove --rollback task
```

## New machine or new user
Never assume the environment is already configured.

Recommended first commands:
```bash
npm install
npm run build
npm link
synx setup
synx start
```

## Multi-stack behavior
- The orchestrator is repository-agnostic: it can run against different stacks/frameworks/languages.
- FB/BF/QA handoffs are file- and risk-based (no hardcoded project path assumptions).
- When package scripts are missing, QA can run language-aware fallback checks based on changed files (TypeScript/Python/Go/Rust/Java).

## Local and cloud models
- Local: LM Studio (`lmstudio`) with runtime model autodiscovery (`model: auto`).
- Cloud: `openai-compatible` preset for OpenAI/OpenRouter/custom gateways.
- In preset env mode, setup keeps the provider base URL in config and usually requires only the API key env variable.
- You can switch models/providers per machine without changing pipeline stages.

## Where files live

### Global config
`~/.ai-agents/config.json`

### Per repo
`.ai-agents/`

### Task folders
`.ai-agents/tasks/<task-id>/`

### Logs
`.ai-agents/logs/`
and
`.ai-agents/tasks/<task-id>/logs/`

## Important expectation
This tool is designed to reduce human error, but it does not remove the need for final human review.
You remain the manager and final validator.

Quality gates now enforced by the pipeline:
- implementation stages must produce real code edits
- when unit test scripts exist, implementation stages should include unit test updates
- for `Feature`, `Bug`, `Refactor`, and `Mixed`, implementation + QA must cover main-flow E2E checks
- for E2E-driven flows, QA applies low-noise diagnostics settings and forwards actionable failure evidence (not screenshot-only noise)
- QA must validate changed files and executed checks, including E2E checks for main flows when applicable

Advanced tuning:
- set `AI_AGENTS_QA_MAX_RETRIES` to control how many QA fail loops are allowed before forced human escalation
- set `AI_AGENTS_PROVIDER_TIMEOUT_MS` to control provider timeout per call
- set `AI_AGENTS_PROVIDER_DISCOVERY_TIMEOUT_MS` to control model discovery timeout checks
- set `AI_AGENTS_OPENAI_MAX_TOKENS` to cap completion tokens for OpenAI-compatible providers
- set `AI_AGENTS_PROVIDER_INPUT_COST_PER_1K_USD` to estimate input-token USD cost in metrics output (default `0`)
- set `AI_AGENTS_PROVIDER_OUTPUT_COST_PER_1K_USD` to estimate output-token USD cost in metrics output (default `0`)
- token/cost estimates now use `src/lib/token-estimation.ts` with a chars-per-token heuristic plus optional known-model pricing fallback (env overrides still take precedence)
- set `AI_AGENTS_PROVIDER_STREAMING=true` to enable SSE streaming mode for OpenAI-compatible provider calls (`false` by default)
- set `AI_AGENTS_PROVIDER_MAX_REQUESTS_PER_MINUTE=<n>` to enforce local provider-call throughput cap (`0` disables, default `0`)
- set `AI_AGENTS_PROVIDER_RATE_LIMIT_WINDOW_MS=<ms>` to tune the local limiter window (default `60000`, min `200`)
- set `AI_AGENTS_PROVIDER_BACKOFF_MAX_RETRIES=<n>` for transient-provider retries (default `2`, max `6`)
- set `AI_AGENTS_PROVIDER_BACKOFF_BASE_MS=<ms>` for backoff base delay (default `500`)
- set `AI_AGENTS_PROVIDER_BACKOFF_MAX_MS=<ms>` for max backoff delay cap (default `8000`)
- set `AI_AGENTS_PROVIDER_BACKOFF_JITTER_RATIO=<0..1>` for retry jitter (default `0.2`)
- set `AI_AGENTS_DISABLE_CONFIG_CACHE=1` to disable resolved-config in-memory cache
- set `AI_AGENTS_DISABLE_PROMPT_CACHE=1` to disable prompt-file in-memory cache
- set `AI_AGENTS_DISABLE_PROVIDER_CACHE=1` to disable provider instance reuse cache
- set `AI_AGENTS_POLL_INTERVAL_MS=<ms>` to adjust idle polling interval (default `1200`, min `200`)
- set `AI_AGENTS_MAX_IMMEDIATE_CYCLES=<n>` to limit immediate no-sleep cycles after processing work (default `3`)
- set `AI_AGENTS_DRY_RUN=1` to simulate workspace edits without writing files

Polling/queue audit logs:
- `.ai-agents/logs/polling-metrics.jsonl`: loop action (`immediate`/`sleep`), reason, processed stages/tasks, and sleep-avoidance counters.
- `.ai-agents/logs/queue-latency.jsonl`: latency from request creation to stage start.

Provider throttle audit logs:
- `.ai-agents/logs/provider-throttle.jsonl`: local limiter waits, backoff scheduling, retry attempts, recovery, and exhaustion events.
- `.ai-agents/logs/stage-metrics.jsonl`: per-stage provider metrics now include `providerAttempts`, `providerBackoffRetries`, `providerBackoffWaitMs`, `providerRateLimitWaitMs`, `estimatedInputTokens`, `estimatedOutputTokens`, `estimatedTotalTokens`, and `estimatedCostUsd`.
- `.ai-agents/logs/provider-model-resolution.jsonl`: LM Studio model autodiscovery/selection/fallback events.

LM Studio model id behavior:
- Provider type `lmstudio` supports `model: auto` and detects loaded model(s) from LM Studio at runtime.
- Default LM Studio endpoint is `http://127.0.0.1:1234` (OpenAI-compatible API path `/v1` is applied automatically).
- If autodiscovery fails, the runtime can use `fallbackModel` in config or `AI_AGENTS_LMSTUDIO_FALLBACK_MODEL`.
- You can disable autodiscovery with `autoDiscoverModel: false` (or `AI_AGENTS_LMSTUDIO_AUTODISCOVER_MODEL=false`) and pin a fixed model.
- If no model is loaded in LM Studio, setup/doctor/start checks fail with a clear action message.

LM Studio env knobs:
- `AI_AGENTS_LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234`)
- `AI_AGENTS_LMSTUDIO_API_KEY` (default `lm-studio-local`)
- `AI_AGENTS_LMSTUDIO_MODEL` (`auto` or explicit model id)
- `AI_AGENTS_LMSTUDIO_AUTODISCOVER_MODEL` (`true`/`false`)
- `AI_AGENTS_LMSTUDIO_FALLBACK_MODEL` (optional fallback model id)

Minimal LM Studio provider config example:
```json
{
  "type": "lmstudio",
  "baseUrl": "http://127.0.0.1:1234",
  "model": "auto",
  "fallbackModel": "",
  "autoDiscoverModel": true
}
```

Diagnostics:
- Use `synx doctor` to confirm LM Studio connectivity and loaded models.
- If autodiscovery fails, inspect `.ai-agents/logs/provider-model-resolution.jsonl`.
- If no model is loaded, load one in LM Studio and retry.

## Stateless LLM calls
OpenAI-compatible calls are stateless by design.
Each call is isolated and includes only explicit current context:
- system prompt for the current stage
- user payload built from current stage input

No previous conversational memory/history is reused between calls.

## Temperature by agent and task type
OpenAI-compatible provider resolves temperature in this order:
1. `AI_AGENTS_TEMPERATURE_<AGENT>_<TASK_TYPE>`
2. `AI_AGENTS_TEMPERATURE_<AGENT>`
3. `AI_AGENTS_TEMPERATURE_<TASK_TYPE>`
4. Internal defaults

Validation behavior:
- accepts only numeric values between `0` and `2`
- invalid values are ignored and fallback is applied
- invalid env vars never break pipeline execution

Agent defaults:
- `Dispatcher`: `0.1`
- `Spec Planner`: `0.1`
- `Bug Investigator`: `0.1`
- `Bug Fixer`: `0.05`
- `Feature Builder`: `0.05`
- `Reviewer`: `0.05`
- `QA Validator`: `0.05`
- `PR Writer`: `0.3`
- `Human Review`: `0.1`

Task-type defaults:
- `Feature`: `0.1`
- `Bug`: `0.05`
- `Refactor`: `0.05`
- `Research`: `0.2`
- `Documentation`: `0.3`
- `Mixed`: `0.1`

Environment variable examples:
- `AI_AGENTS_TEMPERATURE_DISPATCHER=0.1`
- `AI_AGENTS_TEMPERATURE_BUG_FIXER=0.05`
- `AI_AGENTS_TEMPERATURE_QA_VALIDATOR=0.05`
- `AI_AGENTS_TEMPERATURE_PR_WRITER=0.3`
- `AI_AGENTS_TEMPERATURE_DISPATCHER_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_DISPATCHER_BUG=0.1`
- `AI_AGENTS_TEMPERATURE_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_BUG=0.05`
