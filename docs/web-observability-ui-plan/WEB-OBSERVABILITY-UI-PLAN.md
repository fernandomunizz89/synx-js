# Technical Plan: SYNX Web UI for Observability and Human Review

## 1. Executive summary

SYNX already has the right foundation to gain a strong web UI without rewriting the engine:

- the runtime is already file-driven
- each task already persists state, history, handoffs, and artifacts in `.ai-agents/tasks/<task-id>/`
- the engine already writes global metrics in JSONL
- the current TUI already solves terminal operations well, but most of the reusable value is in the data, not in the terminal renderer

The best strategy to achieve your goal while reusing as much as possible from what already exists is:

1. keep the filesystem as the source of truth
2. extract a shared read/query layer for observability
3. extract a single human actions layer (`approve`, `reprove`, `cancel`, and eventually `pause/resume`)
4. create a local web UI consuming a Node API in the same repository
5. start with polling and read-only access, and only later add realtime and operational controls

My concrete recommendation for this project:

- local web backend: `Fastify` inside the repo, reusing `src/lib/*`
- frontend: `React + Vite`, separate from the CLI, consuming the local API
- future command: `synx ui`

This choice is more aligned with the current state of the project than migrating to a larger fullstack framework too early. SYNX today is a Node/CLI runtime with file persistence; the web UI should be a product layer on top of it, not a second competing runtime.

---

## 2. Product objective

Create a pleasant, human-friendly, and operational web UI to track:

- ongoing processes
- progress per task
- the state of each agent
- items pending human review
- estimated token consumption per task, per agent, and per project
- estimated cost, bottlenecks, and QA loops
- engine and provider health

This UI should complement the current TUI, not replace it immediately.

---

## 3. Functional objectives

### 3.1 What the UI needs to deliver

- near real-time engine overview
- a clear queue of tasks in `waiting_human`
- task drill-down with a timeline of stages, involved agents, QA findings, artifacts, and changed files
- aggregated dashboards by task, agent, and project
- strong highlighting for bottlenecks, loops, failures, and consumption
- human actions directly from the web for review cases

### 3.2 What does not need to happen at first

- replace `synx start`
- change storage to a database
- add multi-user authentication
- expose the UI remotely on the internet
- turn the UI into a new source of truth for the runtime

---

## 4. Technical diagnosis of the current state

## 4.1 What already exists and can be reused

| Area | What already exists | Where |
|---|---|---|
| Source of truth per task | `meta.json`, `done/`, `views/`, `artifacts/`, `logs/`, `human/` | `src/lib/task.ts`, `src/workers/base.ts` |
| History per stage | `TaskMeta.history` with `durationMs`, provider, model, parse retries, tokens, and cost | `src/lib/types.ts`, `src/workers/base.ts` |
| Global metrics | stage timing, queue latency, throttle, parse retries, polling metrics | `src/lib/logging/*`, `src/lib/collaboration-metrics.ts` |
| Daemon state | heartbeat, loop, processed stages/tasks, loop action | `src/commands/start.ts`, `src/lib/logging/daemon-logs.ts` |
| Human review | `waiting_human` status, approve/reprove, reproval artifacts | `src/commands/approve.ts`, `src/commands/reprove.ts` |
| Learnings | history per agent with approved/reproved outcome | `src/lib/learnings.ts` |
| Current TUI | counters, active task summary, human queue, inline input | `src/lib/start-progress.ts`, `src/lib/start/task-management.ts` |
| Readiness/health | checks for prompts, reviewer, provider, and model | `src/lib/readiness.ts` |
| Pipeline state | `pipeline-state.json` with compacted steps | `src/lib/pipeline-state.ts` |

## 4.2 Diagnosis conclusion

SYNX already has enough data for a good observability web UI. What is missing is not "instrument everything from scratch"; what is missing is:

- a consistent query layer
- a unified actions layer
- a web API
- some persistence adjustments to close UX and analytics gaps

---

## 5. What from the current TUI is reusable and what is not

## 5.1 Reusable

- `summarizeTaskCounts`
- `pickFocusedTask`
- `resolveHumanTask`
- `stageLabel`
- `progressForMeta`
- `collectReadinessReport`
- `buildCollaborationMetricsReport`
- the entire structure of `TaskMeta`, `TimingEntry`, `LearningEntry`, and `PipelineState`

## 5.2 Partially reusable

- the semantics of TUI states
- the mapping of stages and agents
- the counters and the human focus logic

## 5.3 Not reusable as-is

- the terminal renderer (`boxen`, ANSI, `log-update`)
- the in-memory `uiState` from `start`
- the TUI console/event stream as the official source for the web

In other words: the web should reuse the domain logic, not the TUI components.

---

## 6. Real gaps to reach your objective

## 6.1 Gap 1: there is no query layer for the web

Today the data is spread across:

- `.ai-agents/tasks/*/meta.json`
- `.ai-agents/tasks/*/done/*.done.json`
- `.ai-agents/tasks/*/views/*`
- `.ai-agents/tasks/*/logs/*`
- `.ai-agents/logs/*.jsonl`
- `.ai-agents/runtime/daemon-state.json`
- `.ai-agents/learnings/*.jsonl`

Each command reads this in a different way. The web UI needs a central layer that normalizes these files into stable DTOs.

## 6.2 Gap 2: human action logic is duplicated

Today similar logic exists in:

- `src/commands/approve.ts`
- `src/commands/reprove.ts`
- `src/lib/start/command-handler.ts`

Problem:

- the inline TUI is not in full parity with the CLI
- the inline TUI does not record pipeline learnings
- the inline TUI does not replicate the full rollback behavior
- the future web UI would risk becoming the third implementation

This needs to become a single application layer, for example:

- `createTaskService`
- `approveTaskService`
- `reproveTaskService`
- `cancelTaskService`

CLI, TUI, and web UI must call the same services.

## 6.3 Gap 3: project is still a weak field for analytics

You want metrics per project, but today:

- `synx new` accepts `--project`, but defaults it to an empty string
- the TUI inline `new` creates a task with `project: ""`
- `synx pipeline run` also creates a task with `project: ""`

Without fixing this, the project view will be inconsistent.

### Recommended adjustment

- default `project` to `ResolvedProjectConfig.projectName`
- secondary fallback: repository name
- mark whether the value was explicit or inferred

## 6.4 Gap 4: there is no structured artifact for approval

For reproval, there is already:

- `human/90-final-review.reproved.json`

For approval, today there is basically:

- a change to `meta.status`
- `logTaskEvent("Human approval completed...")`

This is insufficient for richer web auditing.

### Recommended adjustment

Also create:

- `human/90-final-review.approved.json`
- optionally `logs/human-review-decisions.jsonl`

This lets the UI show consistent human history.

## 6.5 Gap 5: TUI realtime is not durable

The TUI uses `uiState.consoleLogLines` and `uiState.eventLogLines` in memory. This works for the terminal, but it is not a reliable base for the web.

Today the web can reconstruct part of the operation from:

- `daemon.log`
- `task events.log`
- `agent-audit.jsonl`
- `stage-metrics.jsonl`

But not all of it.

### Recommended adjustment

Add a more explicit runtime stream, for example:

- `.ai-agents/logs/runtime-events.jsonl`

Useful events:

- `engine.started`
- `engine.paused`
- `engine.resumed`
- `engine.stop_requested`
- `task.created`
- `task.waiting_human`
- `task.approved`
- `task.reproved`
- `view.changed`

## 6.6 Gap 6: aggregated metrics exist, but not yet in a UI format

`buildCollaborationMetricsReport()` already solves the global aggregate very well, but it still lacks:

- breakdown by agent
- breakdown by project
- ranking by task
- time series for charts
- drill-down by stage attempt

Good news: the base data already exists in `TaskMeta.history`, `stage-metrics.jsonl`, `agent-audit`, `queue-latency`, and `learnings`.

## 6.7 Gap 7: there is no task detail DTO

For a truly good task detail screen, the UI will need to join:

- `meta.json`
- `history`
- `done/*.done.json`
- `views/*.md`
- `logs/events.log`
- `logs/timings.jsonl`
- `artifacts/*`
- `human/*`
- `pipeline-state.json` when it exists

Today this does not exist as a consolidated object.

## 6.8 Gap 8: there is no external channel to control the engine

Today `pause/resume` is an in-memory toggle in `start`:

- useful in the TUI
- invisible to any other process

If the web UI needs to control the runtime, an explicit mechanism will be required, for example:

- `.ai-agents/runtime/daemon-control.json`
- or a local API if the UI is coupled to the engine process

## 6.9 Gap 9: the UI must support empty state and partial history

The `.ai-agents/` directory is ignored by Git. That is correct, but it implies:

- the UI must work with zero tasks
- the UI must tolerate missing logs
- the UI must handle missing or incomplete artifacts

---

## 7. Recommended architecture

## 7.1 Primary decision

Implement the web UI in two layers:

### Layer 1: local server inside SYNX itself

Responsibilities:

- read `.ai-agents/**`
- expose REST for queries
- expose SSE for realtime updates
- execute human actions safely
- serve the built frontend

### Layer 2: React frontend

Responsibilities:

- display dashboards and drill-downs
- organize filters, timeline, review queue, and metrics
- poll or consume SSE
- trigger approve/reprove/cancel through the API

## 7.2 Recommended stack

### Backend

- `Fastify`
- Zod for request/response contracts
- `chokidar` only once the realtime phase begins

### Frontend

- `React`
- `Vite`
- `React Router`
- `@tanstack/react-query`
- `Recharts` or `Visx` for visualization
- `Radix UI` or equivalent accessible primitives
- custom visual tokens, without a generic dashboard template

## 7.3 Why this is the best choice for this project

### Better than a Next.js fullstack app right now

Because:

- the project today is a Node CLI, not an SSR app
- the main need is local filesystem access
- you already have a mature Node TypeScript base to reuse
- the UI is operational and local-first, not a public SaaS right now

### Better than reading files directly in the browser

Because:

- the browser should not know local paths directly
- you will need normalization and aggregation
- human actions require a backend
- this preserves room to evolve into a remote mode in the future

---

## 8. Proposed target architecture

```text
Browser
  |
  | HTTP + SSE
  v
synx ui server
  |
  +-- Application services
  |     - create/approve/reprove/cancel
  |     - runtime controls
  |
  +-- Observability query layer
  |     - tasks
  |     - task detail
  |     - agents
  |     - projects
  |     - metrics
  |     - runtime overview
  |
  +-- Existing filesystem source of truth
        - .ai-agents/tasks/**
        - .ai-agents/logs/**
        - .ai-agents/runtime/**
        - .ai-agents/learnings/**
```

---

## 9. Suggested code structure

```text
src/
  app/
    tasks/
      create-task.ts
      approve-task.ts
      reprove-task.ts
      cancel-task.ts
    runtime/
      pause-engine.ts
      resume-engine.ts
      stop-engine.ts
  observability/
    types.ts
    queries.ts
    task-overview.ts
    task-detail.ts
    metrics.ts
    runtime.ts
    agents.ts
    projects.ts
    watches.ts
  server/
    index.ts
    routes/
      runtime.ts
      tasks.ts
      agents.ts
      projects.ts
      metrics.ts
      review.ts
    sse.ts
apps/
  web/
    package.json
    src/
      app/
      pages/
      components/
      sections/
      lib/api/
      lib/formatters/
      styles/
```

### Important note

I do not recommend turning the whole repo into a monorepo in this first step. An `apps/web` with its own `package.json` already solves the problem, preserves the CLI, and reduces risk.

---

## 10. Data model for the UI

## 10.1 Main entities

### RuntimeOverview

Fields:

- engine status
- last heartbeat
- current loop
- active task count
- processed stages last loop
- total processed stages/tasks
- poll interval
- concurrency
- readiness summary
- provider health summary

### TaskListItem

Fields:

- `taskId`
- `title`
- `type`
- `project`
- `status`
- `currentStage`
- `currentAgent`
- `nextAgent`
- `humanApprovalRequired`
- `createdAt`
- `updatedAt`
- `progressRatio`
- `historyCount`
- `estimatedTokensTotal`
- `estimatedCostUsd`
- `qaAttempts`
- `lastFailureSummary`

### TaskDetail

Fields:

- `meta`
- `history`
- `stageExecutions`
- `views`
- `doneOutputsSummary`
- `events`
- `timings`
- `artifacts`
- `humanReview`
- `qaReturnHistory`
- `pipelineState`
- `tokenSummary`
- `costSummary`
- `filesChanged`
- `reviewFocus`
- `manualValidationNeeded`

### AgentSummary

Fields:

- `agent`
- `agentType` (`built_in` | `custom`)
- `stagesExecuted`
- `successCount`
- `failureCount`
- `waitingHumanCount`
- `avgDurationMs`
- `estimatedTokens`
- `estimatedCostUsd`
- `approvalRate`
- `reproveRate`
- `qaReturnRate`
- `recentTasks`

### Modeling note

The UI should not assume only the current Expert Squad. The project already has the concept of `GenericAgent` and customizable pipelines; therefore, the observability layer should treat agent as a dynamic entity coming from:

- `TaskMeta.history`
- `agent-audit`
- `pipeline-state`
- the custom agent registry when it exists

### ProjectSummary

Fields:

- `project`
- `taskCount`
- `activeCount`
- `waitingHumanCount`
- `failedCount`
- `doneCount`
- `estimatedTokens`
- `estimatedCostUsd`
- `avgCycleTimeMs`
- `topAgents`
- `topBottlenecks`

---

## 11. How each metric can be calculated using what already exists

## 11.1 Per task

Main source:

- `TaskMeta.history`

Calculations:

- tokens per task = sum of `estimatedInputTokens`, `estimatedOutputTokens`, and `estimatedTotalTokens`
- cost per task = sum of `estimatedCostUsd`
- duration per task = `max(history.endedAt) - min(history.startedAt)`
- retries per task = sum of `parseRetries`, `providerBackoffRetries`, and inferred loops

## 11.2 Per agent

Sources:

- `TaskMeta.history`
- `agent-audit/*.jsonl`
- `learnings/*.jsonl`

Calculations:

- throughput per agent = count of history items by `agent`
- average time = average of `durationMs`
- tokens = sum of token fields in history
- quality = combine learnings + final outcomes attributed to the last stage before human review

### Important note

Agent approval rate becomes much more reliable after human approval starts generating a structured artifact, just like reproval already does today.

## 11.3 Per project

Sources:

- `meta.project`
- `config.projectName` fallback

Calculations:

- aggregate tasks by project
- sum tokens/cost/history
- derive average cycle time
- derive the most frequent bottlenecks

### Important note

Without fixing how `project` is populated, this layer will remain incomplete.

## 11.4 Human review queue

Sources:

- `meta.humanApprovalRequired`
- `meta.status === "waiting_human"`
- `human/90-final-review.reproved.json`
- future `human/90-final-review.approved.json`
- latest `done/06-synx-qa-engineer.done.json`

This already makes it possible to build a rich queue with:

- task
- QA summary
- findings
- previous agent
- latest change
- approve/reprove actions

---

## 12. UI information and UX

## 12.1 UX principles

- a human should understand the state in seconds
- the queue requiring human action should always stay visible
- task detail should privilege timeline and decision context, not raw JSON
- metrics should answer operational questions, not just "look nice"
- the design should not be a skin of the TUI; it should be a clear operational interface

## 12.2 Recommended visual direction

- primary typography: `IBM Plex Sans` or `Manrope`
- technical typography: `IBM Plex Mono` or `JetBrains Mono`
- light theme by default
- background with soft contrast, not flat pure white
- operational palette:
  - deep teal / teal for processing
  - green for success
  - amber for human attention
  - coral/red for failure
  - warm neutrals for long reading

## 12.3 Recommended pages

### 1. Overview

Objective:

- answer "what is happening now?"

Blocks:

- hero with engine status
- KPI cards
- "Waiting for you" section
- swimlane of active tasks
- live event stream
- token consumption chart over the last hours/days

### 2. Review Queue

Objective:

- answer "what do I need to act on right now?"

Blocks:

- list of tasks in `waiting_human`
- QA summary
- findings
- affected files
- `Approve` button
- `Reprove` button
- reproval reason
- rollback option when available

### 3. Tasks

Objective:

- answer "what does the entire work backlog look like?"

Blocks:

- table/board with filters by status, agent, project, and type
- search by `taskId` and title
- columns for tokens, cost, duration, loops, and last update

### 4. Task Detail

Objective:

- answer "what happened in this task and why?"

Blocks:

- header with status, project, type, times, and costs
- stage timeline
- agent handoffs
- QA findings
- changed files
- artifacts and views
- human review history
- event log

### 5. Agents

Objective:

- answer "which agents are performing well and which ones are bottlenecking?"

Blocks:

- throughput
- average time
- consumed tokens
- approval rate
- QA return rate
- latest tasks per agent

### 6. Projects

Objective:

- answer "which project is consuming the most and where are the bottlenecks?"

Blocks:

- cards per project
- task volume
- cost/token
- average cycle time
- bottlenecks by stage

### 7. Metrics

Objective:

- answer "where is the system spending time and tokens?"

Blocks:

- stage timing
- tokens by agent
- cost by project
- queue latency
- throttle/backoff
- parse retries

---

## 13. Recommended minimum API

## 13.1 Runtime

- `GET /api/runtime/overview`
- `GET /api/runtime/readiness`
- `GET /api/runtime/events`

## 13.2 Tasks

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/events`
- `GET /api/tasks/:taskId/artifacts`
- `GET /api/tasks/:taskId/views`

## 13.3 Human review

- `POST /api/tasks/:taskId/approve`
- `POST /api/tasks/:taskId/reprove`
- `POST /api/tasks/:taskId/cancel`

## 13.4 Analytics

- `GET /api/metrics/overview`
- `GET /api/metrics/tasks`
- `GET /api/metrics/agents`
- `GET /api/metrics/projects`
- `GET /api/metrics/timeline`

## 13.5 Streaming

- `GET /api/stream`

Suggested SSE events:

- `runtime.updated`
- `task.updated`
- `task.review_required`
- `task.decision_recorded`
- `metrics.updated`

---

## 14. Implementation strategy by phases

## Phase 0 - Foundation and domain alignment

### Objective

Create the right foundation so CLI, TUI, and web UI use the same logic.

### Deliverables

- services layer for `new`, `approve`, `reprove`, and `cancel`
- structured approval artifact
- `project` normalization
- first version of the `observability/*` layer
- shared DTOs

### Recommended changes

- extract code from `src/commands/approve.ts`
- extract code from `src/commands/reprove.ts`
- replace duplicated logic in `src/lib/start/command-handler.ts`
- standardize human decision recording
- create reusable task and metrics aggregators

### Acceptance criteria

- CLI and TUI produce the same side effects
- pipeline learnings are recorded regardless of the channel used
- a task created by CLI, pipeline, or inline mode has a consistent project

## Phase 1 - Read-only API and initial dashboard

### Objective

Deliver the first web UI without high operational risk.

### Deliverables

- local server with read-only routes
- Overview page
- Tasks page
- Task Detail page
- read-only Review Queue page
- simple polling every 2-5s

### Important decision

At this stage, I recommend avoiding engine control through the web. The focus is observability.

### Acceptance criteria

- a human can quickly know:
  - whether the engine is alive
  - how many tasks are active
  - which tasks are waiting for review
  - how much each task has already consumed

## Phase 2 - Human actions on the web

### Objective

Allow full human review through the browser.

### Deliverables

- approve through the API
- reprove through the API
- cancel through the API
- input for reproval reason
- task rollback when applicable
- auditable persistence of the human decision

### Acceptance criteria

- any action performed on the web generates exactly the same effects as the CLI
- logs, artifacts, and learnings remain consistent

## Phase 3 - Realtime and operational command center

### Objective

Make it feel like a live system, not a static dashboard.

### Deliverables

- file watching
- SSE
- visual event stream
- selective live refresh per task
- strong signaling when transitioning to `waiting_human`

### Optional in this phase

- engine controls:
  - pause
  - resume
  - graceful stop

### Recommendation

For engine control, use a control file or an explicit channel. Do not depend on in-memory flags inside the process.

## Phase 4 - Advanced analytics by task, agent, and project

### Objective

Directly attack your request for metrics per task, agent, and project.

### Deliverables

- ranking of tasks by consumption
- ranking of agents by consumption
- ranking of projects by consumption
- cost/token curves
- bottleneck metrics
- QA loop metrics
- approval and reproval rate by agent

### Acceptance criteria

- a human can answer "who consumes the most?", "where are we getting stuck?", and "which tasks are too expensive?"

## Phase 5 - Hardening, UX polish, and packaging

### Objective

Turn the UI into a reliable surface for daily operation.

### Deliverables

- API tests
- tests for critical components
- review queue e2e
- empty states, loaders, and error states
- accessibility
- responsiveness
- `synx ui` command
- operating docs

### Acceptance criteria

- the UI can be used daily without depending on the TUI for basic context

---

## 15. Objective checklist of what is missing

## 15.1 Backend / domain

- extract shared services for task actions
- create a shared observability layer
- standardize the approval artifact
- standardize human decision logging
- normalize `project`
- create aggregators by agent and project
- create a consolidated task detail endpoint

## 15.2 Runtime / observability

- persist operational events beyond current logs
- introduce a realtime channel
- model external engine control, if desired

## 15.3 Frontend

- overview layout
- review queue
- task list with filters
- task detail
- dashboards by agent and project
- token/cost/duration charts

## 15.4 Quality

- unit tests for the `observability` layer
- API contract tests
- parity tests between CLI/TUI/Web actions
- e2e tests for approve/reprove

---

## 16. Risks and mitigation

## 16.1 Risk: divergence between action channels

### Mitigation

Centralize everything into shared services.

## 16.2 Risk: high cost of scanning thousands of files

### Mitigation

- start with simple scanning
- if needed, create materialized snapshots under `.ai-agents/runtime/index/`

## 16.3 Risk: inconsistent history because of missing `project`

### Mitigation

- fix task creation before the advanced analytics phase

## 16.4 Risk: exposing sensitive data in artifacts

### Mitigation

- local-only bind on `127.0.0.1`
- sanitize API payloads when necessary
- never expose configs with API keys

## 16.5 Risk: the web UI trying to become a new runtime

### Mitigation

- keep the filesystem and the current daemon as the source of truth
- the UI only observes and triggers explicit services

---

## 17. Recommended MVP definition

I recommend considering the real MVP to be:

- local read-only server
- Overview
- Tasks
- Task Detail
- Review Queue
- metrics by task
- metrics by agent
- metrics by project
- approve/reprove on the web using shared services

If that is ready, you will already have an interface that is much more human-friendly than the TUI for human follow-up.

---

## 18. Recommended execution order

1. fix the domain foundation and unify actions
2. create the query layer
3. create the read-only API
4. bring up the initial frontend
5. add review actions
6. add realtime
7. expand analytics

This order minimizes rework and avoids building a pretty UI on top of fragile contracts.

---

## 19. Final recommended decision

If I were implementing this next, I would do it like this:

- **first**: stabilize shared contracts and services
- **then**: create `synx ui` with a local backend + React frontend
- **then**: enable human review through the web
- **finally**: make realtime and analytics more sophisticated

The most important point in the plan is not the frontend framework. The most important point is avoiding a future where CLI, TUI, and web UI each carry different business rules. If that unification happens first, the rest of the roadmap becomes much safer and truly reuses what the project has already built.
