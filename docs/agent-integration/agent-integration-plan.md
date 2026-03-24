# Plan: OpenClaw + NVIDIA NeMoClaw Agent Integration

## Deliverable

**Output:** `docs/agent-integration.md` — a full architecture and integration reference document.
No code is written as part of this plan. The document covers system design, API contracts, skill format, and integration guides for both frameworks so the team can implement or hand off to another engineer.

## Context

synx-js is a file-based AI coding orchestrator. External agentic frameworks — OpenClaw (a local AI assistant platform) and NVIDIA NeMo Agent (function-calling LLM framework) — need to drive synx as a controlled backend: creating tasks, monitoring their progress through the pipeline, and approving or reproving outputs.

The current `/api/*` routes were designed for the web UI, not for machine clients. They return flat data without agent-friendly metadata like polling hints, action-required flags, or structured observations. NeMo requires an OpenAI-compatible tool schema to discover capabilities. OpenClaw works via **SKILL.md** files — natural language markdown guides that teach its AI agent how to use an external system via HTTP/CLI.

**Intended outcome:** A dedicated `/api/v1/agent/` namespace with rich observation responses + a NeMo action server at `/api/v1/nemo/` + a `skills/synx/SKILL.md` file ready to drop into an OpenClaw installation + UI hardening for computer-use browser control.

---

## Critical Files

| File                                | Role                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/ui/server.ts`              | Mount point — add prefix guard + import                                                     |
| `src/lib/ui/web-app.ts`             | UI hardening — data-testid, ARIA, meta tags                                                 |
| `src/lib/schema.ts`                 | Append 3 new Zod schemas                                                                    |
| `src/lib/services/task-services.ts` | Reuse: `createTaskService`, `approveTaskService`, `reproveTaskService`, `cancelTaskService` |
| `src/lib/observability/dto.ts`      | Reuse: `TaskDetailDto` shape — source of truth for observation builder                      |
| `src/lib/observability/queries.ts`  | Reuse: `getTaskDetail`, `listTaskSummaries`, `getReviewQueue`, `getOverview`                |

---

## New Files

```
src/lib/agent-api/observation.ts        — pure observation builder
src/lib/agent-api/tool-definitions.ts  — OpenAI tool array + OpenAPI 3.0 spec
src/lib/agent-api/nemo-adapter.ts      — NeMo action dispatch + Colang sample generator
src/lib/ui/agent-api.ts                — all /api/v1/* route handlers
skills/synx/SKILL.md                   — OpenClaw skill guide
```

---

## Step 1 — Schema additions (`src/lib/schema.ts`, append-only)

```typescript
// 1. Agent task creation input
export const agentTaskInputSchema = z.object({
  title: z.string().min(1),
  rawRequest: z.string().min(1),
  typeHint: taskTypeSchema.optional().default('Feature'),
  project: z.string().optional(),
  relatedFiles: z.array(z.string()).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
  e2ePolicy: e2ePolicySchema.optional().default('auto'),
});

// 2. Standardized agent observation envelope
export const observationResponseSchema = z.object({
  ok: z.boolean(),
  observation: z.object({
    taskId: z.string().optional(),
    status: taskStatusSchema.optional(),
    currentAgent: z.string().optional(),
    needsAction: z.boolean(),
    actionRequired: z
      .enum(['approve_or_reprove', 'provide_input'])
      .nullable()
      .optional(),
    output: z.unknown().optional(),
    history: z.array(taskMetaHistoryItemSchema).optional(),
    nextPollMs: z.number().int().nonnegative(),
    message: z.string(),
  }),
});

// 3. NeMo action request body
export const nemoActionInputSchema = z.object({
  parameters: z.record(z.unknown()).optional().default({}),
});
```

---

## Step 2 — Observation builder (`src/lib/agent-api/observation.ts`)

Pure functions — no I/O. Receives a `TaskDetailDto | null` from the caller.

```typescript
// Polling hint by status
deriveNextPollMs(status): number
//  new → 5000 | in_progress → 3000 | waiting_agent → 4000
//  waiting_human → 10000 | blocked → 15000 | done/failed/archived → 60000

// Action flags
deriveNeedsAction(detail): { needsAction: boolean; actionRequired: "approve_or_reprove" | null }
//  true when status === "waiting_human" OR humanApprovalRequired === true

// Main builder
buildObservation(detail: TaskDetailDto | null, taskId?: string): ObservationResponse
//  observation.output = detail.doneArtifacts last entry (no extra I/O)
//  observation.history = detail.history
//  null input → { ok: true, observation: { needsAction: false, nextPollMs: 10000, message: "Task not found" } }
```

---

## Step 3 — Tool definitions (`src/lib/agent-api/tool-definitions.ts`)

```typescript
// Returns OpenAI function-calling tool array (used by NeMo + /api/v1/agent/tools)
getToolDefinitions(): OpenAITool[]

// Returns OpenAPI 3.0 spec object (baseUrl injected from live server address)
getOpenApiSpec(baseUrl: string): object
```

**7 tools defined:**

| Tool name                  | Maps to                                |
| -------------------------- | -------------------------------------- |
| `synx_create_task`         | POST /api/v1/agent/tasks               |
| `synx_get_task`            | GET /api/v1/agent/tasks/:id            |
| `synx_list_tasks`          | GET /api/v1/agent/tasks                |
| `synx_approve_task`        | POST /api/v1/agent/tasks/:id/approve   |
| `synx_reprove_task`        | POST /api/v1/agent/tasks/:id/reprove   |
| `synx_list_pending_review` | GET /api/v1/agent/tasks/pending-review |
| `synx_get_system_status`   | GET /api/v1/agent/status               |

---

## Step 4 — NeMo adapter (`src/lib/agent-api/nemo-adapter.ts`)

```typescript
// Lists all available actions with param descriptors (for GET /api/v1/nemo/actions)
listNemoActions(): NemoActionDescriptor[]

// Dispatches to the right service function; returns NeMo-shaped response
dispatchNemoAction(
  actionName: string,
  parameters: Record<string, unknown>,
  options: { enableMutations: boolean }
): Promise<{ output_data: Record<string, unknown> }>

// Generates a downloadable Colang .co file for NeMo Guardrails operators
generateColangSample(baseUrl: string): string
```

**Action → service mapping:**

| NeMo action                | Service / query function                 |
| -------------------------- | ---------------------------------------- |
| `synx_create_task`         | `createTaskService()` — mutation         |
| `synx_get_task`            | `getTaskDetail()` + `buildObservation()` |
| `synx_list_tasks`          | `listTaskSummaries()`                    |
| `synx_approve_task`        | `approveTaskService()` — mutation        |
| `synx_reprove_task`        | `reproveTaskService()` — mutation        |
| `synx_list_pending_review` | `getReviewQueue()`                       |
| `synx_get_status`          | `getOverview()`                          |

Mutations check `enableMutations`; return `{ output_data: { ok: false, error: "Mutations disabled." } }` if false.

**Colang sample format** (served at `GET /api/v1/nemo/actions/colang-sample`):

```colang
define action synx_create_task
  http_request:
    url: "http://localhost:4317/api/v1/nemo/actions/synx_create_task"
    method: POST
    headers:
      Content-Type: "application/json"
    body: $action_params
```

One block per action, all 7 actions included.

---

## Step 5 — Agent route handler (`src/lib/ui/agent-api.ts`)

```typescript
export interface AgentApiHandlerOptions {
  enableMutations: boolean;
  bearerToken?: string; // from env SYNX_AGENT_TOKEN; optional
}

// Returns true if request was handled, false if path didn't match
export async function handleAgentApiRequest(
  req,
  res,
  pathname,
  method,
  options: AgentApiHandlerOptions,
): Promise<boolean>;
```

**Bearer token check** (internal): uses `node:crypto` `timingSafeEqual`. Skipped if `bearerToken` is undefined. Returns 401 with `WWW-Authenticate: Bearer realm="synx"` on failure.

### Agent routes (`/api/v1/agent/`)

| Method | Path                                 | Notes                                                                                           |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/agent/tasks`                | Validate with `agentTaskInputSchema`, call `createTaskService()`, return observation. HTTP 201. |
| GET    | `/api/v1/agent/tasks`                | `listTaskSummaries()`, optional `?status=`, `?project=`, `?q=`.                                 |
| GET    | `/api/v1/agent/tasks/pending-review` | **Matched before `:id` regex.** Calls `getReviewQueue()`.                                       |
| GET    | `/api/v1/agent/tasks/:id`            | `getTaskDetail(id)` + `buildObservation()`. 404 if null.                                        |
| POST   | `/api/v1/agent/tasks/:id/approve`    | Mutation guard. `approveTaskService()`, return observation.                                     |
| POST   | `/api/v1/agent/tasks/:id/reprove`    | Mutation guard. Requires `reason`. `reproveTaskService()`, return observation.                  |
| GET    | `/api/v1/agent/tools`                | `getToolDefinitions()`                                                                          |
| GET    | `/api/v1/agent/openapi.json`         | `getOpenApiSpec(baseUrl)`                                                                       |
| GET    | `/api/v1/agent/status`               | `getOverview()` in observation envelope.                                                        |

### NeMo routes (`/api/v1/nemo/`)

| Method | Path                                 | Notes                                                       |
| ------ | ------------------------------------ | ----------------------------------------------------------- |
| GET    | `/api/v1/nemo/actions`               | `listNemoActions()`                                         |
| POST   | `/api/v1/nemo/actions/:action_name`  | `dispatchNemoAction(name, body.parameters, options)`        |
| GET    | `/api/v1/nemo/actions/colang-sample` | `generateColangSample(baseUrl)`, `Content-Type: text/plain` |

---

## Step 6 — Mount in `src/lib/ui/server.ts`

Two changes only:

**Import** (add to existing imports):

```typescript
import { handleAgentApiRequest } from './agent-api.js';
```

**Mount point** (before existing `/api/health` handler, after asset short-circuits):

```typescript
if (pathname.startsWith('/api/v1/')) {
  const handled = await handleAgentApiRequest(req, res, pathname, method, {
    enableMutations: options.enableMutations,
    bearerToken: process.env['SYNX_AGENT_TOKEN'] || undefined,
  });
  if (handled) return;
}
```

No existing routes start with `/api/v1/` — zero collision risk. The prefix guard falls through to the existing chain when `handled === false`.

---

## Step 7 — UI hardening (`src/lib/ui/web-app.ts`)

**Meta tags** (add to `<head>`):

```html
<meta name="synx-task-count" id="meta-task-count" content="0" />
<meta name="synx-status" id="meta-status" content="unknown" />
```

Updated by JS in `refreshOverview()`:

```js
document
  .getElementById('meta-task-count')
  .setAttribute('content', String(counts.total || 0));
document
  .getElementById('meta-status')
  .setAttribute('content', running ? 'running' : 'stopped');
```

**`data-testid` additions** (all additive):

| Element                                         | `data-testid`               |
| ----------------------------------------------- | --------------------------- |
| Task creation textarea                          | `task-prompt-input`         |
| Task creation submit button                     | `task-prompt-submit`        |
| New task modal title input                      | `newtask-title-input`       |
| New task modal description textarea             | `newtask-description-input` |
| New task modal type select                      | `newtask-type-select`       |
| New task modal submit button                    | `newtask-submit-button`     |
| Task list `<tbody>`                             | `task-list-body`            |
| Each task `<tr>` (in `renderTasks` JS template) | `task-row-${taskId}`        |
| Approve buttons (in JS template)                | `approve-button-${taskId}`  |
| Reprove buttons (in JS template)                | `reprove-button-${taskId}`  |
| Review queue list                               | `review-queue-list`         |
| Review queue approve buttons                    | `review-approve-${taskId}`  |
| Review queue reprove buttons                    | `review-reprove-${taskId}`  |
| Reprove reason textarea                         | `reprove-reason-input`      |
| Reprove submit button                           | `reprove-submit-button`     |
| Engine status pill                              | `engine-status-pill`        |
| Engine status label                             | `engine-status-label`       |

**ARIA additions:**

| Element                 | Attributes                                                                |
| ----------------------- | ------------------------------------------------------------------------- |
| `#recent-tasks`         | `aria-live="polite"` `aria-label="Recent tasks"`                          |
| `#review-list`          | `aria-live="polite"` `aria-label="Review queue"`                          |
| Task board `<table>`    | `role="grid"` `aria-label="Task board"`                                   |
| `#reprove-modal`        | `role="dialog"` `aria-modal="true"` `aria-label="Send back for revision"` |
| `#new-task-modal`       | `role="dialog"` `aria-modal="true"` `aria-label="Create new task"`        |
| Dynamic approve buttons | `aria-label="Approve task ${taskId}"`                                     |
| Dynamic reprove buttons | `aria-label="Send back task ${taskId}"`                                   |

---

## Step 8 — OpenClaw Skill (`skills/synx/SKILL.md`)

**Format:** Natural language markdown guide — exactly matching OpenClaw's pattern (see `skills/github/SKILL.md`, `skills/coding-agent/SKILL.md` in the openclaw repo). Not JSON. Not a function manifest.

**Structure:**

1. **Purpose** — what synx is, what this skill enables
2. **Setup** — base URL config (`SYNX_BASE_URL`, default `http://localhost:4317`), optional `SYNX_AGENT_TOKEN`
3. **Task lifecycle** — state machine diagram in text (new → in_progress → waiting_human → done/failed)
4. **Core operations** — for each: description, `curl` example, response shape, what to do next
   - Create task
   - Check task status (with `nextPollMs` polling hint)
   - List pending review
   - Approve task
   - Reprove task
   - Get system status
5. **Polling pattern** — use `observation.nextPollMs` from response as the sleep interval
6. **Decision rules** — when `needsAction: true` + `actionRequired: "approve_or_reprove"`, agent must act; never auto-approve unless confidence criteria met
7. **Error handling** — 405 means mutations disabled; 422 means provider unreachable; 404 means task gone
8. **Hard constraints** — never call reprove without a clear reason; always verify task exists before acting

---

## Implementation Order

```
Step 1  schema.ts (append-only, zero risk)
  ↓
Step 2  observation.ts + unit tests
  ↓
Step 3  tool-definitions.ts + unit tests
  ↓
Step 4  nemo-adapter.ts + unit tests (depends on Step 2 buildObservation)
  ↓
Step 5  agent-api.ts (all routes, not mounted yet)
  ↓
Step 6  server.ts mount (2 lines)
  ↓
Step 7  web-app.ts hardening + extend web-app tests
  ↓
Step 8  skills/synx/SKILL.md (static file, no tests)
```

---

## Verification

```bash
# 1. Type-check
npx tsc --noEmit

# 2. All existing tests still pass
npx vitest run

# 3. New unit tests pass
npx vitest run src/lib/agent-api/

# 4. New integration tests pass
npx vitest run src/lib/ui/agent-api.test.ts

# 5. Smoke test agent API (server running)
curl http://localhost:4317/api/v1/agent/status
curl http://localhost:4317/api/v1/agent/tools
curl http://localhost:4317/api/v1/nemo/actions
curl http://localhost:4317/api/v1/nemo/actions/colang-sample

# 6. NeMo tool discovery
curl http://localhost:4317/api/v1/agent/openapi.json | jq '.paths | keys'

# 7. Create task via agent API and check observation shape
curl -X POST http://localhost:4317/api/v1/agent/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","rawRequest":"Build a login page"}' \
  | jq '.observation.needsAction, .observation.nextPollMs'
```

### New test files

- `src/lib/agent-api/observation.test.ts` — pure unit tests for all 4 functions
- `src/lib/agent-api/tool-definitions.test.ts` — validates tool count, shape, OpenAPI keys
- `src/lib/agent-api/nemo-adapter.test.ts` — validates all 7 actions, Colang output, mutation guard
- `src/lib/ui/agent-api.test.ts` — integration tests (fixture pattern from `server.test.ts`):
  - All read routes return 200
  - `pending-review` path not swallowed by `:id` regex
  - Mutation routes 405 when `enableMutations: false`
  - Zod validation returns 400 with `issues`
  - Bearer token returns 401 when wrong
  - All existing `/api/*` routes still work (backward compatibility smoke test)
