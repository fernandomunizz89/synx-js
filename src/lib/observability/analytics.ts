import path from "node:path";
import { allTaskIds, loadTaskMeta } from "../task.js";
import { listAgentsWithLearnings, loadAllLearnings } from "../learnings.js";
import { exists, readText } from "../fs.js";
import { logsDir } from "../paths.js";
import type { TaskMeta, TaskMetaHistoryItem } from "../types.js";

export interface TaskConsumptionRankingRow {
  taskId: string;
  title: string;
  project: string;
  status: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
  qaLoopCount: number;
}

export interface AgentConsumptionRankingRow {
  agent: string;
  stageCount: number;
  taskCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
  avgDurationMs: number;
  approvedCount: number;
  reprovedCount: number;
  approvalRate: number;
}

export interface ProjectConsumptionRankingRow {
  project: string;
  taskCount: number;
  activeCount: number;
  waitingHumanCount: number;
  failedCount: number;
  doneCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface MetricsTimelinePoint {
  date: string;
  taskCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
}

export interface BottleneckStageRow {
  stage: string;
  count: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface QaLoopMetrics {
  tasksWithQa: number;
  totalQaLoops: number;
  avgQaLoopsPerTask: number;
}

export interface AdvancedAnalyticsReport {
  tasks: TaskConsumptionRankingRow[];
  agents: AgentConsumptionRankingRow[];
  projects: ProjectConsumptionRankingRow[];
  timeline: MetricsTimelinePoint[];
  bottlenecks: BottleneckStageRow[];
  qaLoops: QaLoopMetrics;
}

interface TaskRollup {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
  qaLoopCount: number;
}

function countQaLoops(history: TaskMetaHistoryItem[]): number {
  const qaVisits = history.filter((item) => String(item.stage || "").toLowerCase().includes("qa")).length;
  return Math.max(0, qaVisits - 1);
}

function rollupTask(meta: TaskMeta): TaskRollup {
  const estimatedInputTokens = meta.history.reduce((sum, row) => sum + Number(row.estimatedInputTokens || 0), 0);
  const estimatedOutputTokens = meta.history.reduce((sum, row) => sum + Number(row.estimatedOutputTokens || 0), 0);
  const estimatedCostUsd = meta.history.reduce((sum, row) => sum + Number(row.estimatedCostUsd || 0), 0);
  const totalDurationMs = meta.history.reduce((sum, row) => sum + Number(row.durationMs || 0), 0);
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    totalDurationMs,
    qaLoopCount: countQaLoops(meta.history),
  };
}

async function loadTaskMetas(): Promise<TaskMeta[]> {
  const ids = await allTaskIds();
  const settled = await Promise.allSettled(ids.map((taskId) => loadTaskMeta(taskId)));
  return settled
    .filter((item): item is PromiseFulfilledResult<TaskMeta> => item.status === "fulfilled")
    .map((item) => item.value);
}

async function loadAgentDecisionStats(): Promise<Map<string, { approved: number; reproved: number }>> {
  const map = new Map<string, { approved: number; reproved: number }>();
  const files = await listAgentsWithLearnings();
  for (const fileAgentId of files) {
    const entries = await loadAllLearnings(fileAgentId);
    for (const entry of entries) {
      const key = String(entry.agentId || fileAgentId || "Unknown");
      const current = map.get(key) || { approved: 0, reproved: 0 };
      if (entry.outcome === "approved") current.approved += 1;
      if (entry.outcome === "reproved") current.reproved += 1;
      map.set(key, current);
    }
  }
  return map;
}

export async function getTaskConsumptionRanking(limit = 25): Promise<TaskConsumptionRankingRow[]> {
  const metas = await loadTaskMetas();
  return metas
    .map((meta) => {
      const rollup = rollupTask(meta);
      return {
        taskId: meta.taskId,
        title: meta.title,
        project: meta.project,
        status: meta.status,
        estimatedInputTokens: rollup.estimatedInputTokens,
        estimatedOutputTokens: rollup.estimatedOutputTokens,
        estimatedTotalTokens: rollup.estimatedInputTokens + rollup.estimatedOutputTokens,
        estimatedCostUsd: rollup.estimatedCostUsd,
        totalDurationMs: rollup.totalDurationMs,
        qaLoopCount: rollup.qaLoopCount,
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.estimatedTotalTokens - a.estimatedTotalTokens)
    .slice(0, Math.max(1, limit));
}

export async function getAgentConsumptionRanking(limit = 25): Promise<AgentConsumptionRankingRow[]> {
  const metas = await loadTaskMetas();
  const decisionStats = await loadAgentDecisionStats();
  const map = new Map<string, {
    stageCount: number;
    taskIds: Set<string>;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostUsd: number;
    totalDurationMs: number;
  }>();

  for (const meta of metas) {
    for (const row of meta.history) {
      const key = String(row.agent || "Unknown");
      const current = map.get(key) || {
        stageCount: 0,
        taskIds: new Set<string>(),
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        totalDurationMs: 0,
      };
      current.stageCount += 1;
      current.taskIds.add(meta.taskId);
      current.estimatedInputTokens += Number(row.estimatedInputTokens || 0);
      current.estimatedOutputTokens += Number(row.estimatedOutputTokens || 0);
      current.estimatedCostUsd += Number(row.estimatedCostUsd || 0);
      current.totalDurationMs += Number(row.durationMs || 0);
      map.set(key, current);
    }
  }

  return [...map.entries()]
    .map(([agent, value]) => {
      const decisions = decisionStats.get(agent) || { approved: 0, reproved: 0 };
      const totalDecisions = decisions.approved + decisions.reproved;
      return {
        agent,
        stageCount: value.stageCount,
        taskCount: value.taskIds.size,
        estimatedInputTokens: value.estimatedInputTokens,
        estimatedOutputTokens: value.estimatedOutputTokens,
        estimatedTotalTokens: value.estimatedInputTokens + value.estimatedOutputTokens,
        estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(6)),
        totalDurationMs: value.totalDurationMs,
        avgDurationMs: value.stageCount ? Math.round(value.totalDurationMs / value.stageCount) : 0,
        approvedCount: decisions.approved,
        reprovedCount: decisions.reproved,
        approvalRate: totalDecisions ? Number((decisions.approved / totalDecisions).toFixed(3)) : 0,
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.estimatedTotalTokens - a.estimatedTotalTokens)
    .slice(0, Math.max(1, limit));
}

export async function getProjectConsumptionRanking(limit = 25): Promise<ProjectConsumptionRankingRow[]> {
  const metas = await loadTaskMetas();
  const map = new Map<string, {
    taskCount: number;
    activeCount: number;
    waitingHumanCount: number;
    failedCount: number;
    doneCount: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostUsd: number;
    totalDurationMs: number;
  }>();

  for (const meta of metas) {
    const key = String(meta.project || "").trim() || "[unassigned]";
    const current = map.get(key) || {
      taskCount: 0,
      activeCount: 0,
      waitingHumanCount: 0,
      failedCount: 0,
      doneCount: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCostUsd: 0,
      totalDurationMs: 0,
    };
    current.taskCount += 1;
    if (["new", "in_progress", "waiting_agent"].includes(meta.status)) current.activeCount += 1;
    if (meta.status === "waiting_human" || meta.humanApprovalRequired) current.waitingHumanCount += 1;
    if (meta.status === "failed") current.failedCount += 1;
    if (meta.status === "done") current.doneCount += 1;
    const rollup = rollupTask(meta);
    current.estimatedInputTokens += rollup.estimatedInputTokens;
    current.estimatedOutputTokens += rollup.estimatedOutputTokens;
    current.estimatedCostUsd += rollup.estimatedCostUsd;
    current.totalDurationMs += rollup.totalDurationMs;
    map.set(key, current);
  }

  return [...map.entries()]
    .map(([project, value]) => ({
      project,
      taskCount: value.taskCount,
      activeCount: value.activeCount,
      waitingHumanCount: value.waitingHumanCount,
      failedCount: value.failedCount,
      doneCount: value.doneCount,
      estimatedInputTokens: value.estimatedInputTokens,
      estimatedOutputTokens: value.estimatedOutputTokens,
      estimatedTotalTokens: value.estimatedInputTokens + value.estimatedOutputTokens,
      estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(6)),
      totalDurationMs: value.totalDurationMs,
      avgDurationMs: value.taskCount ? Math.round(value.totalDurationMs / value.taskCount) : 0,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.estimatedTotalTokens - a.estimatedTotalTokens)
    .slice(0, Math.max(1, limit));
}

export async function getMetricsTimeline(days = 30): Promise<MetricsTimelinePoint[]> {
  const safeDays = Math.max(1, days);
  const fromMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const metas = await loadTaskMetas();
  const map = new Map<string, {
    taskIds: Set<string>;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostUsd: number;
    totalDurationMs: number;
  }>();

  for (const meta of metas) {
    for (const row of meta.history) {
      const endedMs = Date.parse(row.endedAt || "");
      if (!Number.isFinite(endedMs) || endedMs < fromMs) continue;
      const date = String(row.endedAt || "").slice(0, 10);
      const current = map.get(date) || {
        taskIds: new Set<string>(),
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        totalDurationMs: 0,
      };
      current.taskIds.add(meta.taskId);
      current.estimatedInputTokens += Number(row.estimatedInputTokens || 0);
      current.estimatedOutputTokens += Number(row.estimatedOutputTokens || 0);
      current.estimatedCostUsd += Number(row.estimatedCostUsd || 0);
      current.totalDurationMs += Number(row.durationMs || 0);
      map.set(date, current);
    }
  }

  return [...map.entries()]
    .map(([date, value]) => ({
      date,
      taskCount: value.taskIds.size,
      estimatedInputTokens: value.estimatedInputTokens,
      estimatedOutputTokens: value.estimatedOutputTokens,
      estimatedTotalTokens: value.estimatedInputTokens + value.estimatedOutputTokens,
      estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(6)),
      totalDurationMs: value.totalDurationMs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getBottleneckStages(limit = 15): Promise<BottleneckStageRow[]> {
  const metas = await loadTaskMetas();
  const map = new Map<string, { count: number; totalDurationMs: number }>();

  for (const meta of metas) {
    for (const row of meta.history) {
      const stage = String(row.stage || "").trim() || "[unknown]";
      const current = map.get(stage) || { count: 0, totalDurationMs: 0 };
      current.count += 1;
      current.totalDurationMs += Number(row.durationMs || 0);
      map.set(stage, current);
    }
  }

  return [...map.entries()]
    .map(([stage, value]) => ({
      stage,
      count: value.count,
      totalDurationMs: value.totalDurationMs,
      avgDurationMs: value.count ? Math.round(value.totalDurationMs / value.count) : 0,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, Math.max(1, limit));
}

export async function getQaLoopMetrics(): Promise<QaLoopMetrics> {
  const metas = await loadTaskMetas();
  const withQa = metas.filter((meta) => meta.history.some((row) => String(row.stage || "").toLowerCase().includes("qa")));
  const totalQaLoops = withQa.reduce((sum, meta) => sum + countQaLoops(meta.history), 0);
  return {
    tasksWithQa: withQa.length,
    totalQaLoops,
    avgQaLoopsPerTask: withQa.length ? Number((totalQaLoops / withQa.length).toFixed(3)) : 0,
  };
}

export async function getAdvancedAnalyticsReport(args?: {
  limit?: number;
  days?: number;
}): Promise<AdvancedAnalyticsReport> {
  const limit = Math.max(1, Number(args?.limit || 25));
  const days = Math.max(1, Number(args?.days || 30));
  const [tasks, agents, projects, timeline, bottlenecks, qaLoops] = await Promise.all([
    getTaskConsumptionRanking(limit),
    getAgentConsumptionRanking(limit),
    getProjectConsumptionRanking(limit),
    getMetricsTimeline(days),
    getBottleneckStages(limit),
    getQaLoopMetrics(),
  ]);
  return {
    tasks,
    agents,
    projects,
    timeline,
    bottlenecks,
    qaLoops,
  };
}

interface RuntimeEventRow {
  at: string;
  event: string;
  taskId?: string;
  stage?: string;
  agent?: string;
  payload?: Record<string, unknown>;
}

export interface OperationalTrendPoint {
  bucketStart: string;
  label: string;
  taskCount: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
}

export interface OperationalAgentBreakdownRow {
  agent: string;
  stageCount: number;
  taskCount: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  shareCostPct: number;
}

export interface OperationalBottleneckRow {
  label: string;
  stage: string;
  agent: string;
  count: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface OperationalReliabilityRow {
  agent: string;
  totalReviews: number;
  reproved: number;
  rejectionRate: number;
}

export interface OperationalComparisonDelta {
  current: number;
  previous: number;
  deltaPct: number | null;
}

export interface OperationalAnalyticsReport {
  range: {
    from: string;
    to: string;
    days: number;
    bucket: "hour" | "day";
    bucketHours: number;
  };
  totals: {
    estimatedTotalTokens: number;
    estimatedCostUsd: number;
  };
  trend: OperationalTrendPoint[];
  agentBreakdown: OperationalAgentBreakdownRow[];
  alerts: {
    costSpike: boolean;
    latestCostUsd: number;
    movingAverageCostUsd: number;
    thresholdUsd: number;
    deltaPct: number;
  };
  flowMetrics: {
    completedTasks: number;
    cycleTimeAvgMs: number;
    humanInterventionRate: number;
    autonomousRate: number;
    bottlenecks: OperationalBottleneckRow[];
  };
  reliability: {
    rejectionByAgent: OperationalReliabilityRow[];
    reviewSlaAvgMs: number;
    reviewSlaSamples: number;
  };
  comparison: {
    estimatedTotalTokens: OperationalComparisonDelta;
    estimatedCostUsd: OperationalComparisonDelta;
    cycleTimeAvgMs: OperationalComparisonDelta;
    humanInterventionRate: OperationalComparisonDelta;
    reviewSlaAvgMs: OperationalComparisonDelta;
  };
}

interface WindowAggregates {
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  completedTasks: number;
  cycleTimeAvgMs: number;
  humanInterventionRate: number;
  autonomousRate: number;
  bottlenecks: OperationalBottleneckRow[];
  rejectionByAgent: OperationalReliabilityRow[];
  reviewSlaAvgMs: number;
  reviewSlaSamples: number;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function parseMs(value: string | undefined): number {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

async function loadRuntimeEvents(): Promise<RuntimeEventRow[]> {
  const filePath = path.join(logsDir(), "runtime-events.jsonl");
  if (!(await exists(filePath))) return [];
  let raw = "";
  try {
    raw = await readText(filePath);
  } catch {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as RuntimeEventRow;
        return parsed;
      } catch {
        return null;
      }
    })
    .filter((row): row is RuntimeEventRow => Boolean(row && row.event));
}

function bucketStartMs(ms: number, bucketHours: number): number {
  const date = new Date(ms);
  if (bucketHours >= 24) {
    date.setUTCHours(0, 0, 0, 0);
  } else {
    const hour = date.getUTCHours();
    const roundedHour = Math.floor(hour / bucketHours) * bucketHours;
    date.setUTCHours(roundedHour, 0, 0, 0);
  }
  return date.getTime();
}

function formatBucketLabel(ms: number, bucketHours: number): string {
  const date = new Date(ms);
  if (bucketHours >= 24) {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function percentageDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function computeTrend(args: {
  metas: TaskMeta[];
  fromMs: number;
  toMs: number;
  bucketHours: number;
}): OperationalTrendPoint[] {
  const { metas, fromMs, toMs, bucketHours } = args;
  const bucketMs = bucketHours * 60 * 60 * 1000;
  const start = bucketStartMs(fromMs, bucketHours);
  const end = bucketStartMs(toMs, bucketHours);
  const map = new Map<number, { taskIds: Set<string>; estimatedTotalTokens: number; estimatedCostUsd: number }>();

  for (const meta of metas) {
    for (const row of meta.history) {
      const endedMs = parseMs(row.endedAt);
      if (endedMs < fromMs || endedMs > toMs) continue;
      const bucket = bucketStartMs(endedMs, bucketHours);
      const current = map.get(bucket) || { taskIds: new Set<string>(), estimatedTotalTokens: 0, estimatedCostUsd: 0 };
      current.taskIds.add(meta.taskId);
      current.estimatedTotalTokens += Number(row.estimatedTotalTokens || Number(row.estimatedInputTokens || 0) + Number(row.estimatedOutputTokens || 0));
      current.estimatedCostUsd += Number(row.estimatedCostUsd || 0);
      map.set(bucket, current);
    }
  }

  const points: OperationalTrendPoint[] = [];
  for (let cursor = start; cursor <= end; cursor += bucketMs) {
    const value = map.get(cursor) || { taskIds: new Set<string>(), estimatedTotalTokens: 0, estimatedCostUsd: 0 };
    points.push({
      bucketStart: new Date(cursor).toISOString(),
      label: formatBucketLabel(cursor, bucketHours),
      taskCount: value.taskIds.size,
      estimatedTotalTokens: Math.round(value.estimatedTotalTokens),
      estimatedCostUsd: round6(value.estimatedCostUsd),
    });
  }
  return points;
}

function computeReviewReliability(args: {
  events: RuntimeEventRow[];
  fromMs: number;
  toMs: number;
}): {
  rejectionByAgent: OperationalReliabilityRow[];
  reviewSlaAvgMs: number;
  reviewSlaSamples: number;
} {
  const sorted = args.events
    .slice()
    .sort((a, b) => parseMs(a.at) - parseMs(b.at));
  const pendingByTask = new Map<string, Array<{ atMs: number; agent: string }>>();
  const statsByAgent = new Map<string, { totalReviews: number; reproved: number }>();
  const reviewSlaDurations: number[] = [];

  for (const event of sorted) {
    const taskId = String(event.taskId || "");
    if (!taskId) continue;
    const atMs = parseMs(event.at);
    if (!atMs) continue;
    if (event.event === "task.review_required") {
      const payload = event.payload || {};
      const payloadAgent = String((payload.currentAgent || payload.agent || event.agent || "")).trim();
      const queue = pendingByTask.get(taskId) || [];
      queue.push({ atMs, agent: payloadAgent || "Unknown" });
      pendingByTask.set(taskId, queue);
      continue;
    }
    if (event.event !== "task.decision_recorded") continue;

    const payload = event.payload || {};
    const decision = String(payload.decision || "").toLowerCase();
    const queue = pendingByTask.get(taskId) || [];
    const pending = queue.length ? queue.shift() : null;
    if (queue.length) pendingByTask.set(taskId, queue);
    else pendingByTask.delete(taskId);

    const decisionAgent = String(
      (pending && pending.agent)
      || payload.currentAgent
      || payload.returnedTo
      || event.agent
      || "Unknown",
    );

    if (atMs < args.fromMs || atMs > args.toMs) continue;
    if (pending && atMs >= pending.atMs) {
      reviewSlaDurations.push(atMs - pending.atMs);
    }
    const current = statsByAgent.get(decisionAgent) || { totalReviews: 0, reproved: 0 };
    current.totalReviews += 1;
    if (decision === "reproved") current.reproved += 1;
    statsByAgent.set(decisionAgent, current);
  }

  const rejectionByAgent = [...statsByAgent.entries()]
    .map(([agent, value]) => ({
      agent,
      totalReviews: value.totalReviews,
      reproved: value.reproved,
      rejectionRate: value.totalReviews ? Number((value.reproved / value.totalReviews).toFixed(3)) : 0,
    }))
    .sort((a, b) => b.rejectionRate - a.rejectionRate || b.totalReviews - a.totalReviews);

  const reviewSlaAvgMs = reviewSlaDurations.length
    ? Math.round(reviewSlaDurations.reduce((sum, item) => sum + item, 0) / reviewSlaDurations.length)
    : 0;

  return {
    rejectionByAgent,
    reviewSlaAvgMs,
    reviewSlaSamples: reviewSlaDurations.length,
  };
}

function computeWindowAggregates(args: {
  metas: TaskMeta[];
  events: RuntimeEventRow[];
  fromMs: number;
  toMs: number;
  bottleneckLimit: number;
}): WindowAggregates {
  const { metas, events, fromMs, toMs, bottleneckLimit } = args;
  let estimatedTotalTokens = 0;
  let estimatedCostUsd = 0;

  const taskReviewFlags = new Map<string, boolean>();
  for (const event of events) {
    if (event.event !== "task.review_required" && event.event !== "task.decision_recorded") continue;
    const taskId = String(event.taskId || "");
    if (!taskId) continue;
    const atMs = parseMs(event.at);
    if (atMs <= toMs) taskReviewFlags.set(taskId, true);
  }

  const bottleneckMap = new Map<string, { stage: string; agent: string; count: number; totalDurationMs: number }>();
  const cycleDurations: number[] = [];
  let completedTasks = 0;
  let humanIntervenedCount = 0;

  for (const meta of metas) {
    for (const row of meta.history) {
      const endedMs = parseMs(row.endedAt);
      if (endedMs < fromMs || endedMs > toMs) continue;
      estimatedTotalTokens += Number(row.estimatedTotalTokens || Number(row.estimatedInputTokens || 0) + Number(row.estimatedOutputTokens || 0));
      estimatedCostUsd += Number(row.estimatedCostUsd || 0);
      const stage = String(row.stage || "[unknown]");
      const agent = String(row.agent || "Unknown");
      const key = `${stage}::${agent}`;
      const current = bottleneckMap.get(key) || { stage, agent, count: 0, totalDurationMs: 0 };
      current.count += 1;
      current.totalDurationMs += Number(row.durationMs || 0);
      bottleneckMap.set(key, current);
    }

    const doneAtMs = parseMs(meta.updatedAt);
    if (meta.status !== "done" || doneAtMs < fromMs || doneAtMs > toMs) continue;
    completedTasks += 1;
    const createdAtMs = parseMs(meta.createdAt);
    if (createdAtMs > 0 && doneAtMs >= createdAtMs) {
      cycleDurations.push(doneAtMs - createdAtMs);
    }
    if (taskReviewFlags.get(meta.taskId)) humanIntervenedCount += 1;
  }

  const cycleTimeAvgMs = cycleDurations.length
    ? Math.round(cycleDurations.reduce((sum, item) => sum + item, 0) / cycleDurations.length)
    : 0;

  const humanInterventionRate = completedTasks ? Number((humanIntervenedCount / completedTasks).toFixed(3)) : 0;
  const autonomousRate = completedTasks ? Number((1 - humanInterventionRate).toFixed(3)) : 0;

  const bottlenecks = [...bottleneckMap.values()]
    .map((row) => ({
      label: `${row.stage} • ${row.agent}`,
      stage: row.stage,
      agent: row.agent,
      count: row.count,
      avgDurationMs: row.count ? Math.round(row.totalDurationMs / row.count) : 0,
      totalDurationMs: row.totalDurationMs,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, Math.max(1, bottleneckLimit));

  const reliability = computeReviewReliability({
    events,
    fromMs,
    toMs,
  });

  return {
    estimatedTotalTokens: Math.round(estimatedTotalTokens),
    estimatedCostUsd: round6(estimatedCostUsd),
    completedTasks,
    cycleTimeAvgMs,
    humanInterventionRate,
    autonomousRate,
    bottlenecks,
    rejectionByAgent: reliability.rejectionByAgent,
    reviewSlaAvgMs: reliability.reviewSlaAvgMs,
    reviewSlaSamples: reliability.reviewSlaSamples,
  };
}

function computeAgentBreakdown(args: {
  metas: TaskMeta[];
  fromMs: number;
  toMs: number;
  limit: number;
}): OperationalAgentBreakdownRow[] {
  const map = new Map<string, {
    stageCount: number;
    taskIds: Set<string>;
    estimatedTotalTokens: number;
    estimatedCostUsd: number;
  }>();

  for (const meta of args.metas) {
    for (const row of meta.history) {
      const endedMs = parseMs(row.endedAt);
      if (endedMs < args.fromMs || endedMs > args.toMs) continue;
      const key = String(row.agent || "Unknown");
      const current = map.get(key) || {
        stageCount: 0,
        taskIds: new Set<string>(),
        estimatedTotalTokens: 0,
        estimatedCostUsd: 0,
      };
      current.stageCount += 1;
      current.taskIds.add(meta.taskId);
      current.estimatedTotalTokens += Number(row.estimatedTotalTokens || Number(row.estimatedInputTokens || 0) + Number(row.estimatedOutputTokens || 0));
      current.estimatedCostUsd += Number(row.estimatedCostUsd || 0);
      map.set(key, current);
    }
  }

  const totalCost = [...map.values()].reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  return [...map.entries()]
    .map(([agent, value]) => ({
      agent,
      stageCount: value.stageCount,
      taskCount: value.taskIds.size,
      estimatedTotalTokens: Math.round(value.estimatedTotalTokens),
      estimatedCostUsd: round6(value.estimatedCostUsd),
      shareCostPct: totalCost > 0 ? Number(((value.estimatedCostUsd / totalCost) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, Math.max(1, args.limit));
}

export async function getOperationalAnalyticsReport(args?: {
  days?: number;
  fromMs?: number;
  toMs?: number;
  limit?: number;
}): Promise<OperationalAnalyticsReport> {
  const nowMs = Date.now();
  const days = Math.max(1, Number(args?.days || 30));
  const toMs = Number.isFinite(Number(args?.toMs)) && Number(args?.toMs) > 0
    ? Number(args?.toMs)
    : nowMs;
  const fromMs = Number.isFinite(Number(args?.fromMs)) && Number(args?.fromMs) > 0
    ? Number(args?.fromMs)
    : (toMs - days * 24 * 60 * 60 * 1000);
  const safeFromMs = Math.min(fromMs, toMs - 60 * 1000);
  const safeToMs = Math.max(toMs, safeFromMs + 60 * 1000);
  const rangeMs = Math.max(60 * 1000, safeToMs - safeFromMs);
  const bucketHours = rangeMs <= 48 * 60 * 60 * 1000 ? 1 : 24;
  const bucket = bucketHours === 1 ? "hour" : "day";
  const limit = Math.max(1, Number(args?.limit || 12));

  const [metas, events] = await Promise.all([
    loadTaskMetas(),
    loadRuntimeEvents(),
  ]);

  const currentWindow = computeWindowAggregates({
    metas,
    events,
    fromMs: safeFromMs,
    toMs: safeToMs,
    bottleneckLimit: limit,
  });
  const previousWindow = computeWindowAggregates({
    metas,
    events,
    fromMs: safeFromMs - rangeMs,
    toMs: safeFromMs,
    bottleneckLimit: limit,
  });

  const trend = computeTrend({
    metas,
    fromMs: safeFromMs,
    toMs: safeToMs,
    bucketHours,
  });
  const latest = trend.length ? trend[trend.length - 1].estimatedCostUsd : 0;
  const movingWindow = trend.slice(Math.max(0, trend.length - 7), Math.max(0, trend.length - 1));
  const movingAverageCostUsd = movingWindow.length
    ? movingWindow.reduce((sum, row) => sum + row.estimatedCostUsd, 0) / movingWindow.length
    : 0;
  const thresholdUsd = movingAverageCostUsd * 1.3;
  const costSpike = movingAverageCostUsd > 0 && latest > thresholdUsd;
  const spikeDeltaPct = movingAverageCostUsd > 0
    ? Number((((latest - movingAverageCostUsd) / movingAverageCostUsd) * 100).toFixed(2))
    : 0;

  const agentBreakdown = computeAgentBreakdown({
    metas,
    fromMs: safeFromMs,
    toMs: safeToMs,
    limit,
  });

  return {
    range: {
      from: new Date(safeFromMs).toISOString(),
      to: new Date(safeToMs).toISOString(),
      days: Number((rangeMs / (24 * 60 * 60 * 1000)).toFixed(2)),
      bucket,
      bucketHours,
    },
    totals: {
      estimatedTotalTokens: currentWindow.estimatedTotalTokens,
      estimatedCostUsd: currentWindow.estimatedCostUsd,
    },
    trend,
    agentBreakdown,
    alerts: {
      costSpike,
      latestCostUsd: round6(latest),
      movingAverageCostUsd: round6(movingAverageCostUsd),
      thresholdUsd: round6(thresholdUsd),
      deltaPct: spikeDeltaPct,
    },
    flowMetrics: {
      completedTasks: currentWindow.completedTasks,
      cycleTimeAvgMs: currentWindow.cycleTimeAvgMs,
      humanInterventionRate: currentWindow.humanInterventionRate,
      autonomousRate: currentWindow.autonomousRate,
      bottlenecks: currentWindow.bottlenecks,
    },
    reliability: {
      rejectionByAgent: currentWindow.rejectionByAgent,
      reviewSlaAvgMs: currentWindow.reviewSlaAvgMs,
      reviewSlaSamples: currentWindow.reviewSlaSamples,
    },
    comparison: {
      estimatedTotalTokens: {
        current: currentWindow.estimatedTotalTokens,
        previous: previousWindow.estimatedTotalTokens,
        deltaPct: percentageDelta(currentWindow.estimatedTotalTokens, previousWindow.estimatedTotalTokens),
      },
      estimatedCostUsd: {
        current: currentWindow.estimatedCostUsd,
        previous: previousWindow.estimatedCostUsd,
        deltaPct: percentageDelta(currentWindow.estimatedCostUsd, previousWindow.estimatedCostUsd),
      },
      cycleTimeAvgMs: {
        current: currentWindow.cycleTimeAvgMs,
        previous: previousWindow.cycleTimeAvgMs,
        deltaPct: percentageDelta(currentWindow.cycleTimeAvgMs, previousWindow.cycleTimeAvgMs),
      },
      humanInterventionRate: {
        current: currentWindow.humanInterventionRate,
        previous: previousWindow.humanInterventionRate,
        deltaPct: percentageDelta(currentWindow.humanInterventionRate, previousWindow.humanInterventionRate),
      },
      reviewSlaAvgMs: {
        current: currentWindow.reviewSlaAvgMs,
        previous: previousWindow.reviewSlaAvgMs,
        deltaPct: percentageDelta(currentWindow.reviewSlaAvgMs, previousWindow.reviewSlaAvgMs),
      },
    },
  };
}
