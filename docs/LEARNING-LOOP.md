# SYNX – Agent Learning Loop

## Overview

The learning loop gives Synx agents a memory of their past performance across
standard tasks, project workflows, and pipelines.
After every human decision (`approve` or `reprove`), Synx records what the agent
produced and what the outcome was. Before the next task, that history is injected
back into the agent's system prompt so it can build on successes and address failures.

The cycle is:

```
Execute → Human reviews → Record outcome → Inject into next prompt → Execute (improved)
```

---

## How it works end-to-end

### 1. Execution

When Synx runs a task workflow, learning is used in two ways:

1. Pipeline steps (`synx pipeline run <pipeline-id>`) load recent learnings for
   the current step agent before each model call.
2. Project planning (`Project Orchestrator`) loads recent orchestrator learnings
   before generating planning and decomposition outputs.

For pipeline steps, before calling the LLM it:

1. Loads the **5 most recent** learning entries for that agent from disk.
2. Formats them into a markdown *"Your recent performance"* section.
3. Appends that section to the agent's system prompt.

The agent receives full context about its own track record and can adjust accordingly.

### 2. Recording on approval (`synx approve`)

When you approve a task, Synx records outcomes:

- **Pipeline tasks:** one `LearningEntry` per completed step.
- **Standard/project tasks:** one `LearningEntry` per completed non-human stage
  since the previous human decision.

```
Pipeline: analyst → builder → qa-engineer
             ↓           ↓           ↓
         approved    approved    approved   ← one entry written per agent
```

### 3. Recording on reproval (`synx reprove`)

When you reprove a task, Synx records outcomes:

- **Pipeline tasks:** one entry for the last completed pipeline step.
- **Standard/project tasks:** one entry for the last completed non-human stage
  since the previous human decision.

```
Pipeline: analyst → builder → qa-engineer
                                   ↓
                               reproved   ← one entry, with your reason
```

Earlier steps are not penalised; only the step whose output caused the rejection receives the feedback entry.

### 4. Prompt injection format

The section appended to the system prompt looks like this:

```
---

## Your recent performance (last 5 tasks)

1. [2026-03-18] ✅ Approved — Task: task-2026-03-18-abc
   Output: "Analyzed requirements and identified 3 gaps"

2. [2026-03-20] ❌ Reproved — Task: task-2026-03-20-xyz
   Output: "Implemented login form"
   Feedback: "Missing input validation for the email field"

3. [2026-03-21] ✅ Approved — Task: task-2026-03-21-def
   Output: "Added email validation with Zod schema"

Use this history: build on what was approved; address feedback from reproved tasks directly.
```

---

## Storage

Learnings are stored as **append-only JSONL** files — one per agent — under the
project's `.ai-agents/` directory:

```
.ai-agents/
  learnings/
    analyst.jsonl
    synx-front-expert.jsonl
    synx-back-expert.jsonl
    synx-qa-engineer.jsonl
    ...
```

Agent names are normalised to safe filenames: `"Synx Front Expert"` → `synx-front-expert`.

Each line in a `.jsonl` file is a single JSON object (`LearningEntry`):

| Field | Type | Description |
|---|---|---|
| `timestamp` | `string` | ISO-8601 datetime of when the outcome was recorded |
| `taskId` | `string` | Task that generated this entry |
| `agentId` | `string` | Agent that ran the step |
| `summary` | `string` | What the agent produced (from `output.summary`) |
| `outcome` | `"approved" \| "reproved"` | Human decision |
| `workflow` | `"pipeline" \| "standalone" \| "project-intake" \| "project-subtask"` | Workflow source |
| `taskType` | `TaskType?` | Task type associated with the outcome |
| `sourceKind` | `TaskSourceKind?` | Source classification (`standalone`, `project-intake`, `project-subtask`) |
| `project` | `string?` | Project name |
| `rootProjectId` | `string?` | Root project task identifier |
| `parentTaskId` | `string?` | Parent task identifier for subtasks |
| `stage` | `string?` | Stage where the recorded outcome came from |
| `capabilities` | `string[]?` | Capability tags attributed to the agent/stage |
| `reproveReason` | `string?` | Human's feedback — present on reproved entries only |
| `pipelineId` | `string?` | Pipeline definition that was used |
| `stepIndex` | `number?` | Position of this step within the pipeline |
| `provider` | `string?` | LLM provider used for this step |
| `model` | `string?` | Model used for this step |

### Example entry (approved)

```json
{
  "timestamp": "2026-03-20T14:32:00.000Z",
  "taskId": "task-2026-03-20-abc",
  "agentId": "analyst",
  "summary": "Analyzed requirements and identified 3 gaps",
  "outcome": "approved",
  "pipelineId": "my-pipeline",
  "stepIndex": 0,
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

### Example entry (reproved)

```json
{
  "timestamp": "2026-03-21T09:10:00.000Z",
  "taskId": "task-2026-03-21-xyz",
  "agentId": "synx-front-expert",
  "summary": "Implemented login form with email and password fields",
  "outcome": "reproved",
  "reproveReason": "Missing input validation for the email field",
  "pipelineId": "feature-pipeline",
  "stepIndex": 1,
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

---

## `synx learn` command

Inspect recorded learnings from the CLI.

```bash
# Show stats and recent history for all agents
synx learn

# Show stats and recent history for a specific agent
synx learn analyst

# Show last 20 entries instead of the default 10
synx learn synx-front-expert --limit 20
```

### Output example

```
────────────────────────────────────────────────────────────
Agent: analyst
  Total runs : 12
  Approved   : 10
  Reproved   : 2
  Approval % : 83%
  Last run   : 2026-03-21

  Last 5 entries:
    ✅ [2026-03-18] task-2026-03-18-abc — Analyzed requirements and identified 3 gaps
    ✅ [2026-03-19] task-2026-03-19-def — Mapped API surface for the auth module
    ❌ [2026-03-20] task-2026-03-20-xyz — Outlined implementation plan
       Feedback: Plan did not account for existing rate-limit middleware
    ✅ [2026-03-20] task-2026-03-20-qrs — Updated plan with rate-limit handling
    ✅ [2026-03-21] task-2026-03-21-tuv — Delivered final analysis with risk matrix
────────────────────────────────────────────────────────────
```

### Options

| Flag | Default | Description |
|---|---|---|
| `[agent-id]` | *(all)* | Limit output to a specific agent |
| `--limit <n>` | `10` | Number of recent entries to display per agent |

---

## Scope

Learning recording applies to:

- pipeline tasks
- standard built-in task workflows
- project-intake tasks and project subtasks

Prompt-side injection currently runs in:

- pipeline step execution
- Project Orchestrator planning/decomposition prompts

---

## Design decisions

**Why append-only JSONL?**
No data is ever overwritten or deleted. Entries accumulate indefinitely, giving
you a full audit trail. The file format is human-readable and trivially diffable
in git if you choose to commit the learnings directory.

**Why only the last step on reproval?**
Earlier steps produced outputs that were accepted (the pipeline continued past
them). Penalising them for a rejection that happened downstream would be unfair
and confusing. Only the agent whose output directly caused the rejection receives
the feedback.

**Why 5 entries by default?**
A short window keeps the injected section small (token-efficient) while still
covering enough history to show patterns. The `loadRecentLearnings` function
accepts a `limit` argument if you want to tune this in custom integrations.

**Why not vector search / embeddings?**
The current implementation deliberately keeps the feedback loop simple and
transparent. Plain text entries are readable by humans, require no additional
infrastructure, and work with any LLM provider. Vector similarity search can be
added as a future enhancement without breaking the existing storage format.
