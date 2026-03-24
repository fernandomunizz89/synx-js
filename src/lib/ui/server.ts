import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { approveTaskService, cancelTaskService, reproveTaskService, createTaskService } from "../services/task-services.js";
import { getMetricsOverview, getOverview, getTaskDetail, listReviewQueue, listTaskSummaries } from "../observability/queries.js";
import { applyTaskRollback } from "../services/task-rollback.js";
import { loadTaskMeta } from "../task.js";
import { createUiRealtime, type UiStreamEvent } from "./realtime.js";
import { writeRuntimeControl } from "../runtime.js";
import {
  getAdvancedAnalyticsReport,
  getAgentConsumptionRanking,
  getMetricsTimeline,
  getOperationalAnalyticsReport,
  getProjectConsumptionRanking,
  getTaskConsumptionRanking,
} from "../observability/analytics.js";
import { parseHumanInputCommand, parseInlineCommand, type InlineCommand } from "../start-inline-command.js";
import { runInlineCommand } from "../start/command-handler.js";
import { exists, listFiles, readJson, readText, writeJson } from "../fs.js";
import { exportTask } from "../export.js";
import { configDir, globalConfigPath, taskDir } from "../paths.js";
import { loadGlobalConfig, loadLocalProjectConfig, loadResolvedProjectConfig } from "../config.js";
import { globalConfigSchema, localProjectConfigSchema } from "../schema.js";
import { checkProviderHealth, discoverProviderModels } from "../provider-health.js";

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
  [key: string]: unknown;
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

      if (method === "GET" && pathname === "/favicon.ico") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (method === "GET" && pathname === "/ui-assets/task-assistant.react.js") {
        const assetPath = path.join(process.cwd(), "dist", "ui-assets", "task-assistant.react.js");
        if (!(await exists(assetPath))) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const source = await readText(assetPath);
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.end(source);
        return;
      }

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

      if (method === "GET" && pathname === "/api/metrics/operational") {
        const limitRaw = Number(incomingUrl.searchParams.get("limit") || "12");
        const daysRaw = Number(incomingUrl.searchParams.get("days") || "30");
        const fromRaw = normalizeString(incomingUrl.searchParams.get("from"));
        const toRaw = normalizeString(incomingUrl.searchParams.get("to"));
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 12;
        const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
        const parseTs = (value: string): number | undefined => {
          if (!value) return undefined;
          const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
          const ms = Date.parse(normalized);
          return Number.isFinite(ms) ? ms : undefined;
        };
        const fromMs = parseTs(fromRaw);
        const toMs = parseTs(toRaw);
        sendJson(res, 200, { ok: true, data: await getOperationalAnalyticsReport({ limit, days, fromMs, toMs }) });
        return;
      }

      const artifactRouteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/artifact$/);
      if (method === "GET" && artifactRouteMatch) {
        const taskId = decodeURIComponent(artifactRouteMatch[1]);
        const scope = normalizeString(incomingUrl.searchParams.get("scope"));
        const name = normalizeString(incomingUrl.searchParams.get("name"));
        if (!name) {
          sendJson(res, 400, { ok: false, error: "Artifact name is required." });
          return;
        }
        if (name.includes("..") || name.includes("/") || name.includes("\\")) {
          sendJson(res, 400, { ok: false, error: "Invalid artifact name." });
          return;
        }

        const scopeDir = scope === "views"
          ? "views"
          : scope === "artifacts"
          ? "artifacts"
          : scope === "done"
          ? "done"
          : scope === "human"
          ? "human"
          : "";
        if (!scopeDir) {
          sendJson(res, 400, { ok: false, error: "Invalid artifact scope." });
          return;
        }

        const artifactPath = path.join(taskDir(taskId), scopeDir, name);
        if (!(await exists(artifactPath))) {
          sendJson(res, 404, { ok: false, error: `Artifact ${name} not found in ${scopeDir}.` });
          return;
        }

        const content = await readText(artifactPath);
        sendJson(res, 200, {
          ok: true,
          data: {
            taskId,
            scope: scopeDir,
            name,
            content,
          },
        });
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
        const rollbackStep = normalizeString(body.rollbackStep);
        const rollbackMode = normalizeString(body.rollbackMode) === "task" ? "task" : "none";
        const rollbackSummary = rollbackMode === "task" ? await applyTaskRollback(taskId) : null;
        const result = await reproveTaskService({ taskId, reason, rollbackMode, rollbackStep, rollbackSummary });
        sendJson(res, 200, { ok: true, data: { ...result, status: "reproved", rollbackSummary, rollbackStep } });
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

      // ── POST /api/provider-health ─────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/provider-health") {
        const config = await loadResolvedProjectConfig();
        const results: Record<string, unknown> = {};

        if (config.providers.dispatcher) {
          results["dispatcher"] = await checkProviderHealth(config.providers.dispatcher);
        }
        if (config.providers.planner) {
          results["planner"] = await checkProviderHealth(config.providers.planner);
        }

        const agentEntries = Object.entries(config.agentProviders ?? {}).slice(0, 3);
        const agentResults: Record<string, unknown> = {};
        for (const [agentName, agentConfig] of agentEntries) {
          if (agentConfig) {
            agentResults[agentName] = await checkProviderHealth(agentConfig);
          }
        }
        results["agents"] = agentResults;

        sendJson(res, 200, { ok: true, data: results });
        return;
      }

      // ── GET /api/config ───────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/config") {
        const [global, local] = await Promise.all([
          loadGlobalConfig().catch(() => null),
          loadLocalProjectConfig().catch(() => null),
        ]);
        sendJson(res, 200, { ok: true, data: { global, local } });
        return;
      }

      // ── POST /api/config ──────────────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/config") {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
        const body = await parseJsonBody(req);
        const projectConfigPath = `${configDir()}/project.json`;
        let raw: Record<string, unknown> = {};
        try {
          raw = await readJson<Record<string, unknown>>(projectConfigPath);
        } catch {
          // file may not exist; will create/update
        }
        // Allow only safe runtime-settable fields
        if ("autoApproveThreshold" in body) {
          const v = body.autoApproveThreshold;
          raw.autoApproveThreshold = typeof v === "number" ? Math.min(1, Math.max(0, v)) : undefined;
          if (raw.autoApproveThreshold === undefined) delete raw.autoApproveThreshold;
        }
        const validated = localProjectConfigSchema.parse(raw);
        await writeJson(projectConfigPath, validated);
        sendJson(res, 200, { ok: true, data: validated });
        return;
      }

      // ── POST /api/setup ──────────────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/setup") {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
        const body = await parseJsonBody(req);
        const providerType = normalizeString(body.providerType);
        const humanReviewer = normalizeString(body.humanReviewer);
        const model = normalizeString(body.model);
        // FIX #1: distinguish "key not sent" (preserve) from "key sent as empty" (also preserve — no explicit clear)
        const apiKeyFromBody = "apiKey" in body ? normalizeString(body.apiKey) : null;
        const baseUrl = normalizeString(body.baseUrl);
        const force = body.force === true;

        const validProviderTypes = ["mock", "lmstudio", "openai-compatible", "google", "anthropic"];
        if (!validProviderTypes.includes(providerType)) {
          sendJson(res, 400, { ok: false, error: "Invalid providerType." }); return;
        }
        if (!humanReviewer) {
          sendJson(res, 400, { ok: false, error: "humanReviewer is required." }); return;
        }
        if (providerType !== "mock" && !model) {
          sendJson(res, 400, { ok: false, error: "model is required for non-mock providers." }); return;
        }

        const globalPath = globalConfigPath();
        const projectPath = `${configDir()}/project.json`;

        let rawGlobal: Record<string, unknown> = {};
        try { rawGlobal = await readJson<Record<string, unknown>>(globalPath); } catch { /* first-time */ }
        let rawLocal: Record<string, unknown> = {};
        try { rawLocal = await readJson<Record<string, unknown>>(projectPath); } catch { /* first-time */ }

        type ProviderCfg = { type: string; model: string; baseUrlEnv?: string; apiKeyEnv?: string; baseUrl?: string; apiKey?: string };
        type GlobalShape = { providers?: { dispatcher?: ProviderCfg; planner?: ProviderCfg }; agentProviders?: Record<string, ProviderCfg>; defaults?: Record<string, unknown> };
        const existingGlobal = rawGlobal as GlobalShape;
        const existingDispatcher = existingGlobal.providers?.dispatcher;

        // FIX #7: clearApiKey flag explicitly removes stored key
        const clearApiKey = body.clearApiKey === true;

        // FIX #1: If no new key was sent, preserve the stored key when provider type matches
        function resolveApiKey(newKey: string | null, existing?: ProviderCfg, newType?: string): string {
          if (clearApiKey) return "";                                      // explicit clear
          if (newKey) return newKey;                                       // new key provided
          if (existing?.type === newType && existing?.apiKey) return existing.apiKey; // preserve
          return "";
        }

        function buildCfg(pType: string, pModel: string, pApiKey: string, pBaseUrl: string): ProviderCfg {
          if (pType === "mock") {
            return { type: "mock", model: "mock-dispatcher-v1", baseUrlEnv: "AI_AGENTS_OPENAI_BASE_URL", apiKeyEnv: "AI_AGENTS_OPENAI_API_KEY" };
          }
          const base: ProviderCfg = { type: pType, model: pModel };
          if (pType === "lmstudio") {
            base.baseUrlEnv = "AI_AGENTS_LMSTUDIO_BASE_URL";
            base.apiKeyEnv  = "AI_AGENTS_LMSTUDIO_API_KEY";
            if (pBaseUrl) base.baseUrl = pBaseUrl;
          } else if (pType === "google") {
            base.baseUrlEnv = "AI_AGENTS_GOOGLE_BASE_URL";
            base.apiKeyEnv  = "AI_AGENTS_GOOGLE_API_KEY";
            base.baseUrl = pBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
            if (pApiKey) base.apiKey = pApiKey;
          } else if (pType === "anthropic") {
            base.baseUrlEnv = "AI_AGENTS_ANTHROPIC_BASE_URL";
            base.apiKeyEnv  = "AI_AGENTS_ANTHROPIC_API_KEY";
            base.baseUrl = pBaseUrl || "https://api.anthropic.com";
            if (pApiKey) base.apiKey = pApiKey;
          } else {
            base.baseUrlEnv = "AI_AGENTS_OPENAI_BASE_URL";
            base.apiKeyEnv  = "AI_AGENTS_OPENAI_API_KEY";
            if (pBaseUrl) base.baseUrl = pBaseUrl;
            if (pApiKey) base.apiKey = pApiKey;
          }
          return base;
        }

        const dispApiKey = resolveApiKey(apiKeyFromBody, existingDispatcher, providerType);
        const providerConfig = buildCfg(providerType, model, dispApiKey, baseUrl);

        // FIX #4: health check before saving (bypass with force:true)
        if (providerType !== "mock" && !force) {
          const health = await checkProviderHealth(providerConfig as Parameters<typeof checkProviderHealth>[0]);
          if (!health.reachable) {
            sendJson(res, 422, { ok: false, error: `Provider unreachable: ${health.message}`, healthResult: health });
            return;
          }
        }

        // FIX #3: per-expert agentProviders
        const agentProvidersInput = Array.isArray(body.agentProviders)
          ? (body.agentProviders as Array<Record<string, unknown>>)
          : [];
        const existingAgentProviders: Record<string, ProviderCfg> = { ...(existingGlobal.agentProviders ?? {}) };
        for (const entry of agentProvidersInput) {
          const agentName = normalizeString(entry.agentName as string);
          if (!agentName) continue;
          if (entry.reset === true) { delete existingAgentProviders[agentName]; continue; }
          const aPType = normalizeString(entry.providerType as string);
          const aModel = normalizeString(entry.model as string);
          const aApiKey = "apiKey" in entry ? normalizeString(entry.apiKey as string) : null;
          const aBaseUrl = normalizeString(entry.baseUrl as string);
          if (!validProviderTypes.includes(aPType)) continue;
          if (aPType !== "mock" && !aModel) continue;
          const resolvedAgentKey = resolveApiKey(aApiKey, existingAgentProviders[agentName], aPType);
          existingAgentProviders[agentName] = buildCfg(aPType, aModel, resolvedAgentKey, aBaseUrl);
        }

        // FIX #8: separate planner config
        const plannerSeparate = body.plannerSeparate === true;
        let plannerConfig = providerConfig;
        if (plannerSeparate) {
          const plannerType    = normalizeString(body.plannerProviderType) || providerType;
          const plannerModel   = normalizeString(body.plannerModel)        || model;
          const plannerKeyBody = "plannerApiKey" in body ? normalizeString(body.plannerApiKey) : null;
          const plannerBaseUrl = normalizeString(body.plannerBaseUrl);
          const existingPlanner = existingGlobal.providers?.planner as ProviderCfg | undefined;
          const plannerApiKey  = resolveApiKey(plannerKeyBody, existingPlanner, plannerType);
          plannerConfig = buildCfg(plannerType, plannerModel, plannerApiKey, plannerBaseUrl);
        }

        const updatedGlobal = {
          ...existingGlobal,
          providers: { dispatcher: providerConfig, planner: plannerConfig },
          defaults: { ...(existingGlobal.defaults ?? {}), humanReviewer },
          ...(Object.keys(existingAgentProviders).length > 0 ? { agentProviders: existingAgentProviders } : {}),
        };
        const validatedGlobal = globalConfigSchema.parse(updatedGlobal);

        // FIX #2: null = explicitly cleared, undefined = not sent (keep existing), number = update
        const autoApproveThresholdRaw = body.autoApproveThreshold;
        const updatedLocal: Record<string, unknown> = { ...(rawLocal as Record<string, unknown>), humanReviewer };
        if (typeof autoApproveThresholdRaw === "number") {
          updatedLocal.autoApproveThreshold = Math.min(1, Math.max(0, autoApproveThresholdRaw));
        } else if (autoApproveThresholdRaw === null) {
          delete updatedLocal.autoApproveThreshold;
        }
        const validatedLocal = localProjectConfigSchema.parse(updatedLocal);

        await writeJson(globalPath, validatedGlobal);
        await writeJson(projectPath, validatedLocal);
        sendJson(res, 200, { ok: true, data: { providerType, humanReviewer, model: providerConfig.model } });
        return;
      }

      // ── POST /api/setup/discover-models ──────────────────────────────────────
      if (method === "POST" && pathname === "/api/setup/discover-models") {
        const body = await parseJsonBody(req);
        const providerType = normalizeString(body.providerType);
        const apiKeyFromBody = normalizeString(body.apiKey);
        const baseUrl = normalizeString(body.baseUrl);

        const discoverableTypes = ["lmstudio", "openai-compatible", "google", "anthropic"];
        if (!discoverableTypes.includes(providerType)) {
          sendJson(res, 400, { ok: false, error: "Invalid providerType for discovery." }); return;
        }

        type DiscoveryCfg = { type: string; model: string; baseUrlEnv?: string; apiKeyEnv?: string; baseUrl?: string; apiKey?: string };
        const cfg: DiscoveryCfg = { type: providerType, model: "any" };
        if (baseUrl) cfg.baseUrl = baseUrl;
        if (providerType === "lmstudio") {
          cfg.baseUrlEnv = "AI_AGENTS_LMSTUDIO_BASE_URL";
          cfg.apiKeyEnv  = "AI_AGENTS_LMSTUDIO_API_KEY";
        } else if (providerType === "google") {
          cfg.baseUrlEnv = "AI_AGENTS_GOOGLE_BASE_URL";
          cfg.apiKeyEnv  = "AI_AGENTS_GOOGLE_API_KEY";
        } else if (providerType === "anthropic") {
          cfg.baseUrlEnv = "AI_AGENTS_ANTHROPIC_BASE_URL";
          cfg.apiKeyEnv  = "AI_AGENTS_ANTHROPIC_API_KEY";
        } else {
          cfg.baseUrlEnv = "AI_AGENTS_OPENAI_BASE_URL";
          cfg.apiKeyEnv  = "AI_AGENTS_OPENAI_API_KEY";
        }

        // Prefer key sent in body; fall back to stored key for the same provider
        if (apiKeyFromBody) {
          cfg.apiKey = apiKeyFromBody;
        } else {
          const globalPath = globalConfigPath();
          let rawGlobal: Record<string, unknown> = {};
          try { rawGlobal = await readJson<Record<string, unknown>>(globalPath); } catch { /* ignore */ }
          type GShape = { providers?: { dispatcher?: DiscoveryCfg } };
          const eg = rawGlobal as GShape;
          if (eg.providers?.dispatcher?.type === providerType && eg.providers.dispatcher.apiKey) {
            cfg.apiKey = eg.providers.dispatcher.apiKey;
          }
        }

        const discovery = await discoverProviderModels(cfg as Parameters<typeof discoverProviderModels>[0]);
        sendJson(res, 200, { ok: true, data: discovery });
        return;
      }

      // ── GET /api/tasks/:id/export ─────────────────────────────────────────────
      const taskExportMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/export$/);
      if (method === "GET" && taskExportMatch) {
        const taskId = decodeURIComponent(taskExportMatch[1]);
        await assertTaskExists(taskId);
        const exported = await exportTask(taskId);
        sendJson(res, 200, { ok: true, data: exported });
        return;
      }

      // ── GET /api/tasks/:id/files ───────────────────────────────────────────────
      const taskFilesMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/files$/);
      if (method === "GET" && taskFilesMatch) {
        const taskId = decodeURIComponent(taskFilesMatch[1]);
        await assertTaskExists(taskId);
        const base = taskDir(taskId);
        const listSafe = async (dir: string): Promise<string[]> => {
          const full = `${base}/${dir}`;
          if (!(await exists(full))) return [];
          const files = await listFiles(full);
          return files.map((f) => f.replace(full + "/", "").replace(full, "")).filter(Boolean);
        };
        const [doneFiles, viewFiles, artifactFiles] = await Promise.all([
          listSafe("done"),
          listSafe("views"),
          listSafe("artifacts"),
        ]);
        sendJson(res, 200, { ok: true, data: { done: doneFiles, views: viewFiles, artifacts: artifactFiles } });
        return;
      }

      // ── POST /api/tasks (individual task, not project) ────────────────────────
      if (method === "POST" && pathname === "/api/tasks") {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
        const body = await parseJsonBody(req);
        const title = normalizeString(body.title);
        const rawRequest = normalizeString(body.rawRequest || body.description);
        const typeHint = normalizeString(body.typeHint) || "Feature";
        const e2ePolicy = normalizeString(body.e2ePolicy) || "auto";
        if (!title) {
          sendJson(res, 400, { ok: false, error: "title is required." });
          return;
        }
        if (!rawRequest) {
          sendJson(res, 400, { ok: false, error: "rawRequest is required." });
          return;
        }
        const validTypes = ["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed", "Project"];
        const safeTypeHint = validTypes.includes(typeHint) ? typeHint : "Feature";
        const relatedFiles = Array.isArray(body.relatedFiles)
          ? (body.relatedFiles as unknown[]).map(String).filter(Boolean)
          : [];
        const notes = Array.isArray(body.notes)
          ? (body.notes as unknown[]).map(String).filter(Boolean)
          : [];
        const project = normalizeString(body.project) || undefined;
        const created = await createTaskService({
          title,
          typeHint: safeTypeHint as "Feature" | "Bug" | "Refactor" | "Research" | "Documentation" | "Mixed" | "Project",
          rawRequest,
          project,
          extraContext: {
            relatedFiles,
            logs: [],
            notes,
            qaPreferences: { e2ePolicy: e2ePolicy as "auto" | "required" | "skip", e2eFramework: "auto", objective: "" },
          },
        });
        sendJson(res, 200, { ok: true, data: { taskId: created.taskId, taskPath: created.taskPath } });
        return;
      }

      if (method === "POST" && pathname === "/api/project") {
        if (!options.enableMutations) {
          sendJson(res, 405, { ok: false, error: "Mutating actions are disabled in read-only mode." });
          return;
        }
        const body = await parseJsonBody(req);
        const prompt = normalizeString(body.prompt);
        if (!prompt) {
          sendJson(res, 400, { ok: false, error: "prompt is required." });
          return;
        }
        const created = await createTaskService({
          title: prompt.length > 120 ? prompt.slice(0, 117) + "..." : prompt,
          typeHint: "Project",
          rawRequest: prompt,
          extraContext: {
            relatedFiles: [],
            logs: [],
            notes: [],
            qaPreferences: { e2ePolicy: "auto", e2eFramework: "auto", objective: "" },
          },
        });
        sendJson(res, 200, { ok: true, data: { taskId: created.taskId, taskPath: created.taskPath } });
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
