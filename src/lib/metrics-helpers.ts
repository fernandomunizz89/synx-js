export interface MetricsWindow {
  sinceMs?: number;
  untilMs?: number;
}

export interface AgentAuditEntry {
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

export interface QueueLatencyEntry {
  at?: string;
  taskId?: string;
  stage?: string;
  queueLatencyMs?: number;
}

export interface PollingEntry {
  at?: string;
  action?: string;
  sleepMs?: number;
  loopDurationMs?: number;
  processedStages?: number;
}

export interface ProviderThrottleEntry {
  at?: string;
  event?: string;
}

export interface RuntimeEventEntry {
  at?: string;
  event?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
}

export interface JsonlLoadResult<T> {
  rows: T[];
  lineCount: number;
  byteCount: number;
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
  learningQuality: {
    agents: Array<{
      agent: string;
      total: number;
      approved: number;
      reproved: number;
      approvalRate: number;
    }>;
    capabilities: Array<{
      capability: string;
      total: number;
      approved: number;
      reproved: number;
      approvalRate: number;
    }>;
  };
  projectQuality: {
    overall: {
      projects: number;
      avgDecompositionQuality: number;
      avgReworkRate: number;
      avgQaReturnRate: number;
      avgHumanInterventionRate: number;
      avgDeliveryLeadTimeMs: number;
    };
    projects: Array<{
      project: string;
      taskCount: number;
      decompositionQuality: number;
      reworkRate: number;
      qaReturnRate: number;
      humanInterventionRate: number;
      deliveryLeadTimeMs: number;
    }>;
  };
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

export interface StageSummaryRow {
  stage: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface TaskComputedMetrics {
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

export const usefulDiagnosisNotes = new Set([
  "investigation_summary",
  "quality_gate_initial",
  "quality_repair_attempt_started",
  "quality_repair_attempt_result",
  "quality_repair_aborted_early",
  "quality_gate_blocked",
  "qa_decision",
  "qa_validation_summary",
]);

export function toMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function inWindow(ms: number | null, timeWindow: MetricsWindow): boolean {
  if (ms === null) return false;
  if (typeof timeWindow.sinceMs === "number" && ms < timeWindow.sinceMs) return false;
  if (typeof timeWindow.untilMs === "number" && ms > timeWindow.untilMs) return false;
  return true;
}

export function normalizeStage(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("dispatcher")) return "dispatcher";
  if (normalized === "qa" || normalized.includes("qa")) return "qa";
  return normalized
    .replace(/^(\d+[a-z]?|[a-z])[-_]/, "")
    .replace(/^\d+[a-z]?/, "")
    .trim();
}

export function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function classifyFailure(message: string): string {
  const lower = message.toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) return "provider_rate_limit";
  if (lower.includes("timed out")) return "provider_timeout";
  if (lower.includes("fetch failed") || lower.includes("econnrefused")) return "provider_unreachable";
  if (lower.includes("could not extract json") || lower.includes("json parsing failed")) return "provider_json_format";
  if (lower.includes("quality gate")) return "quality_gate";
  if (lower.includes("lint") || lower.includes("no-unused-vars")) return "lint";
  if (lower.includes("typescript") || lower.includes("tsc")) return "typecheck"; // Use 'tsc' instead of 'ts' to avoid matching 'tests'
  if (lower.includes("e2e") || lower.includes("playwright")) return "e2e";
  if (lower.includes("test") || lower.includes("tests")) return "tests";
  return "other";
}

export function isUsefulLog(entry: AgentAuditEntry): boolean {
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
