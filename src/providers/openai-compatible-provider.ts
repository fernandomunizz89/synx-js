import type { AgentName, ProviderRequest, ProviderResult, ProviderStageConfig, TaskType } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { extractJsonFromText } from "../lib/utils.js";
import { logProviderParseRetry, logProviderThrottle } from "../lib/logging.js";
import { sleep } from "../lib/utils.js";
import { envBoolean, envNumber, envOptionalNumber } from "../lib/env.js";
import { isTaskCancelRequested } from "../lib/task-cancel.js";
import {
  buildTokenEstimateFromCounts,
  estimateTokensFromChars,
  estimateTokensFromMessages,
} from "../lib/token-estimation.js";
import { buildParseRetryMessages, buildStatelessMessages } from "../lib/provider-messages.js";

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}

interface ProviderCallError extends Error {
  transient: boolean;
  statusCode?: number;
  errorCode?: string;
  retryAfterMs?: number;
  parseRetries?: number;
  validationPassed?: boolean;
  parseRetryAdditionalDurationMs?: number;
  providerAttempts?: number;
  providerBackoffRetries?: number;
  providerBackoffWaitMs?: number;
  providerRateLimitWaitMs?: number;
  providerThrottleReasons?: string[];
}

interface ProviderBackoffSettings {
  maxRetries: number;
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
}

interface ProviderCallOutcome {
  rawText: string;
  attemptsUsed: number;
  backoffRetriesUsed: number;
  rateLimitWaitMs: number;
  backoffWaitMs: number;
  backoffReasons: string[];
}

const DEFAULT_SYSTEM_TEMPERATURE = 0.1;
const VALID_TASK_TYPES: TaskType[] = [
  "Feature",
  "Bug",
  "Refactor",
  "Research",
  "Documentation",
  "Mixed",
];

const AGENT_DEFAULT_TEMPERATURES: Record<AgentName, number> = {
  // Orchestration layer
  "Dispatcher": 0.1,
  "Human Review": 0.1,
  "Project Orchestrator": 0.1,
  // Expert Squad
  "Synx Front Expert": 0.05,
  "Synx Mobile Expert": 0.05,
  "Synx Back Expert": 0.05,
  "Synx QA Engineer": 0.05,
  "Synx SEO Specialist": 0.1,
  // Phase 2 – Extended Squad
  "Synx Code Reviewer": 0.05,
  "Synx DevOps Expert": 0.05,
  // Phase 2.3 / 2.4
  "Synx Security Auditor": 0.05,
  "Synx Documentation Writer": 0.3,
};

const TASK_TYPE_DEFAULT_TEMPERATURES: Record<TaskType, number> = {
  "Feature": 0.1,
  "Bug": 0.05,
  "Refactor": 0.05,
  "Research": 0.2,
  "Documentation": 0.3,
  "Mixed": 0.1,
  "Project": 0.2,
};

const transientStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504]);
const rateLimitWindows = new Map<string, number[]>();
const providerConcurrencyState = new Map<string, { active: number; waiters: Array<() => void> }>();

function normalizeEnvToken(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAgentEnvToken(agent: AgentName | string): string {
  return normalizeEnvToken(agent);
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && VALID_TASK_TYPES.includes(value as TaskType);
}

function inferTaskType(request: ProviderRequest): TaskType | undefined {
  if (isTaskType(request.taskType)) return request.taskType;
  if (!request.input || typeof request.input !== "object") return undefined;

  const source = request.input as { typeHint?: unknown; task?: { typeHint?: unknown } };
  if (isTaskType(source.task?.typeHint)) return source.task?.typeHint;
  if (isTaskType(source.typeHint)) return source.typeHint;
  return undefined;
}

function normalizeTaskTypeEnvToken(taskType: TaskType): string {
  return normalizeEnvToken(taskType);
}

function parseTemperature(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 2) return null;
  return parsed;
}

function readTemperatureOverride(envName: string): number | null {
  return parseTemperature(process.env[envName]);
}

function resolveTemperature(request: ProviderRequest): number {
  const agentToken = normalizeAgentEnvToken(request.agent);
  const taskType = inferTaskType(request);
  const taskToken = taskType ? normalizeTaskTypeEnvToken(taskType) : "";

  if (agentToken && taskToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${agentToken}_${taskToken}`);
    if (value !== null) return value;
  }

  if (agentToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${agentToken}`);
    if (value !== null) return value;
  }

  if (taskToken) {
    const value = readTemperatureOverride(`AI_AGENTS_TEMPERATURE_${taskToken}`);
    if (value !== null) return value;
  }

  if (typeof AGENT_DEFAULT_TEMPERATURES[request.agent as AgentName] === "number") {
    return AGENT_DEFAULT_TEMPERATURES[request.agent as AgentName];
  }

  if (taskType && typeof TASK_TYPE_DEFAULT_TEMPERATURES[taskType] === "number") {
    return TASK_TYPE_DEFAULT_TEMPERATURES[taskType];
  }

  return DEFAULT_SYSTEM_TEMPERATURE;
}

function resolveTimeoutMs(): number {
  return envNumber("AI_AGENTS_PROVIDER_TIMEOUT_MS", 300000, {
    integer: true,
    min: 1,
    max: 1_800_000,
  });
}

function resolveMaxTokens(): number | undefined {
  return envOptionalNumber("AI_AGENTS_OPENAI_MAX_TOKENS", {
    integer: true,
    min: 1,
    max: 200_000,
  });
}

function resolveProviderStreaming(): boolean {
  return envBoolean("AI_AGENTS_PROVIDER_STREAMING", false);
}

function resolveJsonParseRetries(): number {
  return envNumber("AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES", 1, {
    integer: true,
    min: 0,
    max: 2,
  });
}

function resolveMaxRequestsPerMinute(): number {
  return envNumber("AI_AGENTS_PROVIDER_MAX_REQUESTS_PER_MINUTE", 0, {
    integer: true,
    min: 0,
    max: 5000,
  });
}

function resolveRateLimitWindowMs(): number {
  return envNumber("AI_AGENTS_PROVIDER_RATE_LIMIT_WINDOW_MS", 60_000, {
    integer: true,
    min: 200,
    max: 600_000,
  });
}

function resolveMaxConcurrentRequestsPerModel(): number {
  return envNumber("AI_AGENTS_PROVIDER_MAX_CONCURRENT_REQUESTS", 3, {
    integer: true,
    min: 1,
    max: 30,
  });
}

function resolveBackoffSettings(): ProviderBackoffSettings {
  const maxRetries = envNumber("AI_AGENTS_PROVIDER_BACKOFF_MAX_RETRIES", 2, {
    integer: true,
    min: 0,
    max: 6,
  });
  const baseMs = envNumber("AI_AGENTS_PROVIDER_BACKOFF_BASE_MS", 500, {
    integer: true,
    min: 50,
    max: 30_000,
  });
  const maxMsCandidate = envNumber("AI_AGENTS_PROVIDER_BACKOFF_MAX_MS", 8000, {
    integer: true,
    min: baseMs,
    max: 120_000,
  });
  const jitterRatio = envNumber("AI_AGENTS_PROVIDER_BACKOFF_JITTER_RATIO", 0.2, {
    min: 0,
    max: 1,
  });

  return {
    maxRetries,
    baseMs,
    maxMs: maxMsCandidate,
    jitterRatio,
  };
}

function parseRetryAfterMs(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(120000, Math.round(seconds * 1000));
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return undefined;
  const delta = dateMs - Date.now();
  if (delta <= 0) return 0;
  return Math.min(120000, Math.round(delta));
}

function isProviderCallError(value: unknown): value is ProviderCallError {
  return Boolean(value && typeof value === "object" && "transient" in value);
}

function createProviderCallError(args: {
  message: string;
  transient: boolean;
  statusCode?: number;
  errorCode?: string;
  retryAfterMs?: number;
}): ProviderCallError {
  const error = new Error(args.message) as ProviderCallError;
  error.transient = args.transient;
  error.statusCode = args.statusCode;
  error.errorCode = args.errorCode;
  error.retryAfterMs = args.retryAfterMs;
  return error;
}

function toProviderCallError(error: unknown): ProviderCallError {
  if (isProviderCallError(error)) return error;
  if (error instanceof Error) {
    return createProviderCallError({
      message: error.message,
      transient: false,
      errorCode: "unknown_error",
    });
  }
  return createProviderCallError({
    message: String(error),
    transient: false,
    errorCode: "unknown_error",
  });
}

function pruneRateWindow(timestamps: number[], nowMs: number, windowMs: number): void {
  const windowStart = nowMs - windowMs;
  while (timestamps.length && timestamps[0] <= windowStart) {
    timestamps.shift();
  }
}

async function waitForRateLimitSlot(args: {
  key: string;
  maxRequestsPerMinute: number;
  windowMs: number;
}): Promise<number> {
  if (args.maxRequestsPerMinute <= 0) return 0;

  const timestamps = rateLimitWindows.get(args.key) || [];
  let nowMs = Date.now();
  pruneRateWindow(timestamps, nowMs, args.windowMs);

  if (timestamps.length >= args.maxRequestsPerMinute) {
    const waitMs = Math.max(1, (timestamps[0] + args.windowMs) - nowMs);
    await sleep(waitMs);
    nowMs = Date.now();
    pruneRateWindow(timestamps, nowMs, args.windowMs);
    timestamps.push(nowMs);
    rateLimitWindows.set(args.key, timestamps);
    return waitMs;
  }

  timestamps.push(nowMs);
  rateLimitWindows.set(args.key, timestamps);
  return 0;
}

async function waitForProviderConcurrencySlot(args: {
  key: string;
  maxConcurrentRequests: number;
}): Promise<number> {
  const maxConcurrentRequests = Math.max(1, Math.floor(args.maxConcurrentRequests));
  const state = providerConcurrencyState.get(args.key) || { active: 0, waiters: [] };
  providerConcurrencyState.set(args.key, state);

  if (state.active < maxConcurrentRequests) {
    state.active += 1;
    return 0;
  }

  const startedAtMs = Date.now();
  await new Promise<void>((resolve) => {
    state.waiters.push(resolve);
  });
  state.active += 1;
  return Date.now() - startedAtMs;
}

function releaseProviderConcurrencySlot(key: string): void {
  const state = providerConcurrencyState.get(key);
  if (!state) return;

  state.active = Math.max(0, state.active - 1);
  const waiter = state.waiters.shift();
  if (waiter) {
    waiter();
  } else if (state.active === 0) {
    providerConcurrencyState.delete(key);
  }
}

function computeBackoffDelayMs(args: {
  settings: ProviderBackoffSettings;
  retryIndex: number;
  retryAfterMs?: number;
}): number {
  let baseDelayMs: number;
  if (typeof args.retryAfterMs === "number" && args.retryAfterMs >= 0) {
    baseDelayMs = Math.min(args.settings.maxMs, Math.max(args.settings.baseMs, Math.floor(args.retryAfterMs)));
  } else {
    const exponential = args.settings.baseMs * (2 ** Math.max(0, args.retryIndex - 1));
    baseDelayMs = Math.min(args.settings.maxMs, Math.max(args.settings.baseMs, Math.floor(exponential)));
  }

  const jitterSpan = baseDelayMs * args.settings.jitterRatio;
  const jitter = jitterSpan > 0 ? ((Math.random() * 2) - 1) * jitterSpan : 0;
  return Math.max(0, Math.round(baseDelayMs + jitter));
}

function parseFailureReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

interface TaskCancellationWatcher {
  signal?: AbortSignal;
  stop: () => void;
}

function createTaskCancellationWatcher(taskId?: string): TaskCancellationWatcher {
  if (!taskId) {
    return {
      signal: undefined,
      stop: () => undefined,
    };
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let checking = false;

  const checkCancellation = async (): Promise<void> => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const requested = await isTaskCancelRequested(taskId);
      if (requested) controller.abort(`task-cancelled:${taskId}`);
    } catch {
      // Cancellation probing issues should not break provider requests.
    } finally {
      checking = false;
    }
  };

  void checkCancellation();
  timer = setInterval(() => {
    void checkCancellation();
  }, 400);

  return {
    signal: controller.signal,
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

async function callChatCompletionsOnce(args: {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
  payload: Record<string, unknown>;
  cancellationSignal?: AbortSignal;
}): Promise<string> {
  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(args.timeoutMs);
    const signal = args.cancellationSignal ? AbortSignal.any([timeoutSignal, args.cancellationSignal]) : timeoutSignal;
    response = await fetch(`${args.baseUrl}/chat/completions`, {
      method: "POST",
      headers: args.headers,
      signal,
      body: JSON.stringify(args.payload),
    });
  } catch (error) {
    if (args.cancellationSignal?.aborted) {
      throw createProviderCallError({
        message: "Task cancellation requested. Provider call aborted.",
        transient: false,
        errorCode: "task_cancelled",
      });
    }
    const name = error && typeof error === "object" && "name" in error ? (error as { name?: string }).name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw createProviderCallError({
        message: `Provider request timed out after ${args.timeoutMs}ms.`,
        transient: true,
        errorCode: "timeout",
      });
    }
    if (error instanceof Error) {
      const lower = (error.message || "").toLowerCase();
      const likelyConfigIssue = lower.includes("invalid url") || lower.includes("only absolute urls are supported");
      throw createProviderCallError({
        message: error.message || "Provider request failed before receiving a response.",
        transient: !likelyConfigIssue,
        errorCode: likelyConfigIssue ? "invalid_request_config" : "network_error",
      });
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw createProviderCallError({
      message: `Provider request failed with ${response.status}: ${body}`,
      transient: transientStatusCodes.has(response.status),
      statusCode: response.status,
      errorCode: `http_${response.status}`,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
    });
  }

  const json = await response.json() as ChatCompletionsResponse;
  const content = json.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : (content || []).map((item) => item.text || "").join("\n");
}

function extractStreamChunkText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const root = value as {
    choices?: Array<{
      delta?: { content?: string | Array<{ text?: string }> };
      message?: { content?: string | Array<{ text?: string }> };
      text?: string;
    }>;
  };
  const choice = root.choices?.[0];
  if (!choice) return "";

  const fromDelta = choice.delta?.content;
  if (typeof fromDelta === "string") return fromDelta;
  if (Array.isArray(fromDelta)) return fromDelta.map((item) => item?.text || "").join("");

  const fromMessage = choice.message?.content;
  if (typeof fromMessage === "string") return fromMessage;
  if (Array.isArray(fromMessage)) return fromMessage.map((item) => item?.text || "").join("");

  if (typeof choice.text === "string") return choice.text;
  return "";
}

async function callChatCompletionsStreaming(args: {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
  payload: Record<string, unknown>;
  cancellationSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}): Promise<string> {
  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(args.timeoutMs);
    const signal = args.cancellationSignal ? AbortSignal.any([timeoutSignal, args.cancellationSignal]) : timeoutSignal;
    response = await fetch(`${args.baseUrl}/chat/completions`, {
      method: "POST",
      headers: args.headers,
      signal,
      body: JSON.stringify({ ...args.payload, stream: true }),
    });
  } catch (error) {
    if (args.cancellationSignal?.aborted) {
      throw createProviderCallError({
        message: "Task cancellation requested. Provider stream aborted.",
        transient: false,
        errorCode: "task_cancelled",
      });
    }
    const name = error && typeof error === "object" && "name" in error ? (error as { name?: string }).name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw createProviderCallError({
        message: `Provider stream timed out after ${args.timeoutMs}ms.`,
        transient: true,
        errorCode: "timeout",
      });
    }
    if (error instanceof Error) {
      const lower = (error.message || "").toLowerCase();
      const likelyConfigIssue = lower.includes("invalid url") || lower.includes("only absolute urls are supported");
      throw createProviderCallError({
        message: error.message || "Provider streaming request failed before receiving a response.",
        transient: !likelyConfigIssue,
        errorCode: likelyConfigIssue ? "invalid_request_config" : "network_error",
      });
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw createProviderCallError({
      message: `Provider request failed with ${response.status}: ${body}`,
      transient: transientStatusCodes.has(response.status),
      statusCode: response.status,
      errorCode: `http_${response.status}`,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
    });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw createProviderCallError({
      message: "Provider stream response body is not readable.",
      transient: true,
      errorCode: "stream_unreadable",
    });
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as unknown;
        const chunkText = extractStreamChunkText(parsed);
        if (!chunkText) continue;
        fullText += chunkText;
        args.onChunk?.(chunkText);
      } catch {
        // Ignore malformed stream fragments and continue with subsequent chunks.
      }
    }
  }

  return fullText;
}

async function callChatCompletionsWithResilience(args: {
  request: ProviderRequest;
  provider: string;
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
  payload: Record<string, unknown>;
  streamingEnabled: boolean;
  maxRequestsPerMinute: number;
  rateLimitWindowMs: number;
  maxConcurrentRequestsPerModel: number;
  backoff: ProviderBackoffSettings;
  cancellationSignal?: AbortSignal;
}): Promise<ProviderCallOutcome> {
  const maxAttempts = 1 + args.backoff.maxRetries;
  const rateLimitKey = `${args.baseUrl}::${args.model}`;
  let attemptsUsed = 0;
  let backoffRetriesUsed = 0;
  let rateLimitWaitMs = 0;
  let backoffWaitMs = 0;
  const backoffReasons: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsUsed = attempt;

    if (args.maxRequestsPerMinute > 0) {
      const waitedByRateLimit = await waitForRateLimitSlot({
        key: rateLimitKey,
        maxRequestsPerMinute: args.maxRequestsPerMinute,
        windowMs: args.rateLimitWindowMs,
      });
      if (waitedByRateLimit > 0) {
        rateLimitWaitMs += waitedByRateLimit;
        await logProviderThrottle({
          agent: args.request.agent,
          taskId: args.request.taskId,
          stage: args.request.stage,
          provider: args.provider,
          model: args.model,
          event: "rate_limit_wait",
          attempt,
          maxAttempts,
          retriesUsed: backoffRetriesUsed,
          transient: true,
          reason: `Request delayed by local rate limiter window (${args.maxRequestsPerMinute} requests per ${args.rateLimitWindowMs}ms).`,
          waitMs: waitedByRateLimit,
          rateLimitWaitMs,
          backoffWaitMs,
          requestLimit: args.maxRequestsPerMinute,
          rateLimitWindowMs: args.rateLimitWindowMs,
        }).catch(() => undefined);
      }
    }

    const waitedByConcurrency = await waitForProviderConcurrencySlot({
      key: rateLimitKey,
      maxConcurrentRequests: args.maxConcurrentRequestsPerModel,
    });
    if (waitedByConcurrency > 0) {
      rateLimitWaitMs += waitedByConcurrency;
      await logProviderThrottle({
        agent: args.request.agent,
        taskId: args.request.taskId,
        stage: args.request.stage,
        provider: args.provider,
        model: args.model,
        event: "rate_limit_wait",
        attempt,
        maxAttempts,
        retriesUsed: backoffRetriesUsed,
        transient: true,
        reason: `Request delayed by local provider concurrency limiter (${args.maxConcurrentRequestsPerModel} in-flight requests per provider/model).`,
        waitMs: waitedByConcurrency,
        rateLimitWaitMs,
        backoffWaitMs,
        requestLimit: args.maxRequestsPerMinute,
        rateLimitWindowMs: args.rateLimitWindowMs,
      }).catch(() => undefined);
    }

    try {
      try {
        if (args.cancellationSignal?.aborted) {
          throw createProviderCallError({
            message: "Task cancellation requested. Provider call aborted before dispatch.",
            transient: false,
            errorCode: "task_cancelled",
          });
        }
        const rawText = args.streamingEnabled
          ? await callChatCompletionsStreaming({
            baseUrl: args.baseUrl,
            headers: args.headers,
            timeoutMs: args.timeoutMs,
            payload: args.payload,
            cancellationSignal: args.cancellationSignal,
          })
          : await callChatCompletionsOnce({
            baseUrl: args.baseUrl,
            headers: args.headers,
            timeoutMs: args.timeoutMs,
            payload: args.payload,
            cancellationSignal: args.cancellationSignal,
          });

        if (attempt > 1) {
          await logProviderThrottle({
            agent: args.request.agent,
            taskId: args.request.taskId,
            stage: args.request.stage,
            provider: args.provider,
            model: args.model,
            event: "backoff_recovered",
            attempt,
            maxAttempts,
            retriesUsed: backoffRetriesUsed,
            transient: true,
            reason: "Provider recovered after transient failure and backoff.",
            rateLimitWaitMs,
            backoffWaitMs,
            requestLimit: args.maxRequestsPerMinute,
            rateLimitWindowMs: args.rateLimitWindowMs,
          }).catch(() => undefined);
        }

        return {
          rawText,
          attemptsUsed,
          backoffRetriesUsed,
          rateLimitWaitMs,
          backoffWaitMs,
          backoffReasons,
        };
      } catch (rawError) {
        const error = toProviderCallError(rawError);
        const reason = error.message || "Provider request failed.";
        const canRetry = error.transient && attempt < maxAttempts;

        if (!canRetry) {
          await logProviderThrottle({
            agent: args.request.agent,
            taskId: args.request.taskId,
            stage: args.request.stage,
            provider: args.provider,
            model: args.model,
            event: "backoff_exhausted",
            attempt,
            maxAttempts,
            retriesUsed: backoffRetriesUsed,
            transient: Boolean(error.transient),
            statusCode: error.statusCode,
            errorCode: error.errorCode,
            reason,
            rateLimitWaitMs,
            backoffWaitMs,
            requestLimit: args.maxRequestsPerMinute,
            rateLimitWindowMs: args.rateLimitWindowMs,
          }).catch(() => undefined);

          error.providerAttempts = attemptsUsed;
          error.providerBackoffRetries = backoffRetriesUsed;
          error.providerBackoffWaitMs = backoffWaitMs;
          error.providerRateLimitWaitMs = rateLimitWaitMs;
          error.providerThrottleReasons = backoffReasons.slice(-4);
          throw error;
        }

        const waitMs = computeBackoffDelayMs({
          settings: args.backoff,
          retryIndex: backoffRetriesUsed + 1,
          retryAfterMs: error.retryAfterMs,
        });
        backoffReasons.push(reason);

        await logProviderThrottle({
          agent: args.request.agent,
          taskId: args.request.taskId,
          stage: args.request.stage,
          provider: args.provider,
          model: args.model,
          event: "backoff_scheduled",
          attempt,
          maxAttempts,
          retriesUsed: backoffRetriesUsed,
          transient: true,
          statusCode: error.statusCode,
          errorCode: error.errorCode,
          reason,
          waitMs,
          rateLimitWaitMs,
          backoffWaitMs,
          requestLimit: args.maxRequestsPerMinute,
          rateLimitWindowMs: args.rateLimitWindowMs,
        }).catch(() => undefined);

        await sleep(waitMs);
        backoffWaitMs += waitMs;
        backoffRetriesUsed += 1;

        await logProviderThrottle({
          agent: args.request.agent,
          taskId: args.request.taskId,
          stage: args.request.stage,
          provider: args.provider,
          model: args.model,
          event: "backoff_retry",
          attempt: attempt + 1,
          maxAttempts,
          retriesUsed: backoffRetriesUsed,
          transient: true,
          reason: "Retrying provider call after backoff delay.",
          waitMs,
          rateLimitWaitMs,
          backoffWaitMs,
          requestLimit: args.maxRequestsPerMinute,
          rateLimitWindowMs: args.rateLimitWindowMs,
        }).catch(() => undefined);
      }
    } finally {
      releaseProviderConcurrencySlot(rateLimitKey);
    }
  }

  throw createProviderCallError({
    message: "Provider backoff loop exited without a terminal result.",
    transient: false,
    errorCode: "backoff_loop_error",
  });
}

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ProviderStageConfig) {
    const baseUrlEnv = config.baseUrlEnv || "AI_AGENTS_OPENAI_BASE_URL";
    const apiKeyEnv = config.apiKeyEnv || "AI_AGENTS_OPENAI_API_KEY";
    const baseUrl = (config.baseUrl || process.env[baseUrlEnv] || "").trim();
    const apiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();

    if (!baseUrl) {
      throw new Error(`Missing provider base URL. Configure it in setup or set ${baseUrlEnv}.`);
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey || undefined;
    this.model = config.model;
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const timeoutMs = resolveTimeoutMs();
    const maxTokens = resolveMaxTokens();
    const temperature = resolveTemperature(request);
    const parseRetriesMax = resolveJsonParseRetries();
    const maxRequestsPerMinute = resolveMaxRequestsPerMinute();
    const rateLimitWindowMs = resolveRateLimitWindowMs();
    const maxConcurrentRequestsPerModel = resolveMaxConcurrentRequestsPerModel();
    const backoff = resolveBackoffSettings();
    const streamingEnabled = resolveProviderStreaming();
    const parseAttemptsMax = 1 + parseRetriesMax;
    const parseFailures: string[] = [];
    let parseRetriesUsed = 0;
    let parseRetryAdditionalDurationMs = 0;
    let lastRawText = "";
    let lastParseError = "";
    let providerAttempts = 0;
    let providerBackoffRetries = 0;
    let providerBackoffWaitMs = 0;
    let providerRateLimitWaitMs = 0;
    const providerThrottleReasons: string[] = [];
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;
    const cancellationWatcher = createTaskCancellationWatcher(request.taskId);
    try {
      for (let attempt = 1; attempt <= parseAttemptsMax; attempt += 1) {
      const isRetry = attempt > 1;
      const messages = isRetry
        ? buildParseRetryMessages({
          request,
          previousRawText: lastRawText,
          parseError: lastParseError || "Unknown JSON formatting issue.",
          attempt,
          maxAttempts: parseAttemptsMax,
        })
        : buildStatelessMessages(request);
      const estimatedInputTokensForCall = estimateTokensFromMessages(messages);

      if (isRetry) {
        await logProviderParseRetry({
          agent: request.agent,
          taskId: request.taskId,
          stage: request.stage,
          provider: "openai-compatible",
          model: this.model,
          event: "parse_retry_started",
          attempt,
          maxAttempts: parseAttemptsMax,
          parseRetriesUsed: attempt - 1,
          reason: "Retrying provider call because previous response could not be parsed as JSON.",
          parseError: lastParseError,
          additionalDurationMs: parseRetryAdditionalDurationMs,
        }).catch(() => undefined);
      }

      const payload: Record<string, unknown> = {
        model: this.model,
        temperature,
        // Stateless-by-design: each call sends only explicit current context (system + user), no prior chat history.
        messages,
      };
      if (maxTokens) payload.max_tokens = maxTokens;

      const callStartedAt = Date.now();
      let callOutcome: ProviderCallOutcome;
      try {
        callOutcome = await callChatCompletionsWithResilience({
          request,
          provider: "openai-compatible",
          model: this.model,
          baseUrl: this.baseUrl,
          headers,
          timeoutMs,
          payload,
          streamingEnabled,
          maxRequestsPerMinute,
          rateLimitWindowMs,
          maxConcurrentRequestsPerModel,
          backoff,
          cancellationSignal: cancellationWatcher.signal,
        });
      } catch (rawError) {
        if (isRetry) {
          parseRetryAdditionalDurationMs += Date.now() - callStartedAt;
        }
        const error = toProviderCallError(rawError);
        error.providerAttempts = providerAttempts + (error.providerAttempts || 0);
        error.providerBackoffRetries = providerBackoffRetries + (error.providerBackoffRetries || 0);
        error.providerBackoffWaitMs = providerBackoffWaitMs + (error.providerBackoffWaitMs || 0);
        error.providerRateLimitWaitMs = providerRateLimitWaitMs + (error.providerRateLimitWaitMs || 0);
        error.providerThrottleReasons = [
          ...providerThrottleReasons.slice(-3),
          ...((error.providerThrottleReasons || []).slice(-3)),
        ].slice(-4);
        error.parseRetries = attempt - 1;
        error.validationPassed = false;
        error.parseRetryAdditionalDurationMs = parseRetryAdditionalDurationMs;
        throw error;
      }
      const rawText = callOutcome.rawText;
      providerAttempts += callOutcome.attemptsUsed;
      providerBackoffRetries += callOutcome.backoffRetriesUsed;
      providerBackoffWaitMs += callOutcome.backoffWaitMs;
      providerRateLimitWaitMs += callOutcome.rateLimitWaitMs;
      if (callOutcome.backoffReasons.length) providerThrottleReasons.push(...callOutcome.backoffReasons);
      estimatedInputTokens += estimatedInputTokensForCall * Math.max(1, callOutcome.attemptsUsed);
      estimatedOutputTokens += estimateTokensFromChars(rawText.length);
      if (isRetry) {
        parseRetryAdditionalDurationMs += Date.now() - callStartedAt;
      }
      lastRawText = rawText;

      try {
        const parsed = extractJsonFromText(rawText);
        parseRetriesUsed = attempt - 1;

        if (isRetry) {
          await logProviderParseRetry({
            agent: request.agent,
            taskId: request.taskId,
            stage: request.stage,
            provider: "openai-compatible",
            model: this.model,
            event: "parse_retry_succeeded",
            attempt,
            maxAttempts: parseAttemptsMax,
            parseRetriesUsed,
            reason: "Parsing retry succeeded; stage can continue without full reprocessing.",
            additionalDurationMs: parseRetryAdditionalDurationMs,
            retryRecoveredStage: true,
          }).catch(() => undefined);
        }

        const tokenEstimate = buildTokenEstimateFromCounts({
          model: this.model,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        });

        return {
          rawText,
          parsed,
          provider: "openai-compatible",
          model: this.model,
          parseRetries: parseRetriesUsed,
          validationPassed: true,
          providerAttempts,
          providerBackoffRetries,
          providerBackoffWaitMs,
          providerRateLimitWaitMs,
          estimatedInputTokens: tokenEstimate.inputTokens,
          estimatedOutputTokens: tokenEstimate.outputTokens,
          estimatedTotalTokens: tokenEstimate.totalTokens,
          estimatedCostUsd: tokenEstimate.estimatedCostUsd,
        };
      } catch (error) {
        const parseError = parseFailureReason(error);
        parseFailures.push(parseError);
        lastParseError = parseError;

        await logProviderParseRetry({
          agent: request.agent,
          taskId: request.taskId,
          stage: request.stage,
          provider: "openai-compatible",
          model: this.model,
          event: isRetry ? "parse_retry_failed" : "initial_parse_failed",
          attempt,
          maxAttempts: parseAttemptsMax,
          parseRetriesUsed: attempt - 1,
          parseError,
          additionalDurationMs: parseRetryAdditionalDurationMs,
        }).catch(() => undefined);

        if (attempt >= parseAttemptsMax) {
          await logProviderParseRetry({
            agent: request.agent,
            taskId: request.taskId,
            stage: request.stage,
            provider: "openai-compatible",
            model: this.model,
            event: "parse_retry_exhausted",
            attempt,
            maxAttempts: parseAttemptsMax,
            parseRetriesUsed: attempt - 1,
            reason: "All JSON parsing retries were exhausted.",
            parseError,
            additionalDurationMs: parseRetryAdditionalDurationMs,
          }).catch(() => undefined);

          const errorWithMeta = new Error(
            `Provider JSON parsing failed after ${attempt} attempt(s) (${attempt - 1} retr${attempt - 1 === 1 ? "y" : "ies"}). Last parse error: ${parseError}`,
          ) as Error & {
            parseRetries?: number;
            validationPassed?: boolean;
            parseRetryAdditionalDurationMs?: number;
            parseFailureReasons?: string[];
            providerAttempts?: number;
            providerBackoffRetries?: number;
            providerBackoffWaitMs?: number;
            providerRateLimitWaitMs?: number;
            providerThrottleReasons?: string[];
          };
          errorWithMeta.parseRetries = attempt - 1;
          errorWithMeta.validationPassed = false;
          errorWithMeta.parseRetryAdditionalDurationMs = parseRetryAdditionalDurationMs;
          errorWithMeta.parseFailureReasons = parseFailures.slice(-3);
          errorWithMeta.providerAttempts = providerAttempts;
          errorWithMeta.providerBackoffRetries = providerBackoffRetries;
          errorWithMeta.providerBackoffWaitMs = providerBackoffWaitMs;
          errorWithMeta.providerRateLimitWaitMs = providerRateLimitWaitMs;
          errorWithMeta.providerThrottleReasons = providerThrottleReasons.slice(-4);
          throw errorWithMeta;
        }
      }
    }
    } finally {
      cancellationWatcher.stop();
    }

    throw new Error("Provider JSON parsing failed without a terminal parse attempt.");
  }
}
