import http from "node:http";
import { URL } from "node:url";
import { approveTaskService, cancelTaskService, reproveTaskService } from "../services/task-services.js";
import { getMetricsOverview, getOverview, getTaskDetail, listReviewQueue, listTaskSummaries } from "../observability/queries.js";

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
    throw new Error("Invalid JSON body.");
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createUiRequestHandler(options: {
  html: string;
  enableMutations: boolean;
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

      if (method === "POST" && (approveMatch || reproveMatch || cancelMatch)) {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
      }

      if (method === "POST" && approveMatch) {
        const taskId = decodeURIComponent(approveMatch[1]);
        await approveTaskService(taskId);
        sendJson(res, 200, { ok: true, data: { taskId, status: "approved" } });
        return;
      }

      if (method === "POST" && reproveMatch) {
        const taskId = decodeURIComponent(reproveMatch[1]);
        const body = await parseJsonBody(req);
        const reason = normalizeString(body.reason);
        const rollbackMode = normalizeString(body.rollbackMode) === "task" ? "task" : "none";
        const result = await reproveTaskService({ taskId, reason, rollbackMode });
        sendJson(res, 200, { ok: true, data: { ...result, status: "reproved" } });
        return;
      }

      if (method === "POST" && cancelMatch) {
        const taskId = decodeURIComponent(cancelMatch[1]);
        const body = await parseJsonBody(req);
        await cancelTaskService({
          taskId,
          reason: normalizeString(body.reason),
        });
        sendJson(res, 200, { ok: true, data: { taskId, status: "cancel_requested" } });
        return;
      }

      if (method === "GET" && pathname.startsWith("/app")) {
        sendHtml(res, 200, options.html);
        return;
      }

      notFound(res);
    } catch (error) {
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

  const server = http.createServer(createUiRequestHandler({
    html,
    enableMutations,
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
