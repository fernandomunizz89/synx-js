# Plan: OpenClaw + NVIDIA NeMo Agent Integration
**Model-quality implementation reference — every type, import, shape, and edge case is explicit.**

---

## Context

synx-js is a file-based AI coding orchestrator. Its current `/api/*` routes serve the web UI — they return flat data with no polling hints, no `needsAction` flags, and no OpenAI-compatible tool schemas. Two external frameworks need to drive synx as a controlled backend:

- **OpenClaw** — a local AI assistant that reads `SKILL.md` files (natural-language HTTP guides) to understand how to use external systems
- **NVIDIA NeMo Agent** — a function-calling LLM framework that requires an OpenAI-compatible tool array and an HTTP action server

**Intended outcome:** A dedicated `/api/v1/agent/` namespace with rich observation envelopes + a NeMo action server at `/api/v1/nemo/` + a `skills/synx/SKILL.md` guide + UI `data-testid` and ARIA hardening for computer-use browser automation.

---

## Critical Files

| File | Role |
|---|---|
| `src/lib/schema.ts` | **Append-only** — add 3 new Zod schemas at the end |
| `src/lib/ui/server.ts` | **2-line change** — import + mount guard before `/api/health` |
| `src/lib/ui/web-app.ts` | UI hardening — data-testid, ARIA, meta tags |
| `src/lib/services/task-services.ts` | **Reuse only** — `createTaskService`, `approveTaskService`, `reproveTaskService` |
| `src/lib/observability/dto.ts` | **Reuse only** — `TaskDetailDto`, `OverviewDto`, `TaskSummaryDto` (source of truth for observation shape) |
| `src/lib/observability/queries.ts` | **Reuse only** — `getTaskDetail`, `listTaskSummaries`, `listReviewQueue`, `getOverview` |

---

## New Files

```
src/lib/agent-api/observation.ts        — pure observation builder (no I/O)
src/lib/agent-api/tool-definitions.ts  — OpenAI tool array + OpenAPI 3.0 spec
src/lib/agent-api/nemo-adapter.ts      — NeMo action dispatch + Colang generator
src/lib/ui/agent-api.ts                — all /api/v1/* route handlers
skills/synx/SKILL.md                   — OpenClaw skill guide

src/lib/agent-api/observation.test.ts
src/lib/agent-api/tool-definitions.test.ts
src/lib/agent-api/nemo-adapter.test.ts
src/lib/ui/agent-api.test.ts
```

---

## Step 1 — Schema additions (`src/lib/schema.ts`)

**Append** these three schemas at the **end** of the file. Do not modify anything else.

```typescript
// ─── Agent API schemas ────────────────────────────────────────────────────────

// Input for agent-driven task creation (looser than newTaskInputSchema — project optional)
export const agentTaskInputSchema = z.object({
  title: z.string().min(1),
  rawRequest: z.string().min(1),
  typeHint: taskTypeSchema.optional().default("Feature"),
  project: z.string().optional(),
  relatedFiles: z.array(z.string()).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
  e2ePolicy: e2ePolicySchema.optional().default("auto"),
});
export type AgentTaskInput = z.infer<typeof agentTaskInputSchema>;

// Standardised agent observation envelope (every agent API response uses this shape)
export const observationResponseSchema = z.object({
  ok: z.boolean(),
  observation: z.object({
    taskId: z.string().optional(),
    status: taskStatusSchema.optional(),
    currentAgent: z.string().optional(),
    needsAction: z.boolean(),
    actionRequired: z.enum(["approve_or_reprove", "provide_input"]).nullable().optional(),
    output: z.unknown().optional(),
    history: z.array(taskMetaHistoryItemSchema).optional(),
    nextPollMs: z.number().int().nonnegative(),
    message: z.string(),
  }),
});
export type ObservationResponse = z.infer<typeof observationResponseSchema>;

// NeMo action request body — parameters is a free dict
export const nemoActionInputSchema = z.object({
  parameters: z.record(z.unknown()).optional().default({}),
});
export type NemoActionInput = z.infer<typeof nemoActionInputSchema>;
```

---

## Step 2 — Observation builder (`src/lib/agent-api/observation.ts`)

Pure functions, **zero I/O**. Receives a `TaskDetailDto | null` from the caller.

```typescript
import type { TaskDetailDto } from "../observability/dto.js";
import type { ObservationResponse } from "../schema.js";

/** Polling hint in milliseconds by task status. */
export function deriveNextPollMs(status: string | undefined): number {
  switch (status) {
    case "new":            return 5_000;
    case "in_progress":   return 3_000;
    case "waiting_agent": return 4_000;
    case "waiting_human": return 10_000;
    case "blocked":       return 15_000;
    case "done":
    case "failed":
    case "archived":      return 60_000;
    default:              return 10_000;
  }
}

/** Derive needsAction and actionRequired from task detail. */
export function deriveNeedsAction(detail: TaskDetailDto): {
  needsAction: boolean;
  actionRequired: "approve_or_reprove" | null;
} {
  const needs =
    detail.status === "waiting_human" || detail.humanApprovalRequired === true;
  return {
    needsAction: needs,
    actionRequired: needs ? "approve_or_reprove" : null,
  };
}

/** Build a full ObservationResponse from a TaskDetailDto (or null). */
export function buildObservation(
  detail: TaskDetailDto | null,
  taskId?: string
): ObservationResponse {
  if (!detail) {
    return {
      ok: true,
      observation: {
        taskId,
        needsAction: false,
        nextPollMs: 10_000,
        message: "Task not found.",
      },
    };
  }

  const { needsAction, actionRequired } = deriveNeedsAction(detail);
  const lastArtifact = detail.doneArtifacts.at(-1);

  return {
    ok: true,
    observation: {
      taskId: detail.taskId,
      status: detail.status,
      currentAgent: detail.currentAgent,
      needsAction,
      actionRequired,
      output: lastArtifact,
      history: detail.history,
      nextPollMs: deriveNextPollMs(detail.status),
      message: `Task is ${detail.status}.`,
    },
  };
}
```

---

## Step 3 — Tool definitions (`src/lib/agent-api/tool-definitions.ts`)

```typescript
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

// Returns the 7-tool OpenAI function-calling array.
export function getToolDefinitions(): OpenAITool[] { ... }

// Returns an OpenAPI 3.0 spec with baseUrl injected.
export function getOpenApiSpec(baseUrl: string): object { ... }
```

**The 7 tools — implement each with exact names, descriptions, and JSON Schema parameters:**

| Tool name | HTTP equivalent | Parameters (JSON Schema) |
|---|---|---|
| `synx_create_task` | POST /api/v1/agent/tasks | `title` (string, required), `rawRequest` (string, required), `typeHint` (enum Feature/Bug/Refactor/Research/Documentation/Mixed/Project, default Feature), `project` (string), `relatedFiles` (array of string), `notes` (array of string), `e2ePolicy` (enum auto/required/skip, default auto) |
| `synx_get_task` | GET /api/v1/agent/tasks/:id | `taskId` (string, required) |
| `synx_list_tasks` | GET /api/v1/agent/tasks | `status` (enum: all task statuses), `project` (string), `q` (string) — all optional |
| `synx_approve_task` | POST /api/v1/agent/tasks/:id/approve | `taskId` (string, required) |
| `synx_reprove_task` | POST /api/v1/agent/tasks/:id/reprove | `taskId` (string, required), `reason` (string, required) |
| `synx_list_pending_review` | GET /api/v1/agent/tasks/pending-review | none |
| `synx_get_system_status` | GET /api/v1/agent/status | none |

**OpenAPI spec structure:**
```json
{
  "openapi": "3.0.3",
  "info": { "title": "synx Agent API", "version": "1.0.0" },
  "servers": [{ "url": "<baseUrl>" }],
  "paths": {
    "/api/v1/agent/tasks": { "get": {...}, "post": {...} },
    "/api/v1/agent/tasks/pending-review": { "get": {...} },
    "/api/v1/agent/tasks/{taskId}": { "get": {...} },
    "/api/v1/agent/tasks/{taskId}/approve": { "post": {...} },
    "/api/v1/agent/tasks/{taskId}/reprove": { "post": {...} },
    "/api/v1/agent/status": { "get": {...} }
  }
}
```

---

## Step 4 — NeMo adapter (`src/lib/agent-api/nemo-adapter.ts`)

```typescript
import { createTaskService, approveTaskService, reproveTaskService } from "../services/task-services.js";
import { getTaskDetail, listTaskSummaries, listReviewQueue, getOverview } from "../observability/queries.js";
import { buildObservation } from "./observation.js";

export interface NemoActionDescriptor {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface NemoActionOptions {
  enableMutations: boolean;
}

/** Returns array of all action descriptors (for GET /api/v1/nemo/actions). */
export function listNemoActions(): NemoActionDescriptor[]

/** Dispatches an action by name; returns NeMo-shaped output. */
export async function dispatchNemoAction(
  actionName: string,
  parameters: Record<string, unknown>,
  options: NemoActionOptions
): Promise<{ output_data: Record<string, unknown> }>

/** Generates downloadable Colang .co file for NeMo Guardrails operators. */
export function generateColangSample(baseUrl: string): string
```

**Action → service mapping:**

| NeMo action name | Implementation | Mutation? |
|---|---|---|
| `synx_create_task` | `createTaskService({ title, rawRequest, typeHint, project, extraContext: { relatedFiles, notes } })` then `buildObservation` | Yes |
| `synx_get_task` | `getTaskDetail(taskId)` → `buildObservation(detail, taskId)` | No |
| `synx_list_tasks` | `listTaskSummaries()` filtered by `status`/`project`/`q` | No |
| `synx_approve_task` | `approveTaskService(taskId)` then `getTaskDetail` → `buildObservation` | Yes |
| `synx_reprove_task` | `reproveTaskService({ taskId, reason })` then `getTaskDetail` → `buildObservation` | Yes |
| `synx_list_pending_review` | `listReviewQueue()` | No |
| `synx_get_status` | `getOverview()` | No |

**Mutation guard** — if `options.enableMutations === false` for a mutation action, return immediately:
```typescript
return { output_data: { ok: false, error: "Mutations disabled." } };
```

**Unknown action** — return:
```typescript
return { output_data: { ok: false, error: `Unknown action: ${actionName}` } };
```

**Colang sample** — generate one block per action (7 total):
```colang
define action synx_create_task
  http_request:
    url: "${baseUrl}/api/v1/nemo/actions/synx_create_task"
    method: POST
    headers:
      Content-Type: "application/json"
    body: $action_params

define action synx_get_task
  http_request:
    url: "${baseUrl}/api/v1/nemo/actions/synx_get_task"
    method: POST
    headers:
      Content-Type: "application/json"
    body: $action_params

# ... repeat for all 7 actions
```

---

## Step 5 — Agent route handler (`src/lib/ui/agent-api.ts`)

```typescript
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { agentTaskInputSchema, nemoActionInputSchema } from "../schema.js";
import { buildObservation } from "../agent-api/observation.js";
import { getToolDefinitions, getOpenApiSpec } from "../agent-api/tool-definitions.js";
import { listNemoActions, dispatchNemoAction, generateColangSample } from "../agent-api/nemo-adapter.js";
import { createTaskService, approveTaskService, reproveTaskService } from "../services/task-services.js";
import { getTaskDetail, listTaskSummaries, listReviewQueue, getOverview } from "../observability/queries.js";

export interface AgentApiHandlerOptions {
  enableMutations: boolean;
  bearerToken?: string; // from env SYNX_AGENT_TOKEN; if undefined, auth is skipped
}

/**
 * Handle a single HTTP request for /api/v1/*.
 * Returns true if the path matched (even on error), false if path did not match.
 * The caller must check the return value: if false, continue to the next handler.
 */
export async function handleAgentApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  options: AgentApiHandlerOptions
): Promise<boolean>
```

### Helper: bearer token check (internal, not exported)

```typescript
function checkBearer(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers["authorization"] ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
  } catch {
    return false; // buffers different length → automatically false
  }
}
```

When `bearerToken` is set and check fails → send 401 with header `WWW-Authenticate: Bearer realm="synx"`.

### Helper: parseJsonBody (copy pattern from server.ts)

```typescript
async function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
    return {}; // caller checks if response was already sent
  }
}
```

### Helper: sendJson (copy from server.ts pattern)

```typescript
function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
```

### Route table — Agent routes (`/api/v1/agent/`)

**IMPORTANT: Match `/api/v1/agent/tasks/pending-review` BEFORE the `:id` pattern.**

| Method | Path pattern | Status | Implementation |
|---|---|---|---|
| POST | `/api/v1/agent/tasks` | 201 | Parse body → `agentTaskInputSchema.safeParse()` → if fail send 400 with `{ ok: false, issues: result.error.issues }` → `createTaskService(mapped)` → `getTaskDetail(taskId)` → `buildObservation()` → send |
| GET | `/api/v1/agent/tasks` | 200 | `listTaskSummaries()` → filter by `?status=`, `?project=`, `?q=` query params → `{ ok: true, data: filtered }` |
| GET | `/api/v1/agent/tasks/pending-review` | 200 | `listReviewQueue()` → `{ ok: true, data: queue }` |
| GET | `/api/v1/agent/tasks/:id` | 200/404 | `getTaskDetail(id)` → if null send 404 `{ ok: false, error: "Task not found." }` → else `buildObservation(detail)` |
| POST | `/api/v1/agent/tasks/:id/approve` | 200/405 | Mutation guard → `approveTaskService(id)` → `getTaskDetail(id)` → `buildObservation()` |
| POST | `/api/v1/agent/tasks/:id/reprove` | 200/400/405 | Mutation guard → parse body → require `reason` (string, non-empty) else 400 → `reproveTaskService({ taskId: id, reason })` → `getTaskDetail(id)` → `buildObservation()` |
| GET | `/api/v1/agent/tools` | 200 | `{ ok: true, data: getToolDefinitions() }` |
| GET | `/api/v1/agent/openapi.json` | 200 | `getOpenApiSpec(baseUrl)` where `baseUrl` is derived from `req.headers.host` |
| GET | `/api/v1/agent/status` | 200 | `getOverview()` → wrap in `{ ok: true, observation: { ...overview, needsAction: false, nextPollMs: 30000, message: "System status." } }` |

**Mutation guard** (use in approve, reprove):
```typescript
if (!options.enableMutations) {
  sendJson(res, 405, { ok: false, error: "Mutations are disabled." });
  return true; // path matched, response sent
}
```

**agentTaskInput → NewTaskInput mapping:**
```typescript
const input = {
  title: parsed.title,
  typeHint: parsed.typeHint,
  project: parsed.project,
  rawRequest: parsed.rawRequest,
  extraContext: {
    relatedFiles: parsed.relatedFiles,
    logs: [],
    notes: parsed.notes,
    qaPreferences: { e2ePolicy: parsed.e2ePolicy },
  },
};
```

### Route table — NeMo routes (`/api/v1/nemo/`)

| Method | Path pattern | Status | Implementation |
|---|---|---|---|
| GET | `/api/v1/nemo/actions` | 200 | `{ ok: true, data: listNemoActions() }` |
| GET | `/api/v1/nemo/actions/colang-sample` | 200 | `Content-Type: text/plain; charset=utf-8` body = `generateColangSample(baseUrl)` |
| POST | `/api/v1/nemo/actions/:action_name` | 200 | Parse body → `nemoActionInputSchema.safeParse()` → `dispatchNemoAction(action_name, parameters, options)` → `{ ok: true, data: result.output_data }` |

---

## Step 6 — Mount in `src/lib/ui/server.ts`

**Two changes only — minimal blast radius:**

**Add import** (alongside existing imports, after last import line):
```typescript
import { handleAgentApiRequest } from "./agent-api.js";
```

**Add mount guard** — insert BEFORE the existing `/api/health` GET handler, AFTER the asset short-circuit block:
```typescript
if (pathname.startsWith("/api/v1/")) {
  const handled = await handleAgentApiRequest(req, res, pathname, method, {
    enableMutations: options.enableMutations ?? false,
    bearerToken: process.env["SYNX_AGENT_TOKEN"] || undefined,
  });
  if (handled) return;
}
```

No existing routes start with `/api/v1/` — zero collision risk. If `handleAgentApiRequest` returns `false` (path didn't match), execution falls through to the existing handler chain.

---

## Step 7 — UI hardening (`src/lib/ui/web-app.ts`)

### Meta tags — add to `<head>` in the HTML template string

```html
<meta name="synx-task-count" id="meta-task-count" content="0">
<meta name="synx-status" id="meta-status" content="unknown">
```

Update them in the `refreshOverview()` JavaScript function (already exists in web-app.ts):
```js
document.getElementById('meta-task-count').setAttribute('content', String(data.counts?.total ?? 0));
document.getElementById('meta-status').setAttribute('content', data.runtime?.isAlive ? 'running' : 'stopped');
```

### `data-testid` additions — all purely additive HTML attributes

| Element | `data-testid` value |
|---|---|
| Task creation textarea | `task-prompt-input` |
| Task creation submit button | `task-prompt-submit` |
| New task modal title input | `newtask-title-input` |
| New task modal description textarea | `newtask-description-input` |
| New task modal type select | `newtask-type-select` |
| New task modal submit button | `newtask-submit-button` |
| Task list `<tbody>` | `task-list-body` |
| Each task `<tr>` (JS template literal) | `task-row-${taskId}` |
| Approve buttons (JS template literal) | `approve-button-${taskId}` |
| Reprove buttons (JS template literal) | `reprove-button-${taskId}` |
| Review queue `<ul>` or `<div>` | `review-queue-list` |
| Review queue approve buttons | `review-approve-${taskId}` |
| Review queue reprove buttons | `review-reprove-${taskId}` |
| Reprove reason textarea | `reprove-reason-input` |
| Reprove submit button | `reprove-submit-button` |
| Engine status pill/badge | `engine-status-pill` |
| Engine status label span | `engine-status-label` |

### ARIA additions

| Element | Attributes to add |
|---|---|
| `#recent-tasks` container | `aria-live="polite"` `aria-label="Recent tasks"` |
| `#review-list` container | `aria-live="polite"` `aria-label="Review queue"` |
| Task board `<table>` | `role="grid"` `aria-label="Task board"` |
| `#reprove-modal` | `role="dialog"` `aria-modal="true"` `aria-label="Send back for revision"` |
| `#new-task-modal` | `role="dialog"` `aria-modal="true"` `aria-label="Create new task"` |
| Dynamic approve buttons (JS template) | `aria-label="Approve task ${taskId}"` |
| Dynamic reprove buttons (JS template) | `aria-label="Send back task ${taskId}"` |

---

## Step 8 — OpenClaw Skill (`skills/synx/SKILL.md`)

Natural language markdown guide — matching OpenClaw's skill format. Not JSON. Not a function manifest.

**Required sections:**

1. **Purpose** — synx is a file-based AI coding orchestrator. This skill lets OpenClaw create tasks, monitor pipeline progress, and approve or reprove work via the Agent API.

2. **Setup**
   - `SYNX_BASE_URL` env var (default `http://localhost:4317`)
   - Optional `SYNX_AGENT_TOKEN` → set as `Authorization: Bearer <token>` on every request
   - All endpoints return `{ ok: boolean, ... }` at root level

3. **Task lifecycle** (text state machine)
   ```
   new → in_progress → waiting_agent → waiting_human → done
                                     ↘ failed
                    ↘ blocked → (retry) → in_progress
   ```

4. **Core operations** — for each operation include: purpose, curl example, response shape, what to do next

   **Create task:**
   ```bash
   curl -X POST $SYNX_BASE_URL/api/v1/agent/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"Add dark mode","rawRequest":"Add a dark mode toggle to the settings page"}'
   ```
   Response: `{ ok: true, observation: { taskId, status, needsAction, nextPollMs, message } }`
   → Save `taskId`. Poll `/api/v1/agent/tasks/:id` after `nextPollMs` ms.

   **Poll task:**
   ```bash
   curl $SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID
   ```
   → Use `observation.nextPollMs` as sleep before next poll. When `needsAction: true`, act immediately.

   **List pending review:**
   ```bash
   curl $SYNX_BASE_URL/api/v1/agent/tasks/pending-review
   ```

   **Approve:**
   ```bash
   curl -X POST $SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID/approve
   ```

   **Reprove:**
   ```bash
   curl -X POST $SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID/reprove \
     -H "Content-Type: application/json" \
     -d '{"reason":"The button is missing hover state"}'
   ```

   **System status:**
   ```bash
   curl $SYNX_BASE_URL/api/v1/agent/status
   ```

5. **Polling pattern** — always use `observation.nextPollMs` from the response as the wait interval, not a fixed sleep.

6. **Decision rules**
   - When `needsAction: true` and `actionRequired: "approve_or_reprove"` → agent must call approve or reprove
   - Never auto-approve unless confidence is ≥ threshold set by user
   - Always call reprove with a specific, actionable `reason` string

7. **Error handling**
   - `405` → mutations disabled (read-only mode), do not retry
   - `422` → provider unreachable, wait and retry with exponential backoff
   - `404` → task not found, stop polling
   - `400` with `issues` array → Zod validation error, fix input before retrying
   - `401` → missing or wrong bearer token, abort

8. **Hard constraints**
   - Never call reprove without a non-empty `reason`
   - Always verify task exists with a GET before approve/reprove
   - Do not poll faster than `nextPollMs` suggests

---

## Implementation Order

```
Step 1  schema.ts (append-only, zero risk)
  ↓
Step 2  observation.ts  →  observation.test.ts
  ↓
Step 3  tool-definitions.ts  →  tool-definitions.test.ts
  ↓
Step 4  nemo-adapter.ts  →  nemo-adapter.test.ts  (depends on observation.ts)
  ↓
Step 5  agent-api.ts  (all routes, not yet mounted, depends on all above)
  ↓
Step 6  server.ts mount  (2-line change — import + guard)
  ↓
Step 7  web-app.ts hardening  →  extend existing web-app tests
  ↓
Step 8  skills/synx/SKILL.md  (static file, no tests needed)
```

---

## Test patterns

### All new test files use the same fixture as `server.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import type { NewTaskInput } from "../types.js";

const originalCwd = process.cwd();

interface Fixture { root: string; repoRoot: string; }

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "agent-api-test",
    rawRequest: title,
    extraContext: { relatedFiles: [], logs: [], notes: [] },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-agent-api-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-agent-api-test" }, null, 2),
    "utf8"
  );
  return { root, repoRoot };
}
```

### `observation.test.ts` — pure unit tests

```typescript
describe("deriveNextPollMs", () => {
  it("returns 3000 for in_progress", () => expect(deriveNextPollMs("in_progress")).toBe(3_000));
  it("returns 60000 for done", () => expect(deriveNextPollMs("done")).toBe(60_000));
  it("returns 10000 for unknown", () => expect(deriveNextPollMs("unknown_status")).toBe(10_000));
});

describe("deriveNeedsAction", () => {
  it("is true when status is waiting_human");
  it("is true when humanApprovalRequired is true regardless of status");
  it("is false for in_progress");
});

describe("buildObservation", () => {
  it("returns message 'Task not found.' when detail is null");
  it("sets output to last doneArtifacts entry");
  it("sets actionRequired to 'approve_or_reprove' when needsAction");
  it("sets nextPollMs from deriveNextPollMs");
});
```

### `tool-definitions.test.ts`

```typescript
it("getToolDefinitions returns exactly 7 tools");
it("all tools have type === 'function'");
it("all tool names start with 'synx_'");
it("getOpenApiSpec has 'openapi', 'info', 'paths' keys");
it("openapi spec has exactly 6 path entries");
```

### `nemo-adapter.test.ts`

```typescript
it("listNemoActions returns 7 actions");
it("dispatchNemoAction with unknown name returns { ok: false, error: 'Unknown action: ...' }");
it("dispatchNemoAction with mutation when enableMutations false returns { ok: false, error: 'Mutations disabled.' }");
it("generateColangSample contains all 7 'define action synx_' blocks");
it("generateColangSample includes the baseUrl in each URL");
```

### `agent-api.test.ts` — integration tests

Uses `startUiServer` fixture (identical pattern to `server.test.ts`):

```typescript
describe.sequential("agent-api", () => {
  it("GET /api/v1/agent/status returns 200 with ok: true");
  it("GET /api/v1/agent/tools returns 7 tools");
  it("GET /api/v1/agent/openapi.json has paths key");
  it("GET /api/v1/nemo/actions returns 7 actions");
  it("GET /api/v1/nemo/actions/colang-sample returns text/plain");

  // Path ordering: pending-review must not be swallowed by :id regex
  it("GET /api/v1/agent/tasks/pending-review returns 200");

  // Mutation guard
  it("POST /api/v1/agent/tasks/:id/approve returns 405 when enableMutations: false");
  it("POST /api/v1/agent/tasks/:id/reprove returns 405 when enableMutations: false");

  // Zod validation
  it("POST /api/v1/agent/tasks with empty title returns 400 with issues array");

  // Bearer token
  it("GET /api/v1/agent/status returns 401 when wrong token");
  it("GET /api/v1/agent/status returns 200 when correct token");

  // Backward compat — existing routes still work
  it("GET /api/health still returns 200");
  it("GET /api/overview still returns 200");
  it("GET /api/tasks still returns 200");
});
```

---

## Verification

```bash
# 1. Type-check — must pass with zero errors
npx tsc --noEmit

# 2. All existing tests still pass
npx vitest run

# 3. New unit tests
npx vitest run src/lib/agent-api/

# 4. New integration test
npx vitest run src/lib/ui/agent-api.test.ts

# 5. Smoke test (server must be running on port 4317)
curl http://localhost:4317/api/v1/agent/status | jq '.ok'
curl http://localhost:4317/api/v1/agent/tools | jq '.data | length'
curl http://localhost:4317/api/v1/nemo/actions | jq '.data | length'
curl -s http://localhost:4317/api/v1/nemo/actions/colang-sample | head -5

# 6. NeMo tool discovery
curl http://localhost:4317/api/v1/agent/openapi.json | jq '.paths | keys'

# 7. Full agent workflow smoke test
TASK=$(curl -s -X POST http://localhost:4317/api/v1/agent/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke test","rawRequest":"Add a hello world endpoint"}' \
  | jq -r '.observation.taskId')
echo "Created: $TASK"
curl -s http://localhost:4317/api/v1/agent/tasks/$TASK \
  | jq '.observation | {status, needsAction, nextPollMs}'
```
