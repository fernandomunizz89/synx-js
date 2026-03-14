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
  - `Feature Builder`
  - `Reviewer`
  - `QA Validator`
  - `PR Writer`
- The pipeline only advances when each stage output passes schema validation.
- `Feature Builder` now applies real workspace edits (not only text handoff).
- `QA Validator` now validates real evidence using `git diff` and runnable project scripts (`check`, `test`, `lint` when present).
- Stage inputs now include original task input and prior stage output, so each agent works with real upstream context.

## Real code edits and QA evidence
- Builder accepts concrete edit operations (`create`, `replace`, `replace_snippet`, `delete`) and applies them safely inside the workspace root.
- Protected paths are blocked from edits (`.ai-agents/**`, `.git/**`).
- QA records changed files and executed checks in task artifacts:
  - `.ai-agents/tasks/<task-id>/done/04-implementation.done.json`
  - `.ai-agents/tasks/<task-id>/done/06-qa.done.json`

## Provider stability controls
- `AI_AGENTS_PROVIDER_TIMEOUT_MS`: timeout per provider call (default: `300000` ms).
- `AI_AGENTS_OPENAI_MAX_TOKENS`: optional completion token cap for OpenAI-compatible providers.

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
