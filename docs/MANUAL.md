# SYNX – Operations Manual

## What this tool does
It runs a local AI agent pipeline inside your repository using a specialized **Dream Stack 2026** expert squad.

The system:
- creates a safe hidden work area in `.ai-agents/`
- creates tasks and moves them through stages automatically
- routes tasks to the right domain expert (Front, Mobile, Back, SEO Specialist)
- validates results via the QA Engineer (Playwright E2E + Vitest unit)
- stops at the final human approval step
- logs how long every stage took
- can recover unfinished work after interruptions
- invokes an on-demand `Researcher` for external technical context

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
- control-flow diagram: `[SYNX] ➔ [Dispatcher] ➔ [Expert] ➔ [QA Engineer]`
- double-line cards for control/config/task states
- `USER INPUT` card (boxed prompt with visible cursor indicator)
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
  - `?`: show available commands
  - `F1`: help
  - `F2`: preload new-task template in prompt
  - `F3`: pause/resume processing loop
  - `F4`: toggle `CONSOLE` / `EVENT STREAM`
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
- **Bug tasks:** `Dispatcher → Bug Investigator → Synx QA Engineer → Human Review`
- **Simple/clear tasks:** `Dispatcher → Expert → Synx QA Engineer → Human Review`
- **Complex/ambiguous tasks:** `Dispatcher → Spec Planner (targetExpert hint) → Expert → Synx QA Engineer → Human Review`

Expert Squad:
- `Synx Front Expert` – Next.js App Router, TailwindCSS, WCAG 2.1
- `Synx Mobile Expert` – Expo, React Native, Reanimated, EAS
- `Synx Back Expert` – NestJS/Fastify, Prisma ORM, Strict TypeScript
- `Synx SEO Specialist` – Core Web Vitals, JSON-LD, Next.js Metadata API, Lighthouse ≥ 90
- `Synx QA Engineer` – Playwright E2E + Vitest unit; auto-routes failures to originating expert

QA failure behavior:
- QA failure context is cumulative across retries
- QA retry loop is capped (default 3). Exceeded cap → escalates to `waiting_human`
- On-demand `Researcher` triggers when confidence < 0.6 or the same QA failure repeats twice
- Research anti-loop: if recommendation repeats while issue persists, task escalates to `waiting_human`
- QA captures evidence per finding: `issue`, `expectedResult`, `receivedResult`, `evidence[]`, `recommendedAction`

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
- required prompt files

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
- Anthropic Claude Code (`anthropic`) for Claude-oriented workloads using `AI_AGENTS_ANTHROPIC_API_KEY`.

### Environment files
SYNX reads a `.env` file from the current working directory before any command runs, so API keys can live in that file instead of being typed manually in every shell. Copy `.env.example` to `.env` and replace the placeholder values with your real secrets. Each provider already knows which environment names to look for:

- `AI_AGENTS_OPENAI_BASE_URL` and `AI_AGENTS_OPENAI_API_KEY` (OpenAI-compatible endpoints)
- `AI_AGENTS_GOOGLE_API_KEY` (Google Cloud generative AI)
- `AI_AGENTS_LMSTUDIO_API_KEY` (LM Studio when you host local models)
- `AI_AGENTS_ANTHROPIC_API_KEY` (Claude Code / Anthropic models)

Use the usual `KEY=VALUE` or `export KEY=VALUE` syntax and wrap values in quotes if they contain spaces. The repository also provides a `.env.example` stub with the provider keys defined; copy it to `.env` before editing. Example `.env`:

```
AI_AGENTS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_AGENTS_OPENAI_API_KEY=sk-us-east-123
AI_AGENTS_GOOGLE_API_KEY=AIza...
```

Keep that file in the repo root, add it to `.gitignore`, and reload `synx` (or reopen your terminal) after editing to make the new secrets available.

---

## Custom Agents & Pipelines

Beyond the built-in Dream Stack expert squad, you can define your own agents and chain them into multi-step pipelines with any provider (Anthropic, OpenAI, Google, LM Studio, or any OpenAI-compatible endpoint).

### Concepts

| Term | What it is |
|---|---|
| **Custom Agent** | A JSON definition in `.ai-agents/agents/` that pairs an ID, a prompt file, and a provider config. |
| **Pipeline** | A JSON definition in `.ai-agents/pipelines/` that describes an ordered sequence of agent steps. |
| **Pipeline Executor** | The built-in worker that reads the pipeline definition, runs each step in order, and passes accumulated output to the next step. |

---

### Managing Custom Agents

#### List all custom agents

```bash
synx agent list
```

#### Show full details of one agent

```bash
synx agent show <id>
```

#### Create a new agent (interactive)

```bash
synx agent create
```

The wizard asks for: ID, display name, provider, model, output schema (`generic` or `builder`), and an optional default next agent.
It also creates a starter `.md` prompt file at `.ai-agents/prompts/<id>.md` that you edit to define the agent's behavior.

#### Create a new agent (non-interactive, all flags)

```bash
synx agent create \
  --id my-analyst \
  --name "My Analyst" \
  --provider anthropic \
  --model claude-sonnet-4-6 \
  --output-schema generic \
  --default-next-agent "Synx QA Engineer"
```

Supported providers and what each flag sets automatically:

| `--provider` | API key env var | Base URL |
|---|---|---|
| `anthropic` | `AI_AGENTS_ANTHROPIC_API_KEY` | — |
| `openai-compatible` | `AI_AGENTS_OPENAI_API_KEY` | `https://api.openai.com/v1` |
| `google` | `AI_AGENTS_GOOGLE_API_KEY` | — |
| `lmstudio` | — | `http://localhost:1234/v1` (auto-discover) |
| `mock` | — | — (deterministic, for testing) |

#### Skip creating the prompt file

```bash
synx agent create --id my-analyst --name "My Analyst" --provider anthropic --model claude-sonnet-4-6 --no-prompt-file
```

#### Output schemas

- **`generic`** — the agent returns `{ summary, result?, nextAgent? }`. Best for research, analysis, planning.
- **`builder`** — the agent returns `{ implementationSummary, filesChanged, changesMade, testsToRun, risks, edits, nextAgent }`. Best for coding agents that write files.

---

#### Agent definition file (`.ai-agents/agents/<id>.json`)

What the file looks like after `synx agent create`:

```json
{
  "id": "my-analyst",
  "name": "My Analyst",
  "prompt": ".ai-agents/prompts/my-analyst.md",
  "provider": {
    "type": "anthropic",
    "model": "claude-sonnet-4-6",
    "apiKeyEnv": "AI_AGENTS_ANTHROPIC_API_KEY"
  },
  "outputSchema": "generic",
  "defaultNextAgent": "Synx QA Engineer"
}
```

You can edit this file directly after creation to change any field.

#### Prompt file (`.ai-agents/prompts/<id>.md`)

The wizard generates a starter prompt. Open it and fill in the `Role` and `Responsibilities` sections.
The `Output Format` section is pre-filled based on the output schema you chose — do not remove it, as the executor validates against it.

```markdown
# My Analyst

You are My Analyst, a specialized AI agent in the Synx pipeline.

## Role
<!-- Describe what this agent does -->

## Responsibilities
<!-- List specific responsibilities -->

## Context
You will receive:
- `task`: title, rawRequest, extraContext
- `pipelineContext`: step index, pipeline name, outputs from previous steps

## Output Format
Return a JSON object with:
- `summary` (string): Brief description of what you did
- `result` (object, optional): Your structured output data
- `nextAgent` (string, optional): Agent to hand off to next
```

---

### Managing Pipelines

#### List all pipelines

```bash
synx pipeline list
```

#### Show full details of one pipeline

```bash
synx pipeline show <id>
```

#### Run a pipeline

```bash
synx pipeline run <id> "Your detailed input here"
```

This creates a task, writes an initial `pipeline-state.json`, and queues the Pipeline Executor. The engine must be running (`synx start`) for it to process.

---

#### Pipeline definition file (`.ai-agents/pipelines/<id>.json`)

Create this file manually. Example:

```json
{
  "id": "research-and-build",
  "name": "Research then Build",
  "description": "Analyst researches, then the back expert implements",
  "routing": "sequential",
  "steps": [
    { "agent": "my-analyst" },
    { "agent": "Synx Back Expert" },
    { "agent": "Synx QA Engineer" }
  ]
}
```

Steps can mix built-in agents (`Synx Back Expert`, `Synx QA Engineer`, etc.) and custom agents (by their `id`).

#### Routing modes

| `routing` | Behavior |
|---|---|
| `sequential` | Steps run in order, one after the other. |
| `dynamic` | Each step's output `nextAgent` field decides the next step. |
| `conditional` | Steps after the current one are scanned; the first whose `condition` evaluates to `true` runs next. Falls back to `defaultNextStep` when nothing matches. |

---

#### Conditional routing — how it works

When `routing` is `"conditional"`, after step N finishes, the executor scans forward to find the next step to run:

1. Check step N+1, N+2, … in order.
2. For each candidate:
   - If it has a `condition`: evaluate the expression against the current step's output. If `true` → go there. If `false` → keep scanning.
   - If it has **no** `condition`: stop scanning (acts as an unconditional fence).
3. If no condition matched → use the current step's `defaultNextStep`.
4. If no `defaultNextStep` either → advance sequentially to N+1.

**Expression syntax** — the expression is evaluated as JavaScript with `output` in scope, where `output` is the full parsed output of the step that just finished.

```
output.result && output.result.type === 'bug'
output.result && output.result.confidence > 0.8
output.result && output.result.severity === 'high'
output.nextAgent === 'Synx QA Engineer'
```

> **Important:** The `output` object only contains the fields that your agent explicitly returns: `summary`, `result` (object), and `nextAgent`. Custom data must be nested inside `result`. Access it as `output.result.yourField`.

**Safety:** A condition that throws (e.g. accessing a missing nested key) or has a syntax error evaluates to `false` — the scan continues to the next candidate.

**Full example**

```json
{
  "id": "triage-pipeline",
  "name": "Bug Triage Pipeline",
  "routing": "conditional",
  "steps": [
    {
      "agent": "triage-analyst",
      "defaultNextStep": 3
    },
    {
      "agent": "Synx Back Expert",
      "condition": "output.result && output.result.type === 'bug' && output.result.severity === 'high'",
      "defaultNextStep": 3
    },
    {
      "agent": "Synx Front Expert",
      "condition": "output.result && output.result.type === 'bug' && output.result.severity === 'low'",
      "defaultNextStep": 3
    },
    {
      "agent": "Synx QA Engineer"
    }
  ]
}
```

After `triage-analyst` (step 0) runs:
- `{ type: "bug", severity: "high" }` in `result` → goes to **step 1** (Back Expert).
- `{ type: "bug", severity: "low" }` in `result` → goes to **step 2** (Front Expert).
- Anything else → no condition matches → `defaultNextStep: 3` → goes directly to **step 3** (QA).

After step 1 or 2 completes:
- Step 3 (QA) has no `condition`, so the scan stops immediately.
- `defaultNextStep: 3` on steps 1 and 2 sends them directly to QA.

**Corresponding `triage-analyst` prompt output format:**

Your `triage-analyst` agent must return `result` with the fields your conditions reference:

```json
{
  "summary": "Identified a high-severity backend bug in the auth service.",
  "result": {
    "type": "bug",
    "severity": "high",
    "area": "backend"
  },
  "nextAgent": null
}
```

---

#### Per-step provider override

Override the provider for a single step using shorthand syntax `provider/model`:

```json
{ "agent": "my-analyst", "providerOverride": "anthropic/claude-opus-4-6" }
```

With extra parameters (query string format):

```json
{ "agent": "my-analyst", "providerOverride": "openai/gpt-4o?baseUrl=https://my-gateway.com/v1&apiKeyEnv=MY_KEY" }
```

Supported query params: `apiKeyEnv`, `baseUrl`, `baseUrlEnv`, `apiKey`, `fallbackModel`.

#### Provider fallback chain

If the primary provider fails, the executor tries each fallback in order:

```json
{
  "agent": "my-analyst",
  "providerFallbacks": [
    "anthropic/claude-sonnet-4-6",
    "openai/gpt-4o"
  ]
}
```

---

### End-to-end example: create and run a custom pipeline

```bash
# 1. Create two custom agents
synx agent create \
  --id requirements-analyst \
  --name "Requirements Analyst" \
  --provider anthropic \
  --model claude-sonnet-4-6 \
  --output-schema generic

synx agent create \
  --id api-builder \
  --name "API Builder" \
  --provider anthropic \
  --model claude-opus-4-6 \
  --output-schema builder

# 2. Edit each prompt file to define behavior
# .ai-agents/prompts/requirements-analyst.md
# .ai-agents/prompts/api-builder.md

# 3. Create the pipeline definition
cat > .ai-agents/pipelines/requirements-to-api.json <<'EOF'
{
  "id": "requirements-to-api",
  "name": "Requirements to API",
  "routing": "sequential",
  "steps": [
    { "agent": "requirements-analyst" },
    { "agent": "api-builder" },
    { "agent": "Synx QA Engineer" }
  ]
}
EOF

# 4. Start the engine
synx start

# 5. Run the pipeline (in another terminal or via the inline prompt)
synx pipeline run requirements-to-api \
  "Build a REST endpoint that returns paginated user activity logs filtered by date range"

# 6. Monitor progress
synx status

# 7. Approve final result
synx approve
```

---

### How context flows between steps

Each step receives:

```json
{
  "task": {
    "title": "...",
    "rawRequest": "The input you passed to pipeline run",
    "extraContext": {}
  },
  "pipelineContext": {
    "pipelineId": "requirements-to-api",
    "pipelineName": "Requirements to API",
    "routing": "sequential",
    "currentStep": 1,
    "totalSteps": 3,
    "currentAgent": "api-builder",
    "previousSteps": [
      {
        "stepIndex": 0,
        "agent": "requirements-analyst",
        "summary": "Identified 3 key requirements: pagination, date filtering, auth.",
        "keyOutputs": {
          "summary": "Identified 3 key requirements: pagination, date filtering, auth.",
          "result": { "requirements": ["pagination", "date filtering", "auth"] },
          "nextAgent": "api-builder"
        },
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "durationMs": 4200
      }
    ]
  }
}
```

Use `pipelineContext.previousSteps` in your prompt to instruct the agent to build on prior work instead of starting from scratch.

**Note on context size:** The executor automatically strips verbose fields (e.g. the `edits` array from builder agents) from `previousSteps` before passing them to the next agent — this prevents token bloat in long pipelines. The full output including `edits` is always preserved in `.ai-agents/tasks/<id>/done/pipeline-step-N.done.json` for audit purposes.

---

### Where pipeline and agent files live

```
.ai-agents/
├── agents/
│   ├── requirements-analyst.json
│   └── api-builder.json
├── pipelines/
│   └── requirements-to-api.json
└── prompts/
    ├── requirements-analyst.md
    └── api-builder.md
```

---

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

Research-specific artifact:
- `.ai-agents/tasks/<task-id>/artifacts/research-log.json` (queries, sources, recommendation, provider/model, anti-loop signal)

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
- set `AI_AGENTS_RESEARCH_ENABLED=true|false` to enable/disable on-demand Researcher (default `true`)
- set `AI_AGENTS_RESEARCH_MAX_SEARCHES_PER_STAGE=<n>` to cap web searches per stage (default `2`)
- set `AI_AGENTS_RESEARCH_WEB_PROVIDER=duckduckgo|tavily` (default `duckduckgo`)
- set `AI_AGENTS_RESEARCH_TAVILY_API_KEY=<key>` when using Tavily for web search
- optional research-provider overrides:
  - `AI_AGENTS_RESEARCH_PROVIDER_TYPE`
  - `AI_AGENTS_RESEARCH_MODEL`
  - `AI_AGENTS_RESEARCH_BASE_URL`
  - `AI_AGENTS_RESEARCH_API_KEY`
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
- `Researcher`: `0.2`
- `Human Review`: `0.1`
- `Synx Front Expert`: `0.05`
- `Synx Mobile Expert`: `0.05`
- `Synx Back Expert`: `0.05`
- `Synx QA Engineer`: `0.05`
- `Synx SEO Specialist`: `0.10`

Task-type defaults:
- `Feature`: `0.1`
- `Bug`: `0.05`
- `Refactor`: `0.05`
- `Research`: `0.2`
- `Documentation`: `0.3`
- `Mixed`: `0.1`

Environment variable examples:
- `AI_AGENTS_TEMPERATURE_DISPATCHER=0.1`
- `AI_AGENTS_TEMPERATURE_DISPATCHER_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_DISPATCHER_BUG=0.1`
- `AI_AGENTS_TEMPERATURE_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_BUG=0.05`

## Learning Loop

Synx records the outcome of every pipeline task and feeds that history back into future agent prompts — a *do → analyse → learn → improve → repeat* cycle.

### How it works

1. **Record** — when you run `synx approve`, Synx writes one `LearningEntry` per completed pipeline step to `.ai-agents/learnings/<agent-id>.jsonl`.  
   When you run `synx reprove`, Synx writes one entry for the **last** completed step only (the one that produced the output you rejected), including your rejection reason.

2. **Inject** — before each pipeline step, the executor loads the last 5 entries for that agent and appends a *"Your recent performance"* section to its system prompt:

   ```
   ## Your recent performance (last N tasks)

   1. [2026-03-20] ✅ Approved — Task: task-2026-03-20-abc
      Output: "Analyzed requirements and identified 3 gaps"

   2. [2026-03-21] ❌ Reproved — Task: task-2026-03-21-xyz
      Output: "Implemented login form"
      Feedback: "Missing input validation for the email field"
   ```

3. **Improve** — the agent reads its history and can adjust its approach for the current task.

### Storage

Learnings are stored as append-only JSONL files:

```
.ai-agents/
  learnings/
    analyst.jsonl
    synx-front-expert.jsonl
    synx-back-expert.jsonl
    ...
```

Each line is a JSON object (`LearningEntry`) with:

| Field | Description |
|---|---|
| `timestamp` | ISO-8601 datetime |
| `taskId` | Task that generated this entry |
| `agentId` | Agent that ran the step |
| `summary` | What the agent produced (from `output.summary`) |
| `outcome` | `"approved"` or `"reproved"` |
| `reproveReason` | Human's feedback (reproved tasks only) |
| `pipelineId` | Which pipeline definition was used |
| `stepIndex` | Step position within the pipeline |
| `provider` / `model` | Provider and model used for this step |

### `synx learn` command

Inspect recorded learnings from the CLI:

```bash
# All agents
synx learn

# Specific agent, last 20 entries
synx learn analyst --limit 20
```

Output example:
```
────────────────────────────────────────────────────────────
Agent: analyst
  Total runs : 12
  Approved   : 10
  Reproved   : 2
  Approval % : 83%
  Last run   : 2026-03-21

  Last 5 entries:
    ✅ [2026-03-20] task-2026-03-20-abc — Analyzed requirements and identified 3 gaps
    ❌ [2026-03-21] task-2026-03-21-xyz — Built login form without edge-case coverage
       Feedback: Missing input validation for the email field
    ...
```

### Non-pipeline tasks

Learning recording only applies to **pipeline tasks** (tasks started with `synx pipeline run`). Regular tasks approved or reproved via `synx approve` / `synx reprove` are unaffected.
