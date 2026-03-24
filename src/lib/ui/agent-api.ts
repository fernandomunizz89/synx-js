import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { agentTaskInputSchema, nemoActionInputSchema } from "../schema.js";
import { buildObservation } from "../agent-api/observation.js";
import { getOpenApiSpec, getToolDefinitions } from "../agent-api/tool-definitions.js";
import { dispatchNemoAction, generateColangSample, listNemoActions } from "../agent-api/nemo-adapter.js";
import { approveTaskService, createTaskService, reproveTaskService } from "../services/task-services.js";
import { getOverview, getTaskDetail, listReviewQueue, listTaskSummaries } from "../observability/queries.js";
import { exists, readText } from "../fs.js";
import { logsDir } from "../paths.js";

export interface AgentApiHandlerOptions {
  enableMutations: boolean;
  bearerToken?: string;
}

interface AgentApiHttpErrorPayload {
  ok: false;
  error: string;
  [key: string]: unknown;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function checkBearer(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
  } catch {
    return false;
  }
}

function isValidTaskType(value: string): value is "Feature" | "Bug" | "Refactor" | "Research" | "Documentation" | "Mixed" | "Project" {
  return ["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed", "Project"].includes(value);
}

function deriveBaseUrl(req: http.IncomingMessage): string {
  const host = normalizeString(req.headers.host) || "localhost:4317";
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const protocol = normalizeString(proto) || "http";
  return `${protocol}://${host}`;
}

function webhookContract(): Record<string, unknown> {
  return {
    ok: true,
    data: {
      eventHeader: "X-Synx-Event",
      taskHeader: "X-Synx-Task-Id",
      events: [
        "task.created",
        "task.approved",
        "task.reproved",
        "task.failed",
        "task.review_required",
        "task.cancel_requested",
      ],
      payload: {
        event: "task.approved",
        taskId: "task-20260324-sample",
        timestamp: "2026-03-24T12:00:00.000Z",
        data: {},
      },
    },
  };
}

function runtimeEventContract(): Record<string, unknown> {
  return {
    ok: true,
    data: {
      streamFile: ".ai-agents/logs/runtime-events.jsonl",
      eventShape: {
        at: "2026-03-24T12:00:00.000Z",
        event: "task.updated",
        taskId: "task-20260324-sample",
        stage: "synx-qa-engineer",
        agent: "Synx QA Engineer",
        source: "task-service",
        payload: {},
      },
      notes: [
        "Use /api/v1/agent/events/recent for polling-based ingestion.",
        "Use /api/stream for SSE events in interactive clients.",
      ],
    },
  };
}

async function readRecentRuntimeEvents(limit: number): Promise<Record<string, unknown>[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const filePath = path.join(logsDir(), "runtime-events.jsonl");
  if (!(await exists(filePath))) return [];
  const raw = await readText(filePath);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-safeLimit)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return parsed;
      } catch {
        return { event: "malformed_runtime_event", raw: line };
      }
    });
}

function buildProjectGraphPayload(projectId: string, tasks: Awaited<ReturnType<typeof listTaskSummaries>>): Record<string, unknown> | null {
  const rootTask = tasks.find((task) => task.taskId === projectId);
  if (!rootTask) return null;

  const rootProjectId = rootTask.rootProjectId || rootTask.taskId;
  const projectTasks = tasks.filter((task) => task.taskId === rootProjectId || task.rootProjectId === rootProjectId);
  const taskIdSet = new Set(projectTasks.map((task) => task.taskId));

  const nodes = projectTasks.map((task) => ({
    taskId: task.taskId,
    title: task.title,
    type: task.type,
    status: task.status,
    parentTaskId: task.parentTaskId,
    rootProjectId: task.rootProjectId,
    sourceKind: task.sourceKind,
    ready: task.ready,
    priority: task.priority,
    milestone: task.milestone,
    parallelizable: task.parallelizable,
    dependsOn: task.dependsOn,
    blockedBy: task.blockedBy,
    ownershipBoundaries: task.ownershipBoundaries,
    mergeStrategy: task.mergeStrategy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  const edges: Array<{ from: string; to: string; kind: "parent" | "depends_on" | "blocked_by" }> = [];
  for (const task of projectTasks) {
    if (task.parentTaskId && taskIdSet.has(task.parentTaskId)) {
      edges.push({ from: task.parentTaskId, to: task.taskId, kind: "parent" });
    }
    for (const dependencyId of task.dependsOn || []) {
      if (taskIdSet.has(dependencyId)) {
        edges.push({ from: dependencyId, to: task.taskId, kind: "depends_on" });
      }
    }
    for (const blockerId of task.blockedBy || []) {
      if (taskIdSet.has(blockerId)) {
        edges.push({ from: blockerId, to: task.taskId, kind: "blocked_by" });
      }
    }
  }

  return {
    projectId: rootProjectId,
    requestedProjectId: projectId,
    generatedAt: new Date().toISOString(),
    summary: rootTask.projectProgress || null,
    nodes,
    edges,
  };
}

export async function handleAgentApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  options: AgentApiHandlerOptions,
): Promise<boolean> {
  const isAgentRoute = pathname.startsWith("/api/v1/agent/");
  const isNemoRoute = pathname.startsWith("/api/v1/nemo/");
  if (!isAgentRoute && !isNemoRoute) return false;

  if (options.bearerToken) {
    const ok = checkBearer(req, options.bearerToken);
    if (!ok) {
      res.statusCode = 401;
      res.setHeader("WWW-Authenticate", 'Bearer realm="synx"');
      sendJson(res, 401, { ok: false, error: "Unauthorized." } satisfies AgentApiHttpErrorPayload);
      return true;
    }
  }

  const incomingUrl = new URL(req.url || pathname || "/", "http://localhost");

  try {
    if (method === "GET" && pathname === "/api/v1/agent/tools") {
      sendJson(res, 200, { ok: true, data: getToolDefinitions() });
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/openapi.json") {
      sendJson(res, 200, getOpenApiSpec(deriveBaseUrl(req)));
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/status") {
      const overview = await getOverview();
      sendJson(res, 200, {
        ok: true,
        observation: {
          needsAction: false,
          nextPollMs: 30_000,
          message: "System status.",
          output: overview,
        },
      });
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/tasks") {
      const statusFilter = normalizeString(incomingUrl.searchParams.get("status"));
      const projectFilter = normalizeString(incomingUrl.searchParams.get("project"));
      const queryFilter = normalizeString(incomingUrl.searchParams.get("q")).toLowerCase();
      let tasks = await listTaskSummaries();
      if (statusFilter) tasks = tasks.filter((task) => task.status === statusFilter);
      if (projectFilter) tasks = tasks.filter((task) => task.project === projectFilter);
      if (queryFilter) {
        tasks = tasks.filter((task) =>
          task.taskId.toLowerCase().includes(queryFilter)
          || task.title.toLowerCase().includes(queryFilter)
          || task.project.toLowerCase().includes(queryFilter));
      }
      sendJson(res, 200, { ok: true, data: tasks });
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/agent/tasks") {
      if (!options.enableMutations) {
        sendJson(res, 405, { ok: false, error: "Mutations are disabled." } satisfies AgentApiHttpErrorPayload);
        return true;
      }

      const body = await parseJsonBody(req);
      const parsed = agentTaskInputSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { ok: false, issues: parsed.error.issues });
        return true;
      }

      const taskType = parsed.data.typeHint;
      const created = await createTaskService({
        title: parsed.data.title,
        rawRequest: parsed.data.rawRequest,
        typeHint: isValidTaskType(taskType) ? taskType : "Feature",
        project: parsed.data.project,
        extraContext: {
          relatedFiles: parsed.data.relatedFiles,
          logs: [],
          notes: parsed.data.notes,
          qaPreferences: {
            e2ePolicy: parsed.data.e2ePolicy,
          },
        },
      });

      const detail = await getTaskDetail(created.taskId);
      sendJson(res, 201, buildObservation(detail, created.taskId));
      return true;
    }

    // Keep this route above task-id route.
    if (method === "GET" && pathname === "/api/v1/agent/tasks/pending-review") {
      sendJson(res, 200, { ok: true, data: await listReviewQueue() });
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/contracts/webhooks") {
      sendJson(res, 200, webhookContract());
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/contracts/events") {
      sendJson(res, 200, runtimeEventContract());
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/agent/events/recent") {
      const limitRaw = Number(incomingUrl.searchParams.get("limit") || "100");
      const events = await readRecentRuntimeEvents(limitRaw);
      sendJson(res, 200, { ok: true, data: { events } });
      return true;
    }

    const projectGraphMatch = pathname.match(/^\/api\/v1\/agent\/projects\/([^/]+)\/graph$/);
    if (method === "GET" && projectGraphMatch) {
      const requestedProjectId = decodeURIComponent(projectGraphMatch[1]);
      const tasks = await listTaskSummaries();
      const payload = buildProjectGraphPayload(requestedProjectId, tasks);
      if (!payload) {
        sendJson(res, 404, { ok: false, error: "Project not found." } satisfies AgentApiHttpErrorPayload);
        return true;
      }
      sendJson(res, 200, { ok: true, data: payload });
      return true;
    }

    const taskMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)$/);
    if (method === "GET" && taskMatch) {
      const taskId = decodeURIComponent(taskMatch[1]);
      const detail = await getTaskDetail(taskId);
      if (!detail) {
        sendJson(res, 404, { ok: false, error: "Task not found." } satisfies AgentApiHttpErrorPayload);
        return true;
      }
      sendJson(res, 200, buildObservation(detail, taskId));
      return true;
    }

    const approveMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/approve$/);
    if (method === "POST" && approveMatch) {
      if (!options.enableMutations) {
        sendJson(res, 405, { ok: false, error: "Mutations are disabled." } satisfies AgentApiHttpErrorPayload);
        return true;
      }
      const taskId = decodeURIComponent(approveMatch[1]);
      await approveTaskService(taskId);
      const detail = await getTaskDetail(taskId);
      sendJson(res, 200, buildObservation(detail, taskId));
      return true;
    }

    const reproveMatch = pathname.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/reprove$/);
    if (method === "POST" && reproveMatch) {
      if (!options.enableMutations) {
        sendJson(res, 405, { ok: false, error: "Mutations are disabled." } satisfies AgentApiHttpErrorPayload);
        return true;
      }
      const taskId = decodeURIComponent(reproveMatch[1]);
      const body = await parseJsonBody(req);
      const reason = normalizeString(body.reason);
      if (!reason) {
        sendJson(res, 400, { ok: false, error: "reason is required." } satisfies AgentApiHttpErrorPayload);
        return true;
      }
      await reproveTaskService({ taskId, reason });
      const detail = await getTaskDetail(taskId);
      sendJson(res, 200, buildObservation(detail, taskId));
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/nemo/actions") {
      sendJson(res, 200, { ok: true, data: listNemoActions() });
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/nemo/actions/colang-sample") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(generateColangSample(deriveBaseUrl(req)));
      return true;
    }

    const nemoActionMatch = pathname.match(/^\/api\/v1\/nemo\/actions\/([^/]+)$/);
    if (method === "POST" && nemoActionMatch) {
      const actionName = decodeURIComponent(nemoActionMatch[1]);
      const body = await parseJsonBody(req);
      const parsed = nemoActionInputSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { ok: false, issues: parsed.error.issues });
        return true;
      }
      const result = await dispatchNemoAction(actionName, parsed.data.parameters, {
        enableMutations: options.enableMutations,
      });
      sendJson(res, 200, { ok: true, data: result.output_data });
      return true;
    }

    sendJson(res, 404, { ok: false, error: "Not found." } satisfies AgentApiHttpErrorPayload);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected agent API error.";
    const status = message === "Invalid JSON body." ? 400 : 500;
    sendJson(res, status, { ok: false, error: message } satisfies AgentApiHttpErrorPayload);
    return true;
  }
}
