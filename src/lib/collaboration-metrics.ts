import path from "node:path";
import { logsDir } from "./paths.js";
import type { LearningEntry, TaskMeta, TimingEntry } from "./types.js";
import { listAgentsWithLearnings, loadAllLearnings } from "./learnings.js";
import {
  asNumber,
  avg,
  classifyFailure,
  isUsefulLog,
  normalizeStage,
  percentile,
  toMs,
  type AgentAuditEntry,
  type CollaborationMetricsReport,
  type MetricsWindow,
  type PollingEntry,
  type ProviderThrottleEntry,
  type QueueLatencyEntry,
  type RuntimeEventEntry,
  type StageSummaryRow,
  type TaskComputedMetrics,
} from "./metrics-helpers.js";
import { loadAgentAudit, loadJsonlByPath, loadTaskMetaMap } from "./metrics-loader.js";

export { type CollaborationMetricsReport, type MetricsWindow, parseMetricsTimestamp } from "./metrics-helpers.js";

function inWindowByMs(ms: number | null, timeWindow: MetricsWindow): boolean {
  if (ms === null) return false;
  if (typeof timeWindow.sinceMs === "number" && ms < timeWindow.sinceMs) return false;
  if (typeof timeWindow.untilMs === "number" && ms > timeWindow.untilMs) return false;
  return true;
}

function hasQaStage(meta: TaskMeta): boolean {
  const history = Array.isArray(meta.history) ? meta.history : [];
  return history.some((item) => normalizeStage(String(item.stage || "")) === "qa");
}

function fallbackQaReturns(meta: TaskMeta): number {
  const history = Array.isArray(meta.history) ? meta.history : [];
  const qaVisits = history.filter((item) => normalizeStage(String(item.stage || "")) === "qa").length;
  return Math.max(0, qaVisits - 1);
}

async function buildLearningQuality(args: {
  timeWindow: MetricsWindow;
}): Promise<CollaborationMetricsReport["learningQuality"]> {
  const { timeWindow } = args;
  const agents = await listAgentsWithLearnings();
  const agentMap = new Map<string, { total: number; approved: number; reproved: number }>();
  const capabilityMap = new Map<string, { total: number; approved: number; reproved: number }>();

  for (const fileAgentId of agents) {
    let entries: LearningEntry[] = [];
    try {
      entries = await loadAllLearnings(fileAgentId);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!inWindowByMs(toMs(entry.timestamp), timeWindow)) continue;
      const agent = String(entry.agentId || fileAgentId || "Unknown");
      const currentAgent = agentMap.get(agent) || { total: 0, approved: 0, reproved: 0 };
      currentAgent.total += 1;
      if (entry.outcome === "approved") currentAgent.approved += 1;
      else currentAgent.reproved += 1;
      agentMap.set(agent, currentAgent);

      for (const capability of entry.capabilities || []) {
        const key = String(capability || "").trim().toLowerCase();
        if (!key) continue;
        const currentCapability = capabilityMap.get(key) || { total: 0, approved: 0, reproved: 0 };
        currentCapability.total += 1;
        if (entry.outcome === "approved") currentCapability.approved += 1;
        else currentCapability.reproved += 1;
        capabilityMap.set(key, currentCapability);
      }
    }
  }

  return {
    agents: [...agentMap.entries()]
      .map(([agent, value]) => ({
        agent,
        total: value.total,
        approved: value.approved,
        reproved: value.reproved,
        approvalRate: value.total ? Number((value.approved / value.total).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.approvalRate - a.approvalRate),
    capabilities: [...capabilityMap.entries()]
      .map(([capability, value]) => ({
        capability,
        total: value.total,
        approved: value.approved,
        reproved: value.reproved,
        approvalRate: value.total ? Number((value.approved / value.total).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.approvalRate - a.approvalRate),
  };
}

function buildProjectQuality(args: {
  taskMetaMap: Map<string, TaskMeta>;
  taskMetrics: TaskComputedMetrics[];
  runtimeEvents: RuntimeEventEntry[];
}): CollaborationMetricsReport["projectQuality"] {
  const { taskMetaMap, taskMetrics, runtimeEvents } = args;
  const metas = [...taskMetaMap.values()];
  const metricByTaskId = new Map(taskMetrics.map((metric) => [metric.taskId, metric]));
  const decisionByTaskId = new Map<string, { decisions: number; reproved: number }>();
  for (const row of runtimeEvents) {
    if (row.event !== "task.decision_recorded") continue;
    const taskId = String(row.taskId || "").trim();
    if (!taskId) continue;
    const payload = row.payload || {};
    const decision = String(payload.decision || "").trim().toLowerCase();
    const current = decisionByTaskId.get(taskId) || { decisions: 0, reproved: 0 };
    current.decisions += 1;
    if (decision === "reproved") current.reproved += 1;
    decisionByTaskId.set(taskId, current);
  }

  const childByParent = new Map<string, string[]>();
  for (const meta of metas) {
    const parent = String(meta.parentTaskId || "").trim();
    if (!parent) continue;
    const list = childByParent.get(parent) || [];
    list.push(meta.taskId);
    childByParent.set(parent, list);
  }

  const terminalStatuses = new Set(["done", "failed", "blocked", "archived"]);
  const metasByProject = new Map<string, TaskMeta[]>();
  for (const meta of metas) {
    const project = String(meta.project || "").trim() || "[unassigned]";
    const list = metasByProject.get(project) || [];
    list.push(meta);
    metasByProject.set(project, list);
  }

  const projectRows = [...metasByProject.entries()].map(([project, projectMetas]) => {
    let terminalCount = 0;
    let reworkCount = 0;
    let qaReachedCount = 0;
    let qaReturnedCount = 0;
    let humanInterventionCount = 0;
    const leadTimes: number[] = [];

    const taskHasRework = new Map<string, boolean>();

    for (const meta of projectMetas) {
      const metric = metricByTaskId.get(meta.taskId);
      const qaReturns = metric?.qaReturns ?? fallbackQaReturns(meta);
      const qualityRepairRetries = metric?.qualityRepairRetries || 0;
      const decisions = decisionByTaskId.get(meta.taskId) || { decisions: 0, reproved: 0 };
      const hasRework = qaReturns > 0 || qualityRepairRetries > 0 || decisions.reproved > 0;
      taskHasRework.set(meta.taskId, hasRework);

      if (terminalStatuses.has(meta.status)) terminalCount += 1;
      if (hasRework) reworkCount += 1;

      const reachedQa = metric ? true : hasQaStage(meta);
      if (reachedQa) qaReachedCount += 1;
      if (qaReturns > 0) qaReturnedCount += 1;
      if (decisions.reproved > 0) humanInterventionCount += 1;

      const createdAtMs = toMs(meta.createdAt);
      const history = Array.isArray(meta.history) ? meta.history : [];
      const historyEndMs = history
        .map((item) => toMs(item.endedAt))
        .filter((value): value is number => value !== null);
      const lastHistoryEndMs = historyEndMs.length ? Math.max(...historyEndMs) : null;
      const terminalMs = lastHistoryEndMs ?? toMs(meta.updatedAt);
      if (
        terminalStatuses.has(meta.status)
        && createdAtMs !== null
        && terminalMs !== null
        && terminalMs >= createdAtMs
      ) {
        leadTimes.push(terminalMs - createdAtMs);
      }
    }

    const parentProjects = projectMetas.filter((meta) => meta.sourceKind === "project-intake");
    const decompositionScores: number[] = [];
    for (const parent of parentProjects) {
      const childIds = childByParent.get(parent.taskId) || [];
      if (!childIds.length) {
        decompositionScores.push(0);
        continue;
      }
      const highQualityChildren = childIds.filter((childId) => {
        const child = taskMetaMap.get(childId);
        if (!child) return false;
        const hasRework = taskHasRework.get(childId) || false;
        return child.status === "done" && !hasRework;
      }).length;
      decompositionScores.push(highQualityChildren / childIds.length);
    }

    return {
      project,
      taskCount: projectMetas.length,
      decompositionQuality: decompositionScores.length ? Number((avg(decompositionScores.map((score) => score * 100)) / 100).toFixed(3)) : 0,
      reworkRate: terminalCount ? Number((reworkCount / terminalCount).toFixed(3)) : 0,
      qaReturnRate: qaReachedCount ? Number((qaReturnedCount / qaReachedCount).toFixed(3)) : 0,
      humanInterventionRate: terminalCount ? Number((humanInterventionCount / terminalCount).toFixed(3)) : 0,
      deliveryLeadTimeMs: avg(leadTimes),
    };
  }).sort((a, b) => b.reworkRate - a.reworkRate || b.taskCount - a.taskCount);

  return {
    overall: {
      projects: projectRows.length,
      avgDecompositionQuality: Number((avg(projectRows.map((item) => item.decompositionQuality * 100)) / 100).toFixed(3)),
      avgReworkRate: Number((avg(projectRows.map((item) => item.reworkRate * 100)) / 100).toFixed(3)),
      avgQaReturnRate: Number((avg(projectRows.map((item) => item.qaReturnRate * 100)) / 100).toFixed(3)),
      avgHumanInterventionRate: Number((avg(projectRows.map((item) => item.humanInterventionRate * 100)) / 100).toFixed(3)),
      avgDeliveryLeadTimeMs: avg(projectRows.map((item) => item.deliveryLeadTimeMs)),
    },
    projects: projectRows,
  };
}

export async function buildCollaborationMetricsReport(timeWindow: MetricsWindow): Promise<CollaborationMetricsReport> {
  const stageMetricsFile = path.join(logsDir(), "stage-metrics.jsonl");
  const queueLatencyFile = path.join(logsDir(), "queue-latency.jsonl");
  const pollingFile = path.join(logsDir(), "polling-metrics.jsonl");
  const providerThrottleFile = path.join(logsDir(), "provider-throttle.jsonl");
  const runtimeEventsFile = path.join(logsDir(), "runtime-events.jsonl");

  const [stageRowsLoaded, auditLoaded, queueLoaded, pollingLoaded, throttleLoaded, runtimeEventsLoaded, taskMetaMap, learningQuality] = await Promise.all([
    loadJsonlByPath<TimingEntry>(stageMetricsFile, timeWindow, (row) => toMs(row.startedAt)),
    loadAgentAudit(timeWindow),
    loadJsonlByPath<QueueLatencyEntry>(queueLatencyFile, timeWindow, (row) => toMs(row.at)),
    loadJsonlByPath<PollingEntry>(pollingFile, timeWindow, (row) => toMs(row.at)),
    loadJsonlByPath<ProviderThrottleEntry>(providerThrottleFile, timeWindow, (row) => toMs(row.at)),
    loadJsonlByPath<RuntimeEventEntry>(runtimeEventsFile, timeWindow, (row) => toMs(row.at)),
    loadTaskMetaMap(),
    buildLearningQuality({ timeWindow }),
  ]);

  const stageRows = stageRowsLoaded.rows;
  const auditRows = auditLoaded.rows;
  const queueRows = queueLoaded.rows;
  const pollingRows = pollingLoaded.rows;
  const throttleRows = throttleLoaded.rows;
  const runtimeEvents = runtimeEventsLoaded.rows;

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
        && [
          "feature builder", "bug fixer",
          "synx front expert", "synx mobile expert", "synx back expert", "synx seo specialist"
        ].includes((row.nextAgent || "").toLowerCase()),
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
    + throttleLoaded.lineCount
    + runtimeEventsLoaded.lineCount;
  const logBytes = stageRowsLoaded.byteCount
    + auditLoaded.byteCount
    + queueLoaded.byteCount
    + pollingLoaded.byteCount
    + throttleLoaded.byteCount
    + runtimeEventsLoaded.byteCount;
  const projectQuality = buildProjectQuality({
    taskMetaMap,
    taskMetrics,
    runtimeEvents,
  });

  return {
    window: {
      sinceMs: timeWindow.sinceMs,
      untilMs: timeWindow.untilMs,
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
    learningQuality,
    projectQuality,
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
