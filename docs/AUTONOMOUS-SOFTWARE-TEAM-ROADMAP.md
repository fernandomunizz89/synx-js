# SYNX Autonomous Software Team Roadmap

Assessment date: 2026-03-24

## Executive Summary

SYNX already has a strong execution engine for AI-assisted software work:

- file-driven task orchestration
- a specialized expert squad
- QA retries and human review
- a working web UI
- observability, metrics, webhooks, and CI helpers
- custom agents and custom pipelines
- project memory, research support, and task export

That means SYNX is already a serious multi-agent execution platform.

It is not yet a full autonomous software team from idea to MVP to production.

The biggest gap is not "more agents". The biggest gap is a true project-level control loop:

1. intake and clarification
2. decomposition into tracked subtasks
3. dependency-aware scheduling
4. capability-based agent assignment
5. product/design/architecture validation
6. release and production feedback loops

Today, SYNX is strongest at task execution. Your goal requires SYNX to become strong at project coordination.

## Current State

### What Already Exists

The current system already includes the right foundations for the vision:

- File-based orchestration with durable handoffs in `.ai-agents/tasks/<task-id>/`
- A specialized built-in squad:
  - Dispatcher
  - Project Orchestrator
  - Front, Mobile, Back, SEO
  - QA Engineer
  - DevOps, Security, Docs Writer, DB Architect, Performance Optimizer
  - Code Reviewer
- Automatic QA retry logic with structured return context
- Human approval/reprove flows with rollback support
- Web UI with tasks, review queue, stream, settings, metrics, and task details
- Provider abstraction and per-agent configuration
- Research orchestration and anti-loop safeguards
- Project memory and in-process agent consultation
- Custom agents and custom pipelines
- Task export, webhooks, `synx ci`, metrics, and diagnostics

Local verification on 2026-03-24:

- `npm run check` passed
- `npm test` passed with 126 test files and 822 tests

### What Is Partially Implemented

These are the most important "exists, but not fully closed" areas:

- Project-level decomposition exists as a worker in `src/workers/project-orchestrator.ts`, but it is not fully wired into normal task creation.
- The UI project prompt posts to `/api/project`, but `src/lib/task.ts` still creates new tasks by queuing `00-dispatcher.request.json`, not `00-project-orchestrator.request.json`.
- File locking exists in `src/lib/file-locks.ts`, but it is advisory only. `src/lib/workspace-editor.ts` warns and still proceeds on conflicts.
- The Code Reviewer exists, but the default Front, Back, Mobile, and SEO expert flows currently hand off directly to QA, not to Code Reviewer.
- Security auditing is supported, but only when the Dispatcher explicitly requests it.
- Learnings are strong for pipeline tasks, but not generalized for the standard built-in task flow.

### What Is Missing

These are the capabilities still missing for the "complete software team" outcome:

- Real parent/child task modeling
- Dependency graphs between subtasks
- Capability-based routing for future specialists
- Product/spec/design agents before implementation starts
- Architecture planning that survives across many subtasks
- Program-level state for a project, not only task-level state
- Release orchestration and production feedback loops
- A stable external control plane / agent API
- Unified learning across standard tasks, project tasks, and pipelines

## Important Architecture Gaps

### 1. Project Orchestrator is present, but not truly connected

This is the single most important gap.

Evidence:

- `src/workers/project-orchestrator.ts` exists and creates subtasks
- `/api/project` exists in `src/lib/ui/server.ts`
- `src/lib/task.ts` still creates tasks by enqueueing the Dispatcher directly
- there is no visible code path that enqueues `STAGE_FILE_NAMES.projectOrchestrator` for a project request

Impact:

- the README and Quick Start describe project prompts as if they already decompose into subtasks automatically
- the implementation does not yet make that guarantee reliably

### 2. Routing is still hardcoded to a fixed squad

The system supports custom agents and pipelines, which is great.

But the main autonomous routing layer is still hardcoded:

- the Dispatcher stage map is static
- known agents are named explicitly
- future specialists from other stacks are not first-class routing targets yet

Impact:

- you can add agents
- but SYNX does not yet behave like an extensible specialist organization

### 3. There is no real project graph

The Project Orchestrator can create subtasks, but the model is still task-centric:

- no `parentTaskId`
- no child-task state aggregation
- no dependency model
- no critical path or milestone tracking
- no project completion logic

Impact:

- SYNX can execute tasks
- SYNX cannot yet manage a program of work

### 4. Documentation is ahead of reality in a few places

Examples:

- README and `docs/QUICK-START.md` say the Project Orchestrator breaks prompts into subtasks automatically
- `docs/ROADMAP.md` says file conflict detection is pending, while code already contains an advisory implementation
- the old `Spec Planner` concept still appears in bootstrap/config-related code, but there is no active Spec Planner worker in the runtime
- README test counts are outdated relative to the current codebase

Impact:

- the codebase is stronger than a prototype
- but the product story is harder to trust because docs and runtime are not fully aligned

## Phased Roadmap

### Phase 0 - Align the Architecture Story

Goal:
Make the system truthful before making it larger.

Why this first:
If architecture language and runtime behavior disagree, every later phase becomes slower and riskier.

Deliverables:

- Decide the official project lifecycle:
  - `Project Intake -> Project Orchestrator -> Subtasks -> Execution -> Aggregation -> Final Review`
- Remove or formally restore the legacy `Spec Planner` concept
- Update README and core docs to match actual runtime behavior
- Define one official vocabulary:
  - project
  - epic
  - task
  - subtask
  - stage
  - agent
  - capability

Implementation targets:

- `src/lib/bootstrap.ts`
- `src/lib/task.ts`
- `src/workers/project-orchestrator.ts`
- `README.md`
- `docs/QUICK-START.md`
- `docs/ROADMAP.md`

Exit criteria:

- no core doc claims behavior that the runtime does not actually perform
- no dead routing concept remains in prompts/bootstrap/config

### Phase 1 - Make Project Intake Real

Goal:
Ensure project prompts actually go through a real decomposition stage before execution.

Deliverables:

- When a task has `typeHint: "Project"`, enqueue `00-project-orchestrator.request.json`
- Keep normal tasks on the direct Dispatcher path
- Add `parentTaskId`, `rootProjectId`, and `sourceKind` to task metadata
- Persist Project Orchestrator outputs as first-class artifacts
- Show parent/child relationships in the UI

Key design decisions:

- Project tasks should not be treated like normal feature tasks
- Child tasks should carry enough inherited context from the project
- The parent project should remain open until all child tasks are resolved

Implementation targets:

- `src/lib/task.ts`
- `src/lib/services/task-services.ts`
- `src/workers/project-orchestrator.ts`
- `src/lib/observability/queries.ts`
- `src/lib/ui/server.ts`
- `src/lib/ui/web-app.ts`
- task schemas/types

Exit criteria:

- a prompt sent to `/api/project` always creates a real parent project task
- that parent always creates tracked child tasks
- the UI shows project -> subtask relationships clearly

### Phase 2 - Add a Project Graph and Dependency-Aware Scheduler

Goal:
Move from "many parallel tasks" to "managed execution plan".

Deliverables:

- Subtasks can declare:
  - `dependsOn`
  - `blockedBy`
  - `priority`
  - `milestone`
  - `parallelizable`
- Scheduler executes ready tasks only
- Project progress is aggregated from child-task state
- Conflicting or blocked tasks become explicit in the UI and export data

Why it matters:

Your target system is not just a router. It must coordinate work like a real engineering manager.

Implementation targets:

- task metadata and schema
- scheduler/runtime loop
- observability DTOs
- task export
- project dashboards

Exit criteria:

- SYNX can safely manage multi-step projects where some subtasks must wait for others
- project completion is based on child outcomes, not guesswork

### Phase 3 - Replace Hardcoded Routing with Capability-Based Specialization

Goal:
Keep your current specialized stack agents, but make the system extensible for future stacks and disciplines.

Deliverables:

- Introduce an agent capability registry
- Each agent declares:
  - domain
  - frameworks
  - languages
  - task types
  - risk profile
  - preferred verification modes
- Dispatcher routes by capabilities, not by hardcoded names only
- Custom agents become eligible for autonomous routing, not just manual pipelines

Recommended model:

- Keep built-in agents as defaults
- Let custom agents register capabilities in `.ai-agents/agents/*.json`
- Add a routing score model:
  - capability match
  - project stack match
  - task type match
  - historical approval rate
  - recent failure patterns

Implementation targets:

- `src/workers/dispatcher.ts`
- agent schema/types
- agent registry
- setup/config UI

Exit criteria:

- adding a new specialist does not require editing dispatcher code
- SYNX can support other stacks without architectural branching

### Phase 4 - Add Product, Spec, and Design Agents Before Build

Goal:
Expand from engineering execution to full product delivery.

New roles to add:

- Product Strategist
- Requirements Analyst / PRD Writer
- UX Flow Designer
- Solution Architect
- Delivery Planner

Responsibilities:

- convert user intent into scoped deliverables
- surface assumptions and unknowns early
- define acceptance criteria before implementation
- produce milestone plans for MVP vs later iterations

Why this phase matters:

A real software team does not go from idea straight to coding. It first reduces ambiguity.

Deliverables:

- a pre-build planning loop before implementation starts
- project brief / PRD artifact
- acceptance criteria artifact
- milestone plan artifact
- optional clarification request flow when requirements are underspecified

Exit criteria:

- a vague idea can become a structured build plan before specialist coding starts

### Phase 5 - Strengthen Safety for Parallel Execution

Goal:
Make concurrent execution reliable enough for bigger projects.

Deliverables:

- turn file conflict handling from advisory into enforced scheduling
- reserve files or file scopes before edits
- add merge/rebase strategy for overlapping work
- add ownership boundaries for subtasks
- add escalation rules when parallel work conflicts

Important note:

The current file lock implementation is useful groundwork, but it is not enough for true autonomous parallelism.

Implementation targets:

- `src/lib/file-locks.ts`
- `src/lib/workspace-editor.ts`
- runtime scheduler
- task conflict UI

Exit criteria:

- two agents cannot silently collide on the same file set
- parallelism improves throughput without increasing corruption risk

### Phase 6 - Build the MVP-to-Production Delivery Loop

Goal:
Cover the path from implementation to release and post-release learning.

Deliverables:

- release candidate agent flow
- environment readiness checks
- preview environment creation or deployment packaging
- smoke test and rollback workflow
- production issue intake back into SYNX
- "stabilization mode" after release

Suggested additions:

- Release Manager agent
- Observability / Incident Triage agent
- Customer Feedback Synthesizer

Why this matters:

Your goal includes "from MVP to final product". That requires operational feedback, not only code generation.

Exit criteria:

- SYNX can take a feature from implementation through validation, packaging, release, and post-release follow-up

Implementation notes (2026-03-24):

- Added release delivery workers:
  - `src/workers/experts/synx-release-manager.ts`
  - `src/workers/experts/synx-incident-triage.ts`
  - `src/workers/experts/synx-customer-feedback-synthesizer.ts`
- Added runtime stabilization state:
  - `src/lib/release-state.ts`
- Added release artifacts:
  - `artifacts/release-candidate.json`
  - `artifacts/production-incident-intake.json`
  - `artifacts/customer-feedback-summary.json`
- Updated QA pass routing to feed the release flow:
  - `Synx QA Engineer -> Synx Release Manager -> Synx Customer Feedback Synthesizer -> Human Review`
  - blocked release path:
    `Synx Release Manager -> Synx Incident Triage -> Synx Customer Feedback Synthesizer -> Human Review`

### Phase 7 - Unify Learning Across All Workflows

Goal:
Make the whole system improve over time, not only custom pipelines.

Current limitation:

- learning is strongest for pipeline tasks
- standard built-in tasks and project subtasks do not benefit equally

Deliverables:

- record outcomes for standard tasks, project tasks, and child subtasks
- track agent-level and capability-level quality metrics
- track project-level metrics:
  - decomposition quality
  - rework rate
  - QA return rate
  - human intervention rate
  - delivery lead time
- feed this back into routing and planning

Exit criteria:

- the system gets measurably better at choosing plans, agents, and verification strategies

Implementation notes (2026-03-24):

- Unified learning capture now records outcomes for:
  - standard built-in tasks
  - project-intake tasks
  - project child subtasks
  - pipeline steps
- Learning entries now include workflow and task metadata:
  - `workflow`, `taskType`, `sourceKind`, `project`, `rootProjectId`, `parentTaskId`, `stage`, `capabilities`
- Routing now uses capability-level quality feedback in scoring:
  - `capabilityApprovalRate` signal added to capability routing scores
- Project Orchestrator now consumes its own recent learning history during:
  - pre-build planning prompt
  - decomposition prompt
- Collaboration metrics now expose:
  - agent-level quality metrics
  - capability-level quality metrics
  - project-level quality metrics (`decompositionQuality`, `reworkRate`, `qaReturnRate`, `humanInterventionRate`, `deliveryLeadTimeMs`)

### Phase 8 - Open an External Control Plane

Goal:
Let other agent ecosystems and tools drive SYNX reliably.

This aligns with the existing integration planning docs in `docs/agent-integration/`.

Deliverables:

- stable agent API
- authenticated task creation and review endpoints
- project graph API
- webhook/event contracts
- external observation model

Why later:

An external API becomes much more valuable after the internal project model is stable.

Exit criteria:

- external orchestrators can create projects, observe progress, approve/reprove work, and inspect artifacts safely

## Recommended Build Order

If you want the highest leverage path, build in this order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 5
6. Phase 4
7. Phase 6
8. Phase 7
9. Phase 8

Why this order:

- first make project intake real
- then make project coordination real
- then make specialization extensible
- then make parallelism safe
- then expand into product/design/release territory

## What You Should Preserve

These parts are already good bets and should stay central:

- file-based stage envelopes
- durable audit trail per task
- explicit human approval/reprove step
- specialized expert workers
- QA as a separate accountability layer
- custom agents and pipelines as extension points
- observability-first design

## Suggested North Star

The best long-term shape for SYNX is:

- an autonomous software program manager on top
- a capability-based specialist registry in the middle
- a reliable execution and validation engine underneath

In short:

SYNX should evolve from "multi-agent task executor" into "project-aware autonomous software organization".

That is a realistic path from where the project is today.
