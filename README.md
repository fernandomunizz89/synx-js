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
ai-agents new "Fix timer import/export + Cypress failures" --type Bug --e2e required --e2e-framework cypress --qa-objective "Fazer os testes E2E do Cypress passarem."
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

This works well with:
- OpenAI-compatible APIs
- LM Studio local server
- OpenRouter-compatible gateways
- future compatible endpoints

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
- For `Feature`, `Bug`, `Refactor`, and `Mixed`, main-flow E2E validation is required by QA.
- If E2E infrastructure is missing, implementation agents are instructed to add an E2E script/test path as part of remediation.
- `QA Validator` validates real evidence using `git diff` and runnable project scripts (`check`, `test`, `lint`, and common `e2e` script names when present).
- On QA failure, the task is automatically sent back to the correct implementation agent (`Bug Fixer` for bug tasks, `Feature Builder` for others).
- QA failure handoff now includes structured `expectedResult` vs `receivedResult` items with evidence and recommended actions.
- Root-cause-first policy: E2E failures must prioritize application-code fixes; tests are treated as diagnostics and are only changed when evidence shows test defects.
- QA return context is cumulative across retries and is passed forward again on each new remediation loop.
- QA now records explicit test cases (`expectedResult` vs `actualResult`) to mirror real QA workflows.
- QA now enriches failed checks (especially Cypress/E2E) with compact diagnostics, artifacts, and runtime QA config notes.
- QA Cypress selector preflight now ignores scaffold specs like `example.cy.*` when real task specs are present, reducing irrelevant loop-backs.
- QA verdicts are now evidence-backed: if checks pass and no hard failures exist, unsupported model-only failures are discarded.
- Cypress QA runs use low-noise runtime overrides (e.g., reduced screenshot/video noise) to prioritize actionable failure context.
- QA honors human per-task E2E preferences (policy/framework/objective) and validates against that target.
- On repeated QA loops, implementation agents are instructed to change strategy instead of repeating the same failed plan.
- QA retry loop is capped. After the retry limit is reached, the task is escalated to `waiting_human`.
- Stage inputs now include original task input and prior stage output, so each agent works with real upstream context.
- `Bug Fixer` and `Feature Builder` now auto-recover malformed `replace_snippet` model outputs to avoid hard pipeline failures.
- Cypress config recovery now auto-generates `cypress.config.cjs`, rewires scripts to use it, and keeps `cypress.config.ts` lint-safe.
- When QA reports timer-not-advancing evidence, deterministic remediations can patch both `e2e/timer.cy.ts` and `src/hooks/useTimer.ts`.

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
- `AI_AGENTS_OPENAI_MAX_TOKENS`: optional completion token cap for OpenAI-compatible providers.
- `AI_AGENTS_QA_MAX_RETRIES`: max QA fail loops before escalation to human review (default: `3`).

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
