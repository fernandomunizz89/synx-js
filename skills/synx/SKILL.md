# SYNX Agent API Skill

## Purpose

SYNX is a file-based AI coding orchestrator. This skill lets an external agent create tasks, monitor progress, inspect project graphs, and approve or reprove work through the versioned Agent API.

## Setup

- Base URL: set `SYNX_BASE_URL` (default: `http://localhost:4317`)
- Optional auth: set `SYNX_AGENT_TOKEN` and send `Authorization: Bearer <token>` on each request
- All Agent API endpoints use `/api/v1/...`
- Responses use `ok: boolean` at the root

## Task Lifecycle

```text
new -> in_progress -> waiting_agent -> waiting_human -> done
                          |                |
                          |                +-> reproved -> waiting_agent
                          +-> blocked
                          +-> failed
```

## Core Operations

### 1) Create task

```bash
curl -X POST "$SYNX_BASE_URL/api/v1/agent/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN" \
  -d '{"title":"Add dark mode","rawRequest":"Add a dark mode toggle to settings"}'
```

Response shape:

- `{ ok: true, observation: { taskId, status, needsAction, nextPollMs, message } }`

Next step:

- Save `taskId`
- Poll `GET /api/v1/agent/tasks/:id` after `nextPollMs`

### 2) Poll task status

```bash
curl "$SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

Use:

- `observation.nextPollMs` for sleep interval
- `observation.needsAction` to detect review decisions

### 3) List pending review

```bash
curl "$SYNX_BASE_URL/api/v1/agent/tasks/pending-review" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

### 4) Approve task

```bash
curl -X POST "$SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID/approve" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

### 5) Reprove task

```bash
curl -X POST "$SYNX_BASE_URL/api/v1/agent/tasks/$TASK_ID/reprove" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN" \
  -d '{"reason":"Missing loading and error states for API request"}'
```

### 6) Get system status

```bash
curl "$SYNX_BASE_URL/api/v1/agent/status" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

### 7) Inspect project graph

```bash
curl "$SYNX_BASE_URL/api/v1/agent/projects/$PROJECT_TASK_ID/graph" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

### 8) Read contracts

```bash
curl "$SYNX_BASE_URL/api/v1/agent/contracts/webhooks" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"

curl "$SYNX_BASE_URL/api/v1/agent/contracts/events" \
  -H "Authorization: Bearer $SYNX_AGENT_TOKEN"
```

## Polling Pattern

- Always use `observation.nextPollMs` for wait duration
- Do not poll faster than instructed
- If `needsAction: true`, act immediately

## Decision Rules

- If `needsAction: true` and `actionRequired: "approve_or_reprove"`, decide quickly
- Never auto-approve without strong confidence and policy approval
- Reprove only with specific, actionable reason text

## Error Handling

- `400`: invalid input (check `issues` if present)
- `401`: missing/invalid bearer token
- `404`: task or project not found
- `405`: mutations disabled in read-only mode
- `500`: unexpected server issue, retry with backoff when safe

## Hard Constraints

- Never reprove without a non-empty `reason`
- Confirm task existence before approve/reprove
- Respect `nextPollMs` to avoid rate pressure
