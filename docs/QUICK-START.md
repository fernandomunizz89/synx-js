# SYNX – Quick Start Guide

Get from zero to a running pipeline in minutes.

---

## 1. Install

```bash
npm install -g synx
# or run locally with npx
npx synx <command>
```

---

## 2. Setup (once per machine / repo)

```bash
synx setup
```

Interactive wizard — it will ask for:

| Prompt | What to enter |
|---|---|
| Human reviewer name | Your name (required) |
| Provider | `anthropic`, `openai-compatible`, `google`, or `lmstudio` |
| Model | Pick from the list or type manually |
| API key | Only if cloud provider is selected |
| Per-expert providers | Optional — configure different provider/model per expert (Front, Mobile, Back, QA, SEO). Skip to use the Dispatcher provider for all. |

After setup, `.ai-agents/` is created in your repo and global config is saved to `~/.ai-agents/config.json`.

> **Tip:** Run `synx doctor` right after setup to confirm everything is wired correctly.

---

## 3. Start the engine

```bash
synx start
```

Leave this running in a terminal. It polls for tasks, processes them through the agent pipeline, and stops at each human review point.

---

## 4. Send work to the agents

### Option A — Web UI (recommended)

```bash
synx ui
```

Open `http://localhost:4316` in your browser. Type what you want to build in the **prompt bar** at the top and hit **Send**.

SYNX creates a **Project Intake** task, then the **Project Orchestrator** breaks your prompt into independent subtasks and the agent squad picks them up in parallel.

### Option B — CLI (single task)

```bash
synx new
```

Interactive. You'll be asked for title, type, and a description of what you want done.

**Non-interactive (scripted):**

```bash
synx new "Add dark mode toggle" --type Feature --raw "Add a dark mode toggle to the header. Use Tailwind's dark: variant and persist preference in localStorage."
```

**Task types:** `Feature` · `Bug` · `Refactor` · `Research` · `Documentation` · `Mixed`

> Research and Documentation tasks skip E2E questions automatically.

**QA options (optional):**

```bash
synx new "Fix login redirect" --type Bug \
  --e2e required \
  --e2e-framework playwright \
  --qa-objective "Verify redirect goes to /dashboard after login"
```

### Vocabulary (official)

- `project`: high-level prompt sent through `/api/project` (via prompt bar).
- `task`: one executable unit tracked in `.ai-agents/tasks/<task-id>/`.
- `subtask`: a task created by Project Orchestrator during project intake.
- `stage`: one step in the task lifecycle, owned by one agent.
- `agent`: a worker (Dispatcher, Project Orchestrator, experts, QA, Human Review).
- `capability`: skill profile used for routing decisions.

---

## 5. Review and decide

When a task reaches the human review step, `synx start` shows an inline prompt.
You can also act from a second terminal:

### Approve

```bash
synx approve
# or by task id, skipping confirmation
synx approve --task-id task-2026-03-20-abc --yes
```

### Reprove (send back with feedback)

```bash
synx reprove --reason "Missing error handling for network failures"
# roll back file changes as well
synx reprove --reason "Wrong approach" --rollback task
```

---

## All commands

### Core workflow

| Command | What it does |
|---|---|
| `synx setup` | Guided first-time setup (provider, model, reviewer name) |
| `synx start` | Start the engine — processes tasks continuously |
| `synx new [title]` | Create a new task |
| `synx approve` | Approve a task waiting for human review |
| `synx reprove` | Reject and return a task with feedback |
| `synx status` | Show status of current/latest task |
| `synx status --all` | Show all tasks |

### Pipelines (custom multi-step workflows)

| Command | What it does |
|---|---|
| `synx pipeline list` | List all pipeline definitions |
| `synx pipeline show <id>` | Show details of a pipeline |
| `synx pipeline run <id> <input>` | Run a pipeline with the given input |

```bash
synx pipeline run feature-pipeline "Add user avatar upload to the profile page"
synx pipeline run feature-pipeline "Add CSV export" --type Feature
```

### Custom agents

| Command | What it does |
|---|---|
| `synx agent list` | List all registered custom agents |
| `synx agent show <id>` | Show details of a custom agent |
| `synx agent create` | Interactive wizard to create a new agent |

Custom agents can declare capability metadata (domains, frameworks, languages, task types, risk profile, verification modes) so the Dispatcher can route tasks to them automatically.

### Diagnostics & recovery

| Command | What it does |
|---|---|
| `synx doctor` | Preflight checks: config, prompts, provider health, stale locks |
| `synx fix --all` | Run all safe automatic fixes |
| `synx fix --locks` | Clear stale lock files only |
| `synx fix --bootstrap` | Recreate missing config and prompt files |
| `synx fix --working` | Recover orphan working files |
| `synx fix --tasks` | Recover interrupted tasks |
| `synx resume` | Manually recover unfinished work |
| `synx cancel [taskId]` | Cancel an active task |

### Observability

| Command | What it does |
|---|---|
| `synx metrics` | Timing summary — identify slow stages |
| `synx metrics --since 2026-03-01` | Filter by date |
| `synx metrics --json` | Output as JSON (pipe-friendly) |
| `synx show-config` | Show global, local, and resolved config |
| `synx learn` | Approval rate and history for all agents |
| `synx learn <agent-id>` | History for a specific agent |
| `synx learn <agent-id> --limit 20` | Show last N entries |

---

## Common flows

### Something is broken / engine won't start

```bash
synx doctor          # see what's wrong
synx fix --all       # attempt automatic repair
synx start           # try again
```

### Task is stuck / never moves

```bash
synx status          # check current stage
synx fix --locks     # clear stale locks
synx resume          # recover interrupted state
```

### Roll back a task's file changes when reproving

```bash
synx reprove --reason "Wrong approach" --rollback task
```

### Check how well an agent is performing

```bash
synx learn synx-front-expert
```

---

## What's inside `.ai-agents/`

```
.ai-agents/
  config/          project config
  prompts/         system prompts (editable)
  agents/          custom agent definitions
  pipelines/       pipeline definitions
  tasks/           all task data and stage artifacts
  learnings/       per-agent JSONL learning history
  logs/            structured runtime logs
  locks/           in-progress stage locks
```

> **Edit prompts directly** in `.ai-agents/prompts/` to tune agent behaviour without touching code.

---

## Hotkeys during `synx start`

| Key | Action |
|---|---|
| `?` | Help |
| `F1` | Extended help |
| `F2` | New task template |
| `F3` | Pause / resume |
| `F4` | Toggle console / event stream |
| `F10` | Graceful stop |
