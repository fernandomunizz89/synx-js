import { allTaskIds, loadTaskMeta } from "../task.js";
import { listAgentsWithLearnings, loadAllLearnings } from "../learnings.js";
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
