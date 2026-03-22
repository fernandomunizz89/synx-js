# SYNX Web UI Operations Guide

## Goal

`synx ui` starts a local web surface for observability and human review on top of the same filesystem/runtime used by the CLI and TUI.

## Start

```bash
synx ui
```

Default bind:
- host: `127.0.0.1`
- port: `4317`

Custom bind:

```bash
synx ui --host 127.0.0.1 --port 4318
```

Read-only mode (no approve/reprove/cancel/runtime commands):

```bash
synx ui --read-only
```

## Views

- **Overview:** daemon health, task counters, queue size, token/cost estimates
- **Tasks:** searchable task table
- **Review Queue:** tasks in `waiting_human`
- **Task Detail:** status/stage/agent, recent events, artifacts, review controls
- **Live Stream:** runtime/task/metrics events over SSE
- **Analytics:** rankings for tasks/agents/projects plus timeline, QA-loop indicators, and 30-day cost/token/duration curves

## Frontend architecture (incremental React)

The current UI follows an incremental migration path that keeps the existing local API/SSE contract stable.

- Server renders the shell and legacy fallback containers.
- Browser loads `dist/ui-assets/task-assistant.react.js` via `GET /ui-assets/task-assistant.react.js`.
- React islands mount progressively inside the shell.
- Legacy fallback remains active only if the React bundle fails to load or mount.

Current React islands:
- Task Assistant (simple form + advanced panel behind "Advanced").
- Header global search.
- Task Board (Kanban and Agent Lanes).

Fallback containers currently used by the shell:
- `#simple-action-fallback`
- `#header-search-fallback`
- `#board-fallback`

## Build and validation

Run from project root:

```bash
npm run build
```

Build breakdown:
- `npm run build:ts` compiles TypeScript.
- `npm run build:ui` bundles React islands into `dist/ui-assets/task-assistant.react.js`.

Recommended UI verification:

```bash
npm run test -- src/lib/ui/web-app.test.ts src/lib/ui/layout.test.ts src/lib/ui/server.test.ts src/lib/ui/server-contract.test.ts src/lib/ui/server-actions.test.ts
npm run check
```

## Incremental rollout and legacy removal

Migration is done module by module to avoid downtime or UX breakage.

1. Migrate one module to React while preserving existing API payloads and routes.
2. Keep fallback in place while tests and manual flows stabilize.
3. Remove fallback markup and legacy handlers for the stabilized module.
4. Repeat for the next module until legacy rendering is fully retired.

Suggested next modules:
- Header and Omnisearch hardening (keyboard navigation and result grouping).
- Task Board interactions expansion (drag/drop and detail drawer transitions).
- Live Stream and Review Panel migration using the same island pattern.
- Analytics migration with chart wrappers and export controls.

## API and SSE endpoints

- `GET /api/health`
- `GET /api/overview`
- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/review-queue`
- `GET /api/metrics/overview`
- `GET /api/metrics/tasks`
- `GET /api/metrics/agents`
- `GET /api/metrics/projects`
- `GET /api/metrics/timeline`
- `GET /api/metrics/advanced`
- `GET /api/stream` (SSE)

Mutating endpoints (disabled in `--read-only`):
- `POST /api/tasks/:taskId/approve`
- `POST /api/tasks/:taskId/reprove`
- `POST /api/tasks/:taskId/cancel`
- `POST /api/runtime/pause`
- `POST /api/runtime/resume`
- `POST /api/runtime/stop`

## Error behavior

- task not found on mutating routes: `404`
- invalid JSON body on mutating routes: `400`
- read-only mutation attempt: `405`

All API responses follow:

```json
{ "ok": true, "data": {} }
```

or

```json
{ "ok": false, "error": "message" }
```

## Troubleshooting

- **Blank queue / tasks:** confirm `.ai-agents/tasks/` exists in the current repo.
- **No live events:** verify `.ai-agents/logs/runtime-events.jsonl` and daemon activity (`synx start`).
- **Action rejected in UI:** check if UI was started in `--read-only` mode.
- **Port in use:** start with another port, e.g. `synx ui --port 4318`.
