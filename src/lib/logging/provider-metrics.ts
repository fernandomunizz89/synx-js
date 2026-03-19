import path from "node:path";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import { nowIso } from "../utils.js";
import { trimText } from "../text-utils.js";
import type { AgentName } from "../types.js";

export interface PollingCycleLogEntry {
  at?: string;
  loop: number;
  pollIntervalMs: number;
  maxImmediateCycles: number;
  taskCount: number;
  activeTaskCount: number;
  processedStages: number;
  processedTasks: number;
  immediateCycleStreak: number;
  immediateCyclesTotal: number;
  sleepsAvoidedTotal: number;
  sleepsTotal: number;
  loopDurationMs: number;
  action: "immediate" | "sleep";
  reason: string;
  sleepMs: number;
  taskConcurrency?: number;
}

export async function logPollingCycle(entry: PollingCycleLogEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    loop: entry.loop,
    pollIntervalMs: entry.pollIntervalMs,
    maxImmediateCycles: entry.maxImmediateCycles,
    taskCount: entry.taskCount,
    activeTaskCount: entry.activeTaskCount,
    processedStages: entry.processedStages,
    processedTasks: entry.processedTasks,
    immediateCycleStreak: entry.immediateCycleStreak,
    immediateCyclesTotal: entry.immediateCyclesTotal,
    sleepsAvoidedTotal: entry.sleepsAvoidedTotal,
    sleepsTotal: entry.sleepsTotal,
    loopDurationMs: entry.loopDurationMs,
    action: entry.action,
    reason: trimText(entry.reason, 220),
    sleepMs: entry.sleepMs,
    taskConcurrency: typeof entry.taskConcurrency === "number" ? entry.taskConcurrency : undefined,
  };
  await appendText(path.join(logsDir(), "polling-metrics.jsonl"), `${JSON.stringify(payload)}\n`);
}

export interface QueueLatencyLogEntry {
  at?: string;
  taskId: string;
  stage: string;
  agent: AgentName;
  requestCreatedAt: string;
  startedAt: string;
  queueLatencyMs: number;
}

export async function logQueueLatency(entry: QueueLatencyLogEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    taskId: entry.taskId,
    stage: entry.stage,
    agent: entry.agent,
    requestCreatedAt: entry.requestCreatedAt,
    startedAt: entry.startedAt,
    queueLatencyMs: entry.queueLatencyMs,
  };
  await appendText(path.join(logsDir(), "queue-latency.jsonl"), `${JSON.stringify(payload)}\n`);
}

export interface ProviderThrottleLogEntry {
  at?: string;
  agent: AgentName;
  taskId?: string;
  stage?: string;
  provider: string;
  model: string;
  event: "rate_limit_wait" | "backoff_scheduled" | "backoff_retry" | "backoff_recovered" | "backoff_exhausted";
  attempt: number;
  maxAttempts: number;
  retriesUsed: number;
  transient: boolean;
  statusCode?: number;
  errorCode?: string;
  reason?: string;
  waitMs?: number;
  rateLimitWaitMs?: number;
  backoffWaitMs?: number;
  requestLimit?: number;
  rateLimitWindowMs?: number;
}

export async function logProviderThrottle(entry: ProviderThrottleLogEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    agent: entry.agent,
    taskId: entry.taskId || "",
    stage: entry.stage || "",
    provider: entry.provider,
    model: entry.model,
    event: entry.event,
    attempt: entry.attempt,
    maxAttempts: entry.maxAttempts,
    retriesUsed: entry.retriesUsed,
    transient: entry.transient,
    statusCode: typeof entry.statusCode === "number" ? entry.statusCode : 0,
    errorCode: entry.errorCode ? trimText(entry.errorCode, 80) : "",
    reason: entry.reason ? trimText(entry.reason, 240) : "",
    waitMs: typeof entry.waitMs === "number" ? entry.waitMs : 0,
    rateLimitWaitMs: typeof entry.rateLimitWaitMs === "number" ? entry.rateLimitWaitMs : 0,
    backoffWaitMs: typeof entry.backoffWaitMs === "number" ? entry.backoffWaitMs : 0,
    requestLimit: typeof entry.requestLimit === "number" ? entry.requestLimit : 0,
    rateLimitWindowMs: typeof entry.rateLimitWindowMs === "number" ? entry.rateLimitWindowMs : 0,
  };
  await appendText(path.join(logsDir(), "provider-throttle.jsonl"), `${JSON.stringify(payload)}\n`);
}

export interface ProviderParseRetryLogEntry {
  at?: string;
  agent: AgentName;
  taskId?: string;
  stage?: string;
  provider: string;
  model: string;
  event: "initial_parse_failed" | "parse_retry_started" | "parse_retry_failed" | "parse_retry_succeeded" | "parse_retry_exhausted";
  attempt: number;
  maxAttempts: number;
  parseRetriesUsed: number;
  reason?: string;
  parseError?: string;
  additionalDurationMs?: number;
  retryRecoveredStage?: boolean;
}

export async function logProviderParseRetry(entry: ProviderParseRetryLogEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    agent: entry.agent,
    taskId: entry.taskId || "",
    stage: entry.stage || "",
    provider: entry.provider,
    model: entry.model,
    event: entry.event,
    attempt: entry.attempt,
    maxAttempts: entry.maxAttempts,
    parseRetriesUsed: entry.parseRetriesUsed,
    reason: entry.reason ? trimText(entry.reason, 240) : "",
    parseError: entry.parseError ? trimText(entry.parseError, 320) : "",
    additionalDurationMs: typeof entry.additionalDurationMs === "number" ? entry.additionalDurationMs : 0,
    retryRecoveredStage: Boolean(entry.retryRecoveredStage),
  };
  await appendText(path.join(logsDir(), "provider-parse-retries.jsonl"), `${JSON.stringify(payload)}\n`);
}

export interface ProviderModelResolutionLogEntry {
  at?: string;
  agent: AgentName;
  taskId?: string;
  stage?: string;
  provider: string;
  event: "model_resolution_started" | "model_resolution_succeeded" | "model_resolution_failed";
  configuredModel?: string;
  selectedModel?: string;
  fallbackModel?: string;
  autoDiscoveryEnabled?: boolean;
  reason?: string;
  listedModels?: string[];
  baseUrl?: string;
}

export async function logProviderModelResolution(entry: ProviderModelResolutionLogEntry): Promise<void> {
  const payload = {
    at: entry.at || nowIso(),
    agent: entry.agent,
    taskId: entry.taskId || "",
    stage: entry.stage || "",
    provider: entry.provider,
    event: entry.event,
    configuredModel: entry.configuredModel ? trimText(entry.configuredModel, 140) : "",
    selectedModel: entry.selectedModel ? trimText(entry.selectedModel, 140) : "",
    fallbackModel: entry.fallbackModel ? trimText(entry.fallbackModel, 140) : "",
    autoDiscoveryEnabled: typeof entry.autoDiscoveryEnabled === "boolean" ? entry.autoDiscoveryEnabled : false,
    reason: entry.reason ? trimText(entry.reason, 320) : "",
    listedModels: Array.isArray(entry.listedModels)
      ? entry.listedModels.filter((x): x is string => typeof x === "string").slice(0, 12)
      : [],
    baseUrl: entry.baseUrl ? trimText(entry.baseUrl, 180) : "",
  };
  await appendText(path.join(logsDir(), "provider-model-resolution.jsonl"), `${JSON.stringify(payload)}\n`);
}
