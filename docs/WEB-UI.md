# SYNX Web UI

`synx ui` starts a local web interface built on a React 19 + Vite SPA. It provides real-time observability, human review, Kanban task management, and metrics visualization on top of the same filesystem used by the CLI.

## Start

```bash
synx ui
```

Default bind: `http://127.0.0.1:4317`

```bash
synx ui --host 127.0.0.1 --port 4318   # custom bind
synx ui --read-only                     # disable approve/reprove/cancel
```

## Interface

Four tabs — always in sync with the live filesystem via SSE. The active tab is preserved in the URL hash (`#tasks`, `#kanban`, `#metrics`, `#stream`) so refreshing or sharing a link lands on the right page.

---

### Tasks

- Searchable table: filter by text (title, ID, project, agent) across all tasks and subtasks.
- Sub-tabs: **All** (full list) and **Review** (focused `waiting_human` queue with badge count).
- Action buttons per task based on current status:
  - **Approve** — available when `humanApprovalRequired` is set.
  - **Reprove…** — opens the reprove modal (optional reason, optional rollback).
  - **Cancel** — available when status is `new`, `in_progress`, or `waiting_agent`.
- Auto-refreshes after SSE task events. Disconnected banner shown if the SSE connection drops.

---

### Kanban

7-column board mapping directly to task statuses:

```
new → in_progress → waiting_agent → waiting_human → blocked → failed → done
```

Each card shows: title, type badge, priority dot, project, milestone, current agent, accumulated duration, and accumulated cost.

**Toolbar:**
- **Group by** toggle: Status (default) / Project / Milestone.
- **Text filter** across title, ID, project, agent, milestone.
- **Hide done & archived** checkbox.

**Actions:**
- **Approve (✓) / Reprove (✗)** buttons on `waiting_human` cards.
- **Cancel (✕)** button on all non-terminal cards.

**Drag-and-drop:**

All non-terminal cards (not `done` or `archived`) are draggable. A grip indicator (⠿) appears on draggable cards. Use PointerSensor with an 8 px distance threshold so clicks on action buttons are never intercepted.

| Drag from | Drop on | Action |
|---|---|---|
| `waiting_human` | `done` | `POST /api/tasks/:id/approve` |
| `waiting_human` | `in_progress` | Opens reprove modal |
| Any non-terminal | Trash zone (bottom) | `POST /api/tasks/:id/cancel` |

While dragging a `waiting_human` card, the `done` and `in_progress` columns highlight teal. A red dashed **trash zone** appears at the bottom of the board while any non-terminal card is dragged.

Real-time: SSE events (`task.updated`, `task.created`, `stage.completed`, `stage.failed`) trigger board refresh automatically.

---

### Metrics

Metrics dashboard powered by Recharts. Auto-refreshes every 60 s; use the manual **Refresh** button for immediate reload. Range selector: **7d / 30d / 90d**.

Loaded lazily (recharts is bundled separately — main SPA remains fast).

#### C.1 — KPI Cards

Five summary cards with 7-day sparklines:

| Card | Source |
|---|---|
| Tasks completed | `GET /api/metrics/overview` |
| Success rate | `GET /api/metrics/overview` |
| Avg lead time | `GET /api/metrics/overview` |
| Total estimated cost | `GET /api/metrics/overview` |
| QA return rate | `GET /api/metrics/overview` |

#### C.2 — Timeline

- **Active tasks per day** — stacked AreaChart (done / in_progress / failed).
- **Cost & tokens per day** — ComposedChart with dual Y axis (bars = tokens, line = cost).

Source: `GET /api/metrics/timeline?days=N`

#### C.3 — Agent Performance

- Approval rate by agent — horizontal BarChart, color-coded (green ≥ 80 %, orange ≥ 50 %, red < 50 %).
- Avg stage duration — horizontal BarChart sorted descending.

Source: `GET /api/metrics/agents`

#### C.4 — Project Health

- Task status by project — stacked horizontal BarChart (done / active / waiting / failed).

Source: `GET /api/metrics/projects`

#### C.5 — Operational

- Top bottleneck stage, throttle events, retry wait, and QA return rate — summary cards.
- Rework rate by project — horizontal BarChart, color-coded by threshold.

Source: `GET /api/metrics/overview`

---

### Stream

- Real-time event log via Server-Sent Events.
- Each entry shows: time, event type (color-coded), task ID, and event message.
- SSE events that affect tasks also trigger background refreshes in Tasks and Kanban.

---

## Header

Always visible. Shows:
- **Engine status dot** — green (running) or red (stopped).
- **Active tasks count.**
- **Waiting review count** — drives the Review sub-tab badge.
- **Theme toggle** — dark / light / system.

Polls `/api/overview` every 10 s.

---

## SSE Connection

The UI maintains two persistent SSE connections (one per active page that needs real-time updates). If the connection drops:

- An orange **"⚠ Real-time disconnected — reconnecting in Xs…"** banner appears in Tasks and Kanban.
- Reconnection uses exponential backoff starting at 1 s, doubling each failure, capped at 30 s.
- Backoff resets to 1 s on successful reconnect.
- A **Retry now** button triggers an immediate reconnect without waiting.

---

## Error Isolation

Each tab is wrapped in a React `ErrorBoundary`. A crash in one panel shows the error message and a **Retry** button without taking down other tabs.

---

## Reprove modal

- Optional reason field.
- Optional rollback: restores tracked file changes for that task (`rollbackMode: task`).

---

## Read-only mode

When started with `--read-only`, all mutating actions are disabled:
- Approve, reprove, cancel buttons are blocked at the API level (HTTP 405).
- Use this mode for passive monitoring or shared team dashboards.

---

## API endpoints

All served by the same process as `synx ui`.

### Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Engine health check |
| `GET` | `/api/overview` | Engine status + task counters |
| `GET` | `/api/tasks` | Task list (filters: `status`, `project`, `q`) |
| `GET` | `/api/tasks/:id` | Task detail |
| `GET` | `/api/review-queue` | Tasks in `waiting_human` |
| `POST` | `/api/tasks` | Create a single task |
| `POST` | `/api/tasks/:id/approve` | Approve task |
| `POST` | `/api/tasks/:id/reprove` | Reprove task (body: `reason`, `rollbackMode`) |
| `POST` | `/api/tasks/:id/cancel` | Cancel task (body: `reason`) |

### Kanban

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/kanban` | Board grouped by status (`KanbanBoardDto`) |

### Metrics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/metrics/overview` | KPIs, stage summary, agent/project quality |
| `GET` | `/api/metrics/timeline?days=N` | Daily task / token / cost series |
| `GET` | `/api/metrics/agents` | Per-agent approval rate and duration |
| `GET` | `/api/metrics/projects` | Per-project task counts and cost |

### Runtime

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stream` | SSE stream of runtime events |
| `POST` | `/api/runtime/pause` | Pause engine |
| `POST` | `/api/runtime/resume` | Resume engine |
| `POST` | `/api/runtime/stop` | Stop engine |
| `POST` | `/api/project` | Submit a project prompt (creates subtasks) |

All responses follow `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

### Response caching

Read endpoints that scan the task filesystem are cached in-process:

| Endpoint group | TTL |
|---|---|
| `/api/tasks`, `/api/kanban`, `/api/overview`, `/api/review-queue` | 3 s |
| `/api/metrics/*` | 15 s |

Cache is invalidated immediately after any mutating action (approve / reprove / cancel / create).

---

## Build

The React SPA lives in `web/` and is compiled separately from the TypeScript daemon:

```bash
npm run build       # builds TypeScript daemon + React SPA (web/ → dist/ui/)
npm run build:ui    # React SPA only
npm run dev:ui      # Vite dev server on :5173 with /api proxy to :4317
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank screen / "UI not built" | Run `npm run build` or `npm run build:ui` before `synx ui`. |
| Blank task list | Confirm `.ai-agents/tasks/` exists in the current repo. |
| No live events in Stream | Check that `synx start` is running and `.ai-agents/logs/runtime-events.jsonl` exists. |
| Disconnected banner keeps appearing | Check the daemon is running; use **Retry now** or wait for auto-reconnect. |
| Actions rejected with 405 | UI was started with `--read-only`. |
| Port in use | Use `synx ui --port 4318` or another free port. |
