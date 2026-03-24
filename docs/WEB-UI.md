# SYNX Web UI

`synx ui` starts a local web interface for observability and human review on top of the same filesystem used by the CLI.

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

Three tabs — always in sync with the live filesystem.

### Tasks

- Searchable table: filter by text (title, ID, project) or by status.
- Click any row to expand task details: ID, status, type, current agent, timestamps, raw request.
- Action buttons appear in the expanded row based on current status:
  - **Approve** — available when status is `waiting_human`
  - **Reprove…** — opens the reprove modal (reason required, optional rollback)
  - **Cancel** — available when status is `new`, `in_progress`, or `waiting_agent`
- Auto-refreshes every 15 s and immediately after SSE task events.

### Review

- Focused list of tasks currently in `waiting_human`.
- Each item shows title, short ID, type, current agent, and age.
- Approve and Reprove buttons inline — no need to navigate to task detail.
- Badge on the tab shows the current queue count.
- Auto-refreshes every 20 s and after SSE task events.

### Stream

- Real-time event log via Server-Sent Events.
- Each entry shows: time, event type, and event message.
- Events that affect tasks or the engine also trigger a background refresh of Tasks, Review, and the header stats.
- Clear button resets the local buffer.
- Reconnects automatically on connection loss (3 s backoff).

## Header

Always visible. Shows:
- **Engine status dot** — green (running) or red (stopped).
- **Active tasks count.**
- **Waiting review count** — also drives the Review tab badge.
- **Last updated** relative timestamp.

Polls `/api/overview` every 10 s.

## Reprove modal

- Requires a reason.
- Optional checkbox to roll back file changes for that task (`rollbackMode: task`).

## Read-only mode

When started with `--read-only`, all mutating actions are disabled:
- Approve, reprove, cancel buttons are blocked at the API level (HTTP 405).
- Use this mode for passive monitoring.

## API endpoints

All served by the same process as `synx ui`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Engine health check |
| `GET` | `/api/overview` | Engine status + task counters |
| `GET` | `/api/tasks` | Task list (filters: `status`, `project`, `q`) |
| `GET` | `/api/tasks/:id` | Task detail |
| `GET` | `/api/review-queue` | Tasks in `waiting_human` |
| `GET` | `/api/stream` | SSE stream of runtime events |
| `POST` | `/api/tasks/:id/approve` | Approve task |
| `POST` | `/api/tasks/:id/reprove` | Reprove task (body: `reason`, `rollbackMode`) |
| `POST` | `/api/tasks/:id/cancel` | Cancel task (body: `reason`) |
| `POST` | `/api/runtime/pause` | Pause engine |
| `POST` | `/api/runtime/resume` | Resume engine |
| `POST` | `/api/runtime/stop` | Stop engine |

All responses follow `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank task list | Confirm `.ai-agents/tasks/` exists in the current repo. |
| No live events in Stream | Check that `synx start` is running and `.ai-agents/logs/runtime-events.jsonl` exists. |
| Actions rejected | Check if UI was started with `--read-only`. |
| Port in use | Use `synx ui --port 4318` or another free port. |
