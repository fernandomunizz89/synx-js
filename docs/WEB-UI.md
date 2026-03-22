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
