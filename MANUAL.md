# AI Agents V5 - Human-friendly manual

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
ai-agents setup
```

When running in an interactive terminal, `start` also shows a live progress panel:
- spinner heartbeat
- engine uptime
- active/waiting/failed/done counters
- progress bar per active task based on stage

To disable it:
```bash
ai-agents start --no-progress
```

### 3. `new`
Creates a task.

You can use:
```bash
ai-agents new
```

Or:
```bash
ai-agents new "Add dark mode toggle" --type Feature
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
ai-agents status --all
```

## Final human step
When a task reaches `waiting_human`, approve it with:

```bash
ai-agents approve
```

`approve` now lets you select from pending tasks when more than one is waiting.

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
ai-agents start
```

### Create a task
```bash
ai-agents new
```

### Watch progress
```bash
ai-agents status
```

### Check bottlenecks
```bash
ai-agents metrics
```

### Approve final result
```bash
ai-agents approve
```

## New machine or new user
Never assume the environment is already configured.

Recommended first commands:
```bash
npm install
npm run build
npm link
ai-agents setup
ai-agents start
```

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
- QA must validate changed files and executed checks, including E2E checks for main flows when applicable
