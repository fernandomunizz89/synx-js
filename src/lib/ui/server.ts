import http from "node:http";
import { URL } from "node:url";
import { approveTaskService, cancelTaskService, reproveTaskService } from "../services/task-services.js";
import { getMetricsOverview, getOverview, getTaskDetail, listReviewQueue, listTaskSummaries } from "../observability/queries.js";
import { applyTaskRollback } from "../services/task-rollback.js";
import { loadTaskMeta } from "../task.js";
import { createUiRealtime, type UiStreamEvent } from "./realtime.js";
import { writeRuntimeControl } from "../runtime.js";
import {
  getAdvancedAnalyticsReport,
  getAgentConsumptionRanking,
  getMetricsTimeline,
  getProjectConsumptionRanking,
  getTaskConsumptionRanking,
} from "../observability/analytics.js";
import { parseHumanInputCommand, parseInlineCommand, type InlineCommand } from "../start-inline-command.js";
import { runInlineCommand } from "../start/command-handler.js";

export interface UiServerOptions {
  host?: string;
  port?: number;
  html?: string;
  enableMutations?: boolean;
}

export interface StartedUiServer {
  host: string;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

interface ApiErrorPayload {
  ok: false;
  error: string;
}

interface ApiSuccessPayload<T> {
  ok: true;
  data: T;
}

class UiHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson<T>(res: http.ServerResponse, statusCode: number, payload: ApiSuccessPayload<T> | ApiErrorPayload): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function sendSseEvent(res: http.ServerResponse, event: UiStreamEvent): void {
  const body = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  res.write(body);
}

function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { ok: false, error: "Not found" });
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
    throw new UiHttpError(400, "Invalid JSON body.");
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMutatingInlineCommand(command: InlineCommand): boolean {
  return command.kind === "new"
    || command.kind === "approve"
    || command.kind === "reprove"
    || command.kind === "stop";
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && String((error as { code?: unknown }).code || "") === "ENOENT") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return /\bENOENT\b|no such file or directory/i.test(message);
}

async function assertTaskExists(taskId: string): Promise<void> {
  try {
    await loadTaskMeta(taskId);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new UiHttpError(404, `Task ${taskId} not found.`);
    }
    throw error;
  }
}

export function createUiRequestHandler(options: {
  html: string;
  enableMutations: boolean;
  realtime: ReturnType<typeof createUiRealtime>;
}): http.RequestListener {
  return async (req, res) => {
    try {
      const method = req.method || "GET";
      const incomingUrl = new URL(req.url || "/", "http://localhost");
      const pathname = incomingUrl.pathname;

      if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        sendHtml(res, 200, options.html);
        return;
      }

      if (method === "GET" && pathname === "/api/health") {
        const overview = await getOverview();
        sendJson(res, 200, { ok: true, data: { runtime: overview.runtime, updatedAt: overview.updatedAt } });
        return;
      }

      if (method === "GET" && pathname === "/api/stream") {
        res.statusCode = 200;
        res.setHeader("content-type", "text/event-stream; charset=utf-8");
        res.setHeader("cache-control", "no-cache, no-transform");
        res.setHeader("connection", "keep-alive");
        res.write("retry: 2000\n\n");

        sendSseEvent(res, {
          id: 0,
          at: new Date().toISOString(),
          type: "runtime.updated",
          payload: {
            source: "sse",
            message: "connected",
          },
        });

        const unsubscribe = options.realtime.subscribe((event) => {
          sendSseEvent(res, event);
        });
        const heartbeat = setInterval(() => {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        }, 15_000);
        heartbeat.unref();

        req.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }

      if (method === "GET" && pathname === "/api/overview") {
        sendJson(res, 200, { ok: true, data: await getOverview() });
        return;
      }

      if (method === "GET" && pathname === "/api/tasks") {
        const statusFilter = normalizeString(incomingUrl.searchParams.get("status"));
        const projectFilter = normalizeString(incomingUrl.searchParams.get("project"));
        const textFilter = normalizeString(incomingUrl.searchParams.get("q")).toLowerCase();

        let tasks = await listTaskSummaries();
        if (statusFilter) tasks = tasks.filter((task) => task.status === statusFilter);
        if (projectFilter) tasks = tasks.filter((task) => task.project === projectFilter);
        if (textFilter) {
          tasks = tasks.filter((task) =>
            task.taskId.toLowerCase().includes(textFilter)
            || task.title.toLowerCase().includes(textFilter)
            || task.project.toLowerCase().includes(textFilter));
        }
        sendJson(res, 200, { ok: true, data: tasks });
        return;
      }

      if (method === "GET" && pathname === "/api/review-queue") {
        sendJson(res, 200, { ok: true, data: await listReviewQueue() });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/overview") {
        const hoursRaw = Number(incomingUrl.searchParams.get("hours") || "24");
        const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 24;
        sendJson(res, 200, { ok: true, data: await getMetricsOverview(hours) });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/tasks") {
        const limitRaw = Number(incomingUrl.searchParams.get("limit") || "25");
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
        sendJson(res, 200, { ok: true, data: await getTaskConsumptionRanking(limit) });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/agents") {
        const limitRaw = Number(incomingUrl.searchParams.get("limit") || "25");
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
        sendJson(res, 200, { ok: true, data: await getAgentConsumptionRanking(limit) });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/projects") {
        const limitRaw = Number(incomingUrl.searchParams.get("limit") || "25");
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
        sendJson(res, 200, { ok: true, data: await getProjectConsumptionRanking(limit) });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/timeline") {
        const daysRaw = Number(incomingUrl.searchParams.get("days") || "30");
        const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
        sendJson(res, 200, { ok: true, data: await getMetricsTimeline(days) });
        return;
      }

      if (method === "GET" && pathname === "/api/metrics/advanced") {
        const limitRaw = Number(incomingUrl.searchParams.get("limit") || "25");
        const daysRaw = Number(incomingUrl.searchParams.get("days") || "30");
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
        const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
        sendJson(res, 200, { ok: true, data: await getAdvancedAnalyticsReport({ limit, days }) });
        return;
      }

      const taskRouteMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === "GET" && taskRouteMatch) {
        const taskId = decodeURIComponent(taskRouteMatch[1]);
        const detail = await getTaskDetail(taskId);
        if (!detail) {
          sendJson(res, 404, { ok: false, error: `Task ${taskId} not found.` });
          return;
        }
        sendJson(res, 200, { ok: true, data: detail });
        return;
      }

      const approveMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/approve$/);
      const reproveMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/reprove$/);
      const cancelMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/cancel$/);
      const runtimePauseMatch = pathname === "/api/runtime/pause";
      const runtimeResumeMatch = pathname === "/api/runtime/resume";
      const runtimeStopMatch = pathname === "/api/runtime/stop";
      const commandInputRoute = pathname === "/api/command";

      if (method === "POST" && (approveMatch || reproveMatch || cancelMatch || runtimePauseMatch || runtimeResumeMatch || runtimeStopMatch)) {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
      }

      if (method === "POST" && approveMatch) {
        const taskId = decodeURIComponent(approveMatch[1]);
        await assertTaskExists(taskId);
        await approveTaskService(taskId);
        sendJson(res, 200, { ok: true, data: { taskId, status: "approved" } });
        return;
      }

      if (method === "POST" && reproveMatch) {
        const taskId = decodeURIComponent(reproveMatch[1]);
        await assertTaskExists(taskId);
        const body = await parseJsonBody(req);
        const reason = normalizeString(body.reason);
        const rollbackMode = normalizeString(body.rollbackMode) === "task" ? "task" : "none";
        const rollbackSummary = rollbackMode === "task" ? await applyTaskRollback(taskId) : null;
        const result = await reproveTaskService({ taskId, reason, rollbackMode, rollbackSummary });
        sendJson(res, 200, { ok: true, data: { ...result, status: "reproved", rollbackSummary } });
        return;
      }

      if (method === "POST" && cancelMatch) {
        const taskId = decodeURIComponent(cancelMatch[1]);
        let meta: Awaited<ReturnType<typeof loadTaskMeta>>;
        try {
          meta = await loadTaskMeta(taskId);
        } catch (error) {
          if (isNotFoundError(error)) {
            throw new UiHttpError(404, `Task ${taskId} not found.`);
          }
          throw error;
        }
        if (!["new", "in_progress", "waiting_agent"].includes(meta.status)) {
          throw new UiHttpError(400, `Task ${taskId} is in status '${meta.status}' and cannot be cancelled.`);
        }
        const body = await parseJsonBody(req);
        await cancelTaskService({
          taskId,
          reason: normalizeString(body.reason),
        });
        sendJson(res, 200, { ok: true, data: { taskId, status: "cancel_requested" } });
        return;
      }

      if (method === "POST" && (runtimePauseMatch || runtimeResumeMatch || runtimeStopMatch)) {
        const body = await parseJsonBody(req);
        const reason = normalizeString(body.reason);
        const command = runtimePauseMatch ? "pause" : runtimeResumeMatch ? "resume" : "stop";
        const request = await writeRuntimeControl({
          command,
          requestedBy: "web-ui",
          reason,
        });
        sendJson(res, 200, { ok: true, data: request });
        return;
      }

      if (method === "POST" && commandInputRoute) {
        const body = await parseJsonBody(req);
        const input = normalizeString(body.input);
        const mode = normalizeString(body.mode) === "human" ? "human" : "command";
        if (!input) {
          throw new UiHttpError(400, "Command input is required.");
        }

        const queue = await listReviewQueue();
        const preferredHumanTaskId = normalizeString(body.preferredHumanTaskId) || (queue[0] ? queue[0].taskId : "");
        const parsed = mode === "human"
          ? parseHumanInputCommand(input, preferredHumanTaskId)
          : parseInlineCommand(input, preferredHumanTaskId);

        if (!options.enableMutations && isMutatingInlineCommand(parsed)) {
          throw new UiHttpError(405, "Mutating commands are disabled in read-only mode.");
        }

        const lines: Array<{ level: "info" | "critical"; message: string }> = [];
        let stopRequested = false;
        try {
          await runInlineCommand(parsed, {
            pushEvent: (message, level = "info") => {
              lines.push({ level, message: String(message || "") });
            },
            requestStop: (_signal: NodeJS.Signals) => {
              stopRequested = true;
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Command execution failed.";
          lines.push({ level: "critical", message });
        }

        if (stopRequested) {
          await writeRuntimeControl({
            command: "stop",
            requestedBy: "web-ui-command",
            reason: "stop requested from web command input",
          });
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            input,
            mode,
            parsedKind: parsed.kind,
            preferredHumanTaskId,
            stopRequested,
            lines,
          },
        });
        return;
      }

      if (method === "GET" && pathname.startsWith("/app")) {
        sendHtml(res, 200, options.html);
        return;
      }

      notFound(res);
    } catch (error) {
      if (error instanceof UiHttpError) {
        sendJson(res, error.statusCode, { ok: false, error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}

export async function startUiServer(options: UiServerOptions): Promise<StartedUiServer> {
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 4317;
  const html = options.html || "<!doctype html><html><body><h1>SYNX Web UI</h1></body></html>";
  const enableMutations = Boolean(options.enableMutations);
  const realtime = createUiRealtime();

  const server = http.createServer(createUiRequestHandler({
    html,
    enableMutations,
    realtime,
  }));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const addressInfo = server.address();
  const resolvedPort = typeof addressInfo === "object" && addressInfo ? addressInfo.port : port;

  return {
    host,
    port: resolvedPort,
    baseUrl: `http://${host}:${resolvedPort}`,
    close: async () => {
      realtime.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
