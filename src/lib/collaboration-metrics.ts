import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, listDirectories, listFiles, readJson } from "./fs.js";
import { logsDir, tasksDir } from "./paths.js";
import type { TaskMeta, TimingEntry } from "./types.js";

export interface MetricsWindow {
  sinceMs?: number;
  untilMs?: number;
}

interface AgentAuditEntry {
  at?: string;
  taskId?: string;
  stage?: string;
  agent?: string;
  event?: string;
  nextAgent?: string;
  status?: string;
  error?: string;
  note?: string;
  outputSummary?: Record<string, unknown>;
}

interface QueueLatencyEntry {
  at?: string;
  taskId?: string;
  stage?: string;
  queueLatencyMs?: number;
}

interface PollingEntry {
  at?: string;
  action?: string;
  sleepMs?: number;
  loopDurationMs?: number;
  processedStages?: number;
}

interface ProviderThrottleEntry {
  at?: string;
  event?: string;
}

interface JsonlLoadResult<T> {
  rows: T[];
  lineCount: number;
  byteCount: number;
}

interface StageSummaryRow {
  stage: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

interface TaskComputedMetrics {
  taskId: string;
  totalMs: number;
  stageCount: number;
  handoffs: number;
  qaReturns: number;
  qualityRepairRetries: number;
  loops: number;
  retryCount: number;
  parseRetries: number;
  providerBackoffRetries: number;
  providerBackoffWaitMs: number;
  providerRateLimitWaitMs: number;
  implementerMs: number;
  fullBuildChecks: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  firstDiagnosisMs?: number;
  status: "success" | "failed" | "in_progress";
}

export interface CollaborationMetricsReport {
  window: {
    sinceMs?: number;
    untilMs?: number;
  };
  taskMetrics: {
    totalTasks: number;
    terminalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    inProgressTasks: number;
    successRate: number;
    avgTotalMs: number;
    p95TotalMs: number;
    avgRetriesPerTask: number;
    avgHandoffsPerTask: number;
    avgLoopsPerTask: number;
    qaReturnRate: number;
    timeToFirstDiagnosisAvgMs: number;
    timeToFirstDiagnosisP95Ms: number;
    avgQueueLatencyMs: number;
    queueLatencyP95Ms: number;
    fullBuildChecksPerTask: number;
    estimatedInputTokensTotal: number;
    estimatedOutputTokensTotal: number;
    estimatedTotalTokens: number;
    avgEstimatedTokensPerTask: number;
    estimatedCostUsdTotal: number;
    avgEstimatedCostUsdPerTask: number;
  };
  stageSummary: StageSummaryRow[];
  failuresByCategory: Array<{ category: string; count: number }>;
  collaboration: {
    logsUseful: number;
    logsInformative: number;
    usefulLogRatio: number;
    loopsByType: {
      qaReturnsTotal: number;
      qualityRepairRetriesTotal: number;
    };
  };
  bottlenecks: {
    topStage: string;
    topStageAvgMs: number;
    implementerShare: number;
    implementerAvgMsPerTask: number;
    implementerLikelyBottleneck: boolean;
  };
  operationalCost: {
    retryWaitMs: number;
    pollingSleepMs: number;
    pollingLoops: number;
    pollingProcessedStages: number;
    throttleEvents: number;
    logLines: number;
    logBytes: number;
  };
}

const usefulDiagnosisNotes = new Set([
  "investigation_summary",
  "quality_gate_initial",
  "quality_repair_attempt_started",
  "quality_repair_attempt_result",
  "quality_repair_aborted_early",
  "quality_gate_blocked",
  "qa_decision",
  "qa_validation_summary",
]);

function toMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function inWindow(ms: number | null, window: MetricsWindow): boolean {
  if (ms === null) return false;
  if (typeof window.sinceMs === "number" && ms < window.sinceMs) return false;
  if (typeof window.untilMs === "number" && ms > window.untilMs) return false;
  return true;
}

function normalizeStage(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("dispatcher")) return "dispatcher";
  if (normalized === "qa" || normalized.includes("qa")) return "qa";
  return normalized
    .replace(/^0+\w?-/, "")
    .replace(/^0+\w?/, "")
    .replace(/^\d+[a-z]?[-_]?/, "")
    .trim();
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function classifyFailure(message: string): string {
  const lower = message.toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) return "provider_rate_limit";
  if (lower.includes("timed out")) return "provider_timeout";
  if (lower.includes("fetch failed") || lower.includes("econnrefused")) return "provider_unreachable";
  if (lower.includes("could not extract json") || lower.includes("json parsing failed")) return "provider_json_format";
  if (lower.includes("quality gate")) return "quality_gate";
  if (lower.includes("lint") || lower.includes("no-unused-vars")) return "lint";
  if (lower.includes("typescript") || lower.includes("ts")) return "typecheck";
  if (lower.includes("e2e") || lower.includes("playwright")) return "e2e";
  if (lower.includes("test")) return "tests";
  return "other";
}

function isUsefulLog(entry: AgentAuditEntry): boolean {
  if (entry.event === "stage_failed") return true;
  if (entry.event === "stage_note") {
    const note = (entry.note || "").trim();
    if (usefulDiagnosisNotes.has(note)) return true;
    const output = entry.outputSummary || {};
    const blockingFailures = asNumber(output.blockingFailures);
    const failuresCount = asNumber(output.failuresCount);
    if (blockingFailures > 0 || failuresCount > 0) return true;
  }
  return false;
}

async function loadJsonlByPath<T>(filePath: string, window: MetricsWindow, getTime: (row: T) => number | null): Promise<JsonlLoadResult<T>> {
  if (!(await exists(filePath))) {
    return {
      rows: [],
      lineCount: 0,
      byteCount: 0,
    };
  }

  const raw = await fs.readFile(filePath, "utf8");
  let lineCount = 0;
  let byteCount = 0;
  const rows: T[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: T;
    try {
      parsed = JSON.parse(line) as T;
    } catch {
      continue;
    }
    const atMs = getTime(parsed);
    if (!inWindow(atMs, window)) continue;
    lineCount += 1;
    byteCount += Buffer.byteLength(line, "utf8");
    rows.push(parsed);
  }

  return {
    rows,
    lineCount,
    byteCount,
  };
}

async function loadAgentAudit(window: MetricsWindow): Promise<JsonlLoadResult<AgentAuditEntry>> {
  const dir = path.join(logsDir(), "agent-audit");
  if (!(await exists(dir))) {
    return { rows: [], lineCount: 0, byteCount: 0 };
  }

  const files = await listFiles(dir);
  const entries: AgentAuditEntry[] = [];
  let lineCount = 0;
  let byteCount = 0;

  for (const file of files) {
    const loaded = await loadJsonlByPath<AgentAuditEntry>(
      path.join(dir, file),
      window,
      (row) => toMs(row.at),
    );
    entries.push(...loaded.rows);
    lineCount += loaded.lineCount;
    byteCount += loaded.byteCount;
  }

  return {
    rows: entries,
    lineCount,
    byteCount,
  };
}

async function loadTaskMetaMap(): Promise<Map<string, TaskMeta>> {
  const map = new Map<string, TaskMeta>();
  const root = tasksDir();
  if (!(await exists(root))) return map;

  const ids = await listDirectories(root);
  for (const taskId of ids) {
    const metaPath = path.join(root, taskId, "meta.json");
    if (!(await exists(metaPath))) continue;
    try {
      const meta = await readJson<TaskMeta>(metaPath);
      map.set(taskId, meta);
    } catch {
      continue;
    }
  }
  return map;
}

export function parseMetricsTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{13}$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{10}$/.test(value)) {
    const parsed = Number(value) * 1000;
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{8}-\d{6}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    const parsed = Date.UTC(year, month - 1, day, hour, minute, second);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const iso = Date.parse(value);
  return Number.isFinite(iso) ? iso : null;
}

export async function buildCollaborationMetricsReport(window: MetricsWindow): Promise<CollaborationMetricsReport> {
  const stageMetricsFile = path.join(logsDir(), "stage-metrics.jsonl");
  const queueLatencyFile = path.join(logsDir(), "queue-latency.jsonl");
  const pollingFile = path.join(logsDir(), "polling-metrics.jsonl");
  const providerThrottleFile = path.join(logsDir(), "provider-throttle.jsonl");

  const [stageRowsLoaded, auditLoaded, queueLoaded, pollingLoaded, throttleLoaded, taskMetaMap] = await Promise.all([
    loadJsonlByPath<TimingEntry>(stageMetricsFile, window, (row) => toMs(row.startedAt)),
    loadAgentAudit(window),
    loadJsonlByPath<QueueLatencyEntry>(queueLatencyFile, window, (row) => toMs(row.at)),
    loadJsonlByPath<PollingEntry>(pollingFile, window, (row) => toMs(row.at)),
    loadJsonlByPath<ProviderThrottleEntry>(providerThrottleFile, window, (row) => toMs(row.at)),
    loadTaskMetaMap(),
  ]);

  const stageRows = stageRowsLoaded.rows;
  const auditRows = auditLoaded.rows;
  const queueRows = queueLoaded.rows;
  const pollingRows = pollingLoaded.rows;
  const throttleRows = throttleLoaded.rows;

  const stageSummaryMap = new Map<string, StageSummaryRow>();
  for (const row of stageRows) {
    const key = normalizeStage(row.stage);
    const current = stageSummaryMap.get(key) || {
      stage: key,
      count: 0,
      totalMs: 0,
      avgMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
    };
    current.count += 1;
    current.totalMs += row.durationMs;
    current.minMs = Math.min(current.minMs, row.durationMs);
    current.maxMs = Math.max(current.maxMs, row.durationMs);
    current.avgMs = Math.round(current.totalMs / current.count);
    stageSummaryMap.set(key, current);
  }
  const stageSummary = [...stageSummaryMap.values()].sort((a, b) => b.avgMs - a.avgMs);

  const taskToStages = new Map<string, TimingEntry[]>();
  for (const row of stageRows) {
    const list = taskToStages.get(row.taskId) || [];
    list.push(row);
    taskToStages.set(row.taskId, list);
  }

  const taskToAudit = new Map<string, AgentAuditEntry[]>();
  for (const row of auditRows) {
    const taskId = row.taskId || "";
    if (!taskId) continue;
    const list = taskToAudit.get(taskId) || [];
    list.push(row);
    taskToAudit.set(taskId, list);
  }

  const taskToQueue = new Map<string, QueueLatencyEntry[]>();
  for (const row of queueRows) {
    const taskId = row.taskId || "";
    if (!taskId) continue;
    const list = taskToQueue.get(taskId) || [];
    list.push(row);
    taskToQueue.set(taskId, list);
  }

  const allTaskIds = new Set<string>([
    ...taskToStages.keys(),
    ...taskToAudit.keys(),
  ]);

  const failuresByCategoryMap = new Map<string, number>();
  const taskMetrics: TaskComputedMetrics[] = [];
  let qaReachCount = 0;
  let qaReturnTaskCount = 0;
  let logsUseful = 0;
  let logsInformative = 0;
  let totalQaReturns = 0;
  let totalQualityRepairRetries = 0;
  let totalImplementerMs = 0;
  let totalStageMs = 0;
  let retryWaitMs = 0;
  let retryAdditionalMsFromWorkflow = 0;
  let fullBuildChecksTotal = 0;
  let estimatedInputTokensTotal = 0;
  let estimatedOutputTokensTotal = 0;
  let estimatedCostUsdTotal = 0;
  const diagnosisDurations: number[] = [];

  for (const row of auditRows) {
    if (isUsefulLog(row)) logsUseful += 1;
    else logsInformative += 1;
  }

  for (const taskId of allTaskIds) {
    const stages = taskToStages.get(taskId) || [];
    const audits = taskToAudit.get(taskId) || [];
    const queue = taskToQueue.get(taskId) || [];
    if (!stages.length && !audits.length) continue;

    const stageStarts = stages.map((row) => toMs(row.startedAt)).filter((value): value is number => value !== null);
    const stageEnds = stages.map((row) => toMs(row.endedAt)).filter((value): value is number => value !== null);
    const taskStartMs = stageStarts.length ? Math.min(...stageStarts) : null;
    const taskEndMs = stageEnds.length ? Math.max(...stageEnds) : null;
    const totalMs = taskStartMs !== null && taskEndMs !== null && taskEndMs >= taskStartMs
      ? taskEndMs - taskStartMs
      : 0;

    const handoffs = audits.filter((row) => row.event === "handoff_queued").length;
    const qaReturns = audits.filter(
      (row) => row.event === "handoff_queued"
        && normalizeStage(row.stage || "") === "qa"
        && ["feature builder", "bug fixer"].includes((row.nextAgent || "").toLowerCase()),
    ).length;
    const qualityRepairAttempts = audits.filter(
      (row) => row.event === "stage_note" && (row.note || "") === "quality_repair_attempt_started",
    ).length;
    const qualityRepairRetries = Math.max(0, qualityRepairAttempts - 1);
    const loops = qaReturns + qualityRepairRetries;

    const parseRetries = stages.reduce((sum, row) => sum + asNumber(row.parseRetries), 0);
    const providerBackoffRetries = stages.reduce((sum, row) => sum + asNumber(row.providerBackoffRetries), 0);
    const providerBackoffWaitMs = stages.reduce((sum, row) => sum + asNumber(row.providerBackoffWaitMs), 0);
    const providerRateLimitWaitMs = stages.reduce((sum, row) => sum + asNumber(row.providerRateLimitWaitMs), 0);
    const estimatedInputTokens = stages.reduce((sum, row) => sum + asNumber(row.estimatedInputTokens), 0);
    const estimatedOutputTokens = stages.reduce((sum, row) => sum + asNumber(row.estimatedOutputTokens), 0);
    const estimatedCostUsd = stages.reduce((sum, row) => sum + asNumber(row.estimatedCostUsd), 0);
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
    estimatedInputTokensTotal += estimatedInputTokens;
    estimatedOutputTokensTotal += estimatedOutputTokens;
    estimatedCostUsdTotal += estimatedCostUsd;
    retryWaitMs += providerBackoffWaitMs + providerRateLimitWaitMs;

    let firstDiagnosisMs: number | undefined;
    if (taskStartMs !== null) {
      const diagnosisAt = audits
        .filter(isUsefulLog)
        .map((row) => toMs(row.at))
        .filter((value): value is number => value !== null && value >= taskStartMs);
      if (diagnosisAt.length) {
        firstDiagnosisMs = Math.min(...diagnosisAt) - taskStartMs;
        diagnosisDurations.push(firstDiagnosisMs);
      }
    }

    let fullBuildChecks = 0;
    for (const row of audits) {
      if (row.event !== "stage_note") continue;
      const output = row.outputSummary || {};
      const direct = asNumber(output.fullBuildChecksExecuted);
      const metrics = output.metrics && typeof output.metrics === "object"
        ? asNumber((output.metrics as Record<string, unknown>).fullBuildChecksExecuted)
        : 0;
      const retryAdditional = asNumber(output.retryAdditionalTimeMs);
      retryAdditionalMsFromWorkflow += retryAdditional;
      fullBuildChecks += direct + metrics;
    }
    fullBuildChecksTotal += fullBuildChecks;

    const implementerStages = new Set([
      "synx-front-expert",
      "synx-mobile-expert",
      "synx-back-expert",
      "synx-seo-specialist",
    ]);
    const implementerMs = stages
      .filter((row) => implementerStages.has(normalizeStage(row.stage)))
      .reduce((sum, row) => sum + row.durationMs, 0);
    totalImplementerMs += implementerMs;
    totalStageMs += stages.reduce((sum, row) => sum + row.durationMs, 0);

    const reachedQa = stages.some((row) => normalizeStage(row.stage) === "qa")
      || audits.some((row) => normalizeStage(row.stage || "") === "qa");
    if (reachedQa) qaReachCount += 1;
    if (qaReturns > 0) qaReturnTaskCount += 1;
    totalQaReturns += qaReturns;
    totalQualityRepairRetries += qualityRepairRetries;

    for (const row of audits) {
      if (row.event !== "stage_failed") continue;
      const category = classifyFailure(row.error || "");
      failuresByCategoryMap.set(category, (failuresByCategoryMap.get(category) || 0) + 1);
    }

    const meta = taskMetaMap.get(taskId);
    let status: "success" | "failed" | "in_progress" = "in_progress";
    if (meta) {
      if (meta.status === "failed") status = "failed";
      else if (meta.status === "done" || meta.status === "waiting_human") status = "success";
    } else {
      const hasFailure = audits.some((row) => row.event === "stage_failed");
      status = hasFailure ? "failed" : reachedQa ? "success" : "in_progress";
    }

    taskMetrics.push({
      taskId,
      totalMs,
      stageCount: stages.length,
      handoffs,
      qaReturns,
      qualityRepairRetries,
      loops,
      retryCount: parseRetries + providerBackoffRetries + qaReturns + qualityRepairRetries,
      parseRetries,
      providerBackoffRetries,
      providerBackoffWaitMs,
      providerRateLimitWaitMs,
      implementerMs,
      fullBuildChecks,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      estimatedCostUsd,
      firstDiagnosisMs,
      status,
    });

    void queue;
  }

  const terminalTasks = taskMetrics.filter((item) => item.status !== "in_progress");
  const successfulTasks = taskMetrics.filter((item) => item.status === "success");
  const failedTasks = taskMetrics.filter((item) => item.status === "failed");
  const inProgressTasks = taskMetrics.filter((item) => item.status === "in_progress");

  const totalDurations = taskMetrics.map((item) => item.totalMs).filter((value) => value > 0);
  const queueLatencies = queueRows.map((row) => asNumber(row.queueLatencyMs)).filter((value) => value >= 0);

  const failuresByCategory = [...failuresByCategoryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const topStage = stageSummary[0]?.stage || "[none]";
  const topStageAvgMs = stageSummary[0]?.avgMs || 0;
  const implementerShare = totalStageMs > 0 ? Number((totalImplementerMs / totalStageMs).toFixed(3)) : 0;

  const pollingSleepMs = pollingRows.reduce((sum, row) => sum + asNumber(row.sleepMs), 0);
  const pollingProcessedStages = pollingRows.reduce((sum, row) => sum + asNumber(row.processedStages), 0);

  const logLines = stageRowsLoaded.lineCount
    + auditLoaded.lineCount
    + queueLoaded.lineCount
    + pollingLoaded.lineCount
    + throttleLoaded.lineCount;
  const logBytes = stageRowsLoaded.byteCount
    + auditLoaded.byteCount
    + queueLoaded.byteCount
    + pollingLoaded.byteCount
    + throttleLoaded.byteCount;

  return {
    window: {
      sinceMs: window.sinceMs,
      untilMs: window.untilMs,
    },
    taskMetrics: {
      totalTasks: taskMetrics.length,
      terminalTasks: terminalTasks.length,
      successfulTasks: successfulTasks.length,
      failedTasks: failedTasks.length,
      inProgressTasks: inProgressTasks.length,
      successRate: terminalTasks.length ? Number((successfulTasks.length / terminalTasks.length).toFixed(3)) : 0,
      avgTotalMs: avg(totalDurations),
      p95TotalMs: percentile(totalDurations, 0.95),
      avgRetriesPerTask: taskMetrics.length ? Number((taskMetrics.reduce((sum, item) => sum + item.retryCount, 0) / taskMetrics.length).toFixed(2)) : 0,
      avgHandoffsPerTask: taskMetrics.length ? Number((taskMetrics.reduce((sum, item) => sum + item.handoffs, 0) / taskMetrics.length).toFixed(2)) : 0,
      avgLoopsPerTask: taskMetrics.length ? Number((taskMetrics.reduce((sum, item) => sum + item.loops, 0) / taskMetrics.length).toFixed(2)) : 0,
      qaReturnRate: qaReachCount ? Number((qaReturnTaskCount / qaReachCount).toFixed(3)) : 0,
      timeToFirstDiagnosisAvgMs: avg(diagnosisDurations),
      timeToFirstDiagnosisP95Ms: percentile(diagnosisDurations, 0.95),
      avgQueueLatencyMs: avg(queueLatencies),
      queueLatencyP95Ms: percentile(queueLatencies, 0.95),
      fullBuildChecksPerTask: taskMetrics.length ? Number((fullBuildChecksTotal / taskMetrics.length).toFixed(2)) : 0,
      estimatedInputTokensTotal,
      estimatedOutputTokensTotal,
      estimatedTotalTokens: estimatedInputTokensTotal + estimatedOutputTokensTotal,
      avgEstimatedTokensPerTask: taskMetrics.length
        ? Number((((estimatedInputTokensTotal + estimatedOutputTokensTotal) / taskMetrics.length).toFixed(2)))
        : 0,
      estimatedCostUsdTotal: Number(estimatedCostUsdTotal.toFixed(6)),
      avgEstimatedCostUsdPerTask: taskMetrics.length
        ? Number((estimatedCostUsdTotal / taskMetrics.length).toFixed(6))
        : 0,
    },
    stageSummary,
    failuresByCategory,
    collaboration: {
      logsUseful,
      logsInformative,
      usefulLogRatio: logsUseful + logsInformative > 0
        ? Number((logsUseful / (logsUseful + logsInformative)).toFixed(3))
        : 0,
      loopsByType: {
        qaReturnsTotal: totalQaReturns,
        qualityRepairRetriesTotal: totalQualityRepairRetries,
      },
    },
    bottlenecks: {
      topStage,
      topStageAvgMs,
      implementerShare,
      implementerAvgMsPerTask: taskMetrics.length ? Math.round(totalImplementerMs / taskMetrics.length) : 0,
      implementerLikelyBottleneck: ["synx-front-expert", "synx-mobile-expert", "synx-back-expert", "synx-seo-specialist"].includes(topStage),
    },
    operationalCost: {
      retryWaitMs: retryWaitMs + retryAdditionalMsFromWorkflow,
      pollingSleepMs,
      pollingLoops: pollingRows.length,
      pollingProcessedStages,
      throttleEvents: throttleRows.length,
      logLines,
      logBytes,
    },
  };
}
