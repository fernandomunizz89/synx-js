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
