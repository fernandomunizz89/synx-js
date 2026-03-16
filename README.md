# AI Agents V5

A human-friendly CLI for running a file-driven AI agents pipeline inside each repository.

This version is designed to reduce operator friction:
- guided setup
- interactive terminal menus (arrow keys + Enter)
- global config + local project overrides
- automatic repo discovery
- recovery of unfinished executions
- human-readable diagnostics
- simple commands for daily use

## Main commands

- `setup`
- `start`
- `new`
- `status`
- `approve`
- `doctor`
- `resume`
- `fix`
- `metrics`
- `show-config`

## Task types
Supported values for `ai-agents new --type <type>`:
- `Feature`
- `Bug`
- `Refactor`
- `Research`
- `Documentation`
- `Mixed`

## Human QA Input Per Task
`ai-agents new` now captures human QA preferences for E2E:
- `--e2e auto|required|skip`
- `--e2e-framework auto|cypress|playwright|other`
- `--qa-objective "<goal>"`

Example:
```bash
ai-agents new "Fix import/export mismatch and failing E2E selectors" --type Bug --e2e required --e2e-framework cypress --qa-objective "Get Cypress main flow tests passing."
```

These preferences are passed to QA, Feature Builder, and Bug Fixer as explicit quality gates.

## Feature summary
- See [FEATURES.md](./FEATURES.md) for the initial feature set included in this baseline commit.

## Recommended flow

### First time on a machine
```bash
cd ~/Workspace/ai-agents-v5-node-ts
npm install
npm run build
npm link
```

Then inside a repo:
```bash
ai-agents setup
```

`setup` now:
- detects the repo automatically
- asks for human reviewer name explicitly (required, no implicit default)
- lets you choose provider from an interactive list
- discovers models and lets you pick from a list when possible
- for LM Studio, saves recommended local connection by default (no manual `export` required)
- for LM Studio, can auto-detect the currently loaded local model at runtime (`model: auto`)
- validates provider + model before finishing

### Daily use
```bash
ai-agents start
ai-agents new
ai-agents status
ai-agents approve
```

While `start` is running in a terminal, it now shows:
- live spinner heartbeat
- elapsed timer
- per-task progress bar by pipeline stage/agent

If you prefer quiet mode:
```bash
ai-agents start --no-progress
```

`status` now defaults to a focused view:
- shows the task currently in progress (or waiting your approval)
- if no active task exists, shows the latest completed task

To list all historical tasks:
```bash
ai-agents status --all
```

`metrics` now supports collaboration-focused measurement with time windows:
```bash
ai-agents metrics --since 20260315-212519
ai-agents metrics --since 1773609919792 --until 1773613519792
ai-agents metrics --since 2026-03-15T21:25:19Z --json
```

## Preflight behavior
- `start`, `new`, `status`, and `approve` run readiness checks before doing work.
- The CLI does not assume another machine/user is already configured.
- If setup is incomplete, commands show concrete fixes and the next command to run.
- `start` aborts by default on broken config to avoid confusing failures (use `start --force` only when needed).

Interactive selection is used by:
- `setup`
- `new`
- `approve`
- `fix` (checkbox selection for repair actions)

## Config layers

1. internal defaults
2. global CLI config in `~/.ai-agents/config.json`
3. local project config in `<repo>/.ai-agents/config/project.json`

## What stays global
- provider type
- model
- provider base URL env names
- provider API key env names
- human reviewer (set explicitly in setup)

## What stays in each repo
- `.ai-agents/tasks`
- `.ai-agents/logs`
- `.ai-agents/prompts`
- `.ai-agents/runtime`
- project metadata
- optional provider overrides

## Provider support in V5
- `mock`
- `openai-compatible`
- `lmstudio`

This works well with:
- OpenAI-compatible APIs
- LM Studio local server
- OpenRouter-compatible gateways
- future compatible endpoints

`setup` now includes OpenAI-compatible cloud presets:
- `OpenAI API (cloud)` -> `https://api.openai.com/v1` (for models like `gpt-5.3-codex`)
- `OpenRouter (cloud multi-model)` -> `https://openrouter.ai/api/v1` (for models like Claude/Qwen families)
- `Custom OpenAI-compatible endpoint` -> self-hosted or gateway deployments
- In env mode with preset defaults, setup keeps the preset base URL in config and asks only for provider API key env by default.

If model discovery is unavailable, setup accepts manual model ids and shows preset-specific examples.

### LM Studio autodiscovery (`http://127.0.0.1:1234`)
- `lmstudio` provider supports `model: auto` (default in setup recommendation).
- In auto mode, the runtime queries LM Studio `/v1/models` and chooses a loaded model dynamically.
- The selected model is logged in `.ai-agents/logs/provider-model-resolution.jsonl`.
- If autodiscovery fails, you can use fallback model via config (`fallbackModel`) or env (`AI_AGENTS_LMSTUDIO_FALLBACK_MODEL`).
- You can pin a fixed model id instead of auto mode in setup.
- If no model is loaded in LM Studio, health checks fail with a clear message.

Example global config (LM Studio auto mode):
```json
{
  "providers": {
    "dispatcher": {
      "type": "lmstudio",
      "baseUrl": "http://127.0.0.1:1234",
      "model": "auto",
      "fallbackModel": "",
      "autoDiscoverModel": true
    },
    "planner": {
      "type": "lmstudio",
      "baseUrl": "http://127.0.0.1:1234",
      "model": "auto",
      "fallbackModel": "",
      "autoDiscoverModel": true
    }
  }
}
```

Troubleshooting quick checks:
- run `ai-agents doctor` and verify provider health lines for Dispatcher/Planner.
- if detection fails, ensure LM Studio local server is running and at least one model is loaded.
- inspect `.ai-agents/logs/provider-model-resolution.jsonl` for discovery/fallback reasons.

## Agent pipeline behavior
- `Dispatcher` and `Spec Planner` are provider-driven with strict JSON schemas.
- Downstream agents are also provider-driven:
  - `Bug Investigator`
  - `Bug Fixer`
  - `Feature Builder`
  - `Reviewer`
  - `QA Validator`
  - `PR Writer`
- The pipeline only advances when each stage output passes schema validation.
- `Bug` tasks route to `Bug Fixer` after `Bug Investigator` (instead of `Feature Builder`).
- `Feature Builder` and `Bug Fixer` apply real workspace edits (not only text handoff).
- Implementation agents can edit multiple related files when required to complete a real fix/feature.
- When unit test scripts exist, implementation agents must report unit test files updated for the change.
- Pre-handover quality gate: `Feature Builder` and `Bug Fixer` run strict sanity checks before handoff; lint + build (when scripts exist) plus language-aware checks must pass.
- Sanity checks run in cheap-first order: lightweight static heuristics + lint/type checks execute before heavy checks (for example full build).
- When cheap in-scope failures are already conclusive, heavy checks are skipped in that pass to reduce unnecessary cost/time.
- Quality-repair retries are adaptive (not blind repetition): attempt 1 uses local/cheap fixes, attempt 2 expands context, and repeated no-progress retries are aborted early instead of forcing a full retry count.
- Each quality-repair retry now logs explicit reason, failure hypothesis, selected strategy, strategy delta vs previous attempt, and success/abandon criteria for auditability.
- Implementation-stage quality gate can enforce project-clean failures as blocking (not only scoped files), reducing QA handoffs with hidden lint/build debt.
- Command-output diagnostics are scanned for hidden blocker signatures (for example import/export mismatch or runtime syntax markers) and treated as failures before QA handoff.
- JS/TS code-quality bootstrap now attempts to provision linting/typecheck automatically: it can install missing ESLint dependencies, generate a conservative `eslint.config.cjs`, and wire `scripts.lint`/`scripts.typecheck` before validation.
- For `Feature`, `Bug`, `Refactor`, and `Mixed`, main-flow E2E validation is required by QA.
- If E2E infrastructure is missing, implementation agents are instructed to add an E2E script/test path as part of remediation.
- `QA Validator` validates real evidence using `git diff` and runnable project scripts (`check`, `test`, `lint`, and common `e2e` script names when present).
- Provider calls are stateless per execution: every LLM request is built from explicit current input only (`systemPrompt` + current user payload), without reused chat memory/history.
- OpenAI-compatible provider now includes short JSON-format retries (max 2 extra attempts) only for parse-format failures, so malformed formatting does not force full stage reprocessing.
- On QA failure, the task is automatically sent back to the correct implementation agent (`Bug Fixer` for bug tasks, `Feature Builder` for others).
- QA failure handoff now includes structured `expectedResult` vs `receivedResult` items with evidence and recommended actions.
- `Bug Investigator` handoff is now file-centric: suspect files/areas, primary+secondary hypotheses, explicit risk assessment, and builder check list.
- `Feature Builder` handoff is now file-centric: changed+impacted files, technical risk list, structured risk assessment, review focus, and residual/manual validation notes.
- `QA Validator` handoff is now audit-focused: files reviewed, validation mode (static vs executed evidence), structured technical risk summary, recommended checks, and residual risks.
- BF/FB/QA are instructed to avoid false certainty: if build/runtime checks were not fully executed, outputs must explicitly call that out as residual risk.
- Root-cause-first policy: E2E failures must prioritize application-code fixes; tests are treated as diagnostics and are only changed when evidence shows test defects.
- QA and implementation agents now derive root-cause focus + source-file hints from failure evidence to guide remediation toward `src/**` first.
- QA return context is cumulative across retries and is passed forward again on each new remediation loop.
- QA now records explicit test cases (`expectedResult` vs `actualResult`) to mirror real QA workflows.
- QA now enriches failed checks (especially Cypress/E2E) with compact diagnostics, artifacts, and runtime QA config notes.
- QA handoff now also reports code-quality bootstrap actions and keeps reviewed-file paths normalized for cleaner audit trails.
- QA Cypress selector preflight now ignores scaffold specs like `example.cy.*` when real task specs are present, reducing irrelevant loop-backs.
- QA verdicts are now evidence-backed: if checks pass and no hard failures exist, unsupported model-only failures are discarded.
- Cypress QA runs use low-noise runtime overrides (e.g., reduced screenshot/video noise) to prioritize actionable failure context.
- Agent audit logs now include structured `stage_note` events (for example `execution_context`, `quality_gate_*`, `validation_evidence_snapshot`, `qa_decision`) so retries and handoff decisions are diagnosable without dumping full raw context.
- Quality-gate notes now expose compact counters (`cheapChecksExecuted`, `heavyChecksExecuted`, `heavyChecksSkipped`, `fullBuildChecksExecuted`, `earlyInScopeFailures`) for quick before/after benchmarking.
- QA honors human per-task E2E preferences (policy/framework/objective) and validates against that target.
- On repeated QA loops, implementation agents are instructed to change strategy instead of repeating the same failed plan.
- QA retry loop is capped. After the retry limit is reached, the task is escalated to `waiting_human`.
- Stage inputs now include original task input and prior stage output, so each agent works with real upstream context.
- `Bug Fixer` and `Feature Builder` now auto-recover malformed `replace_snippet` model outputs to avoid hard pipeline failures.
- Cypress config recovery now auto-generates `cypress.config.cjs`, rewires scripts to use it, and keeps `cypress.config.ts` lint-safe.
- When QA reports repeated static-value assertion mismatches, deterministic remediations can patch source/state update logic and the failing E2E spec path directly.

## Project-agnostic design
- The orchestrator is not tied to a single target repository or stack.
- QA and implementation stages now use file/risk-oriented handoffs without project-specific path assumptions.
- Pre-QA quality gates include language-aware checks beyond JS/TS when changed files indicate other stacks (for example Python, Go, Rust, Java).
- OpenAI-compatible providers allow switching between local and cloud coding models without changing pipeline architecture.

## Real code edits and QA evidence
- Implementation agents (`Feature Builder`, `Bug Fixer`) accept concrete edit operations (`create`, `replace`, `replace_snippet`, `delete`) and apply them safely inside the workspace root.
- Protected paths are blocked from edits (`.ai-agents/**`, `.git/**`).
- QA records changed files, checks, and E2E validation planning in task artifacts:
  - `.ai-agents/tasks/<task-id>/done/04-implementation.done.json`
  - `.ai-agents/tasks/<task-id>/done/04b-bug-fixer.done.json` (bug path)
  - `.ai-agents/tasks/<task-id>/done/06-qa.done.json`
  - `.ai-agents/tasks/<task-id>/artifacts/qa-return-context-history.json` (cumulative QA return context)
- Check output previews are compacted to reduce token usage and improve iteration speed.

## Provider stability controls
- `AI_AGENTS_PROVIDER_TIMEOUT_MS`: timeout per provider call (default: `300000` ms).
- `AI_AGENTS_PROVIDER_DISCOVERY_TIMEOUT_MS`: timeout for provider model discovery checks (default: `10000` ms).
- `AI_AGENTS_OPENAI_MAX_TOKENS`: optional completion token cap for OpenAI-compatible providers.
- `AI_AGENTS_PROVIDER_INPUT_COST_PER_1K_USD`: optional input-token price used for local estimated cost metrics (default `0`).
- `AI_AGENTS_PROVIDER_OUTPUT_COST_PER_1K_USD`: optional output-token price used for local estimated cost metrics (default `0`).
- `AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES`: extra retries for JSON-format parsing failures in the provider (default: `1`, max: `2`).
- `AI_AGENTS_PROVIDER_MAX_REQUESTS_PER_MINUTE`: local per-process provider call cap (`0` disables; default `0`).
- `AI_AGENTS_PROVIDER_RATE_LIMIT_WINDOW_MS`: local limiter window size in ms (default `60000`, min `200`).
- `AI_AGENTS_PROVIDER_BACKOFF_MAX_RETRIES`: transient-call retries for OpenAI-compatible provider (default: `2`, max: `6`).
- `AI_AGENTS_PROVIDER_BACKOFF_BASE_MS`: exponential backoff base delay in ms (default: `500`).
- `AI_AGENTS_PROVIDER_BACKOFF_MAX_MS`: cap for backoff delay in ms (default: `8000`).
- `AI_AGENTS_PROVIDER_BACKOFF_JITTER_RATIO`: jitter ratio for backoff delay (`0..1`, default: `0.2`).
- `AI_AGENTS_QA_MAX_RETRIES`: max QA fail loops before escalation to human review (default: `3`).
- `AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS`: max quality-gate remediation attempts inside Feature Builder/Bug Fixer (default: `3`, cap: `5`).

LM Studio runtime model controls:
- `AI_AGENTS_LMSTUDIO_BASE_URL`: LM Studio root URL (default `http://127.0.0.1:1234`).
- `AI_AGENTS_LMSTUDIO_API_KEY`: LM Studio API key (default `lm-studio-local`).
- `AI_AGENTS_LMSTUDIO_AUTODISCOVER_MODEL`: `true/false` to enable/disable auto model discovery (default `true`).
- `AI_AGENTS_LMSTUDIO_MODEL`: explicit model override (`auto` keeps autodiscovery behavior).
- `AI_AGENTS_LMSTUDIO_FALLBACK_MODEL`: fallback model id when autodiscovery fails.

JSON parse retry notes:
- Triggered only when provider text cannot be extracted/parsing as JSON.
- Retry instruction is strict: JSON only, no markdown fences, no prose before/after, preserve expected schema.
- Provider writes structured retry logs at `.ai-agents/logs/provider-parse-retries.jsonl`.

Rate limiting/backoff notes:
- Local rate limiting applies before provider calls and waits only when the configured request window is saturated.
- Backoff applies only to transient provider errors (for example `429`, `408`, `5xx`, network timeout/fetch failures).
- Permanent errors do not loop through backoff retries.
- Structured throttle logs are written to `.ai-agents/logs/provider-throttle.jsonl`.
- Stage timing now includes provider-call metrics (`providerAttempts`, `providerBackoffRetries`, `providerBackoffWaitMs`, `providerRateLimitWaitMs`) and estimated token/cost fields (`estimatedInputTokens`, `estimatedOutputTokens`, `estimatedTotalTokens`, `estimatedCostUsd`).

## Performance controls
- `AI_AGENTS_DISABLE_CONFIG_CACHE=1`: disables in-memory cache for resolved global+local config.
- `AI_AGENTS_DISABLE_PROMPT_CACHE=1`: disables in-memory cache for prompt file contents.
- `AI_AGENTS_DISABLE_PROVIDER_CACHE=1`: disables in-memory provider instance reuse.
- `AI_AGENTS_POLL_INTERVAL_MS=<ms>`: engine loop sleep interval when idle (default: `1200`, minimum accepted: `200`).
- `AI_AGENTS_MAX_IMMEDIATE_CYCLES=<n>`: max immediate no-sleep cycles after processing work (default: `3`, max: `20`).

Polling observability:
- Loop decisions are logged to `.ai-agents/logs/polling-metrics.jsonl` with action (`immediate` vs `sleep`), reason, processed stages/tasks, and sleep-avoidance counters.
- Stage queue latency (`request.createdAt` -> stage start) is logged to `.ai-agents/logs/queue-latency.jsonl`.

## Temperature resolution (OpenAI-compatible provider)
Each provider call resolves temperature with this precedence:
1. `AI_AGENTS_TEMPERATURE_<AGENT>_<TASK_TYPE>`
2. `AI_AGENTS_TEMPERATURE_<AGENT>`
3. `AI_AGENTS_TEMPERATURE_<TASK_TYPE>`
4. Internal defaults

Validation rules:
- values must be numeric between `0` and `2`
- invalid env values are ignored (safe fallback is used)
- execution never crashes because of invalid temperature config

Internal agent defaults:
- `Dispatcher`: `0.1`
- `Spec Planner`: `0.1`
- `Bug Investigator`: `0.1`
- `Bug Fixer`: `0.05`
- `Feature Builder`: `0.05`
- `Reviewer`: `0.05`
- `QA Validator`: `0.05`
- `PR Writer`: `0.3`
- `Human Review`: `0.1`

Internal task-type defaults:
- `Feature`: `0.1`
- `Bug`: `0.05`
- `Refactor`: `0.05`
- `Research`: `0.2`
- `Documentation`: `0.3`
- `Mixed`: `0.1`

Agent env examples:
- `AI_AGENTS_TEMPERATURE_DISPATCHER=0.1`
- `AI_AGENTS_TEMPERATURE_SPEC_PLANNER=0.1`
- `AI_AGENTS_TEMPERATURE_BUG_INVESTIGATOR=0.1`
- `AI_AGENTS_TEMPERATURE_BUG_FIXER=0.05`
- `AI_AGENTS_TEMPERATURE_FEATURE_BUILDER=0.05`
- `AI_AGENTS_TEMPERATURE_REVIEWER=0.05`
- `AI_AGENTS_TEMPERATURE_QA_VALIDATOR=0.05`
- `AI_AGENTS_TEMPERATURE_PR_WRITER=0.3`
- `AI_AGENTS_TEMPERATURE_HUMAN_REVIEW=0.1`

Agent + task env examples:
- `AI_AGENTS_TEMPERATURE_DISPATCHER_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_DISPATCHER_BUG=0.1`
- `AI_AGENTS_TEMPERATURE_SPEC_PLANNER_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_SPEC_PLANNER_BUG=0.1`

Task-only env examples:
- `AI_AGENTS_TEMPERATURE_FEATURE=0.1`
- `AI_AGENTS_TEMPERATURE_BUG=0.05`
- `AI_AGENTS_TEMPERATURE_REFACTOR=0.05`
- `AI_AGENTS_TEMPERATURE_RESEARCH=0.2`
- `AI_AGENTS_TEMPERATURE_DOCUMENTATION=0.3`
- `AI_AGENTS_TEMPERATURE_MIXED=0.1`

If a model is slow locally, start by lowering context and setting a timeout:
```bash
export AI_AGENTS_PROVIDER_TIMEOUT_MS=180000
```

## Prompt integrity checks
- `doctor` now verifies that all required prompt files exist, not only the prompt folder.
- Readiness checks used by `start/new/status/approve` also block when required prompt files are missing.
- To recreate missing prompts/config safely: `ai-agents fix --bootstrap`.

## Cross-platform
The CLI uses Node path and home directory resolution, so it is built to run on:
- macOS
- Windows
- future Linux support

No shell-specific path assumptions are required inside the CLI.

## Recovery improvements in this iteration
- stale locks are detected by age and dead PID
- orphan files in `working/` are safely requeued or moved to `failed/`
- interrupted tasks with empty inbox/working can be requeued when safe
- `doctor` can immediately run safe fixes
