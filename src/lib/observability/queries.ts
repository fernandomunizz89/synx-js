import path from "node:path";
import { allTaskIds, loadTaskMeta } from "../task.js";
import { exists, listFiles, readJson, readText } from "../fs.js";
import { runtimeDir, taskDir } from "../paths.js";
import { processIsRunning } from "../runtime/locks.js";
import { loadPipelineState } from "../pipeline-state.js";
import { loadTaskCancelRequest } from "../task-cancel.js";
import { nowIso } from "../utils.js";
import { buildCollaborationMetricsReport } from "../collaboration-metrics.js";
import { buildProjectGraphSnapshot } from "../project-graph.js";
import { listFileLocks } from "../file-locks.js";
import type { NewTaskInput, TaskMeta } from "../types.js";
import type { CollaborationMetricsReport } from "../metrics-helpers.js";
import type {
  KanbanBoardDto,
  KanbanCardDto,
  OverviewDto,
  ReviewQueueItemDto,
  RuntimeStatusDto,
  TaskConsumptionDto,
  TaskDetailDto,
  TaskSummaryDto,
} from "./dto.js";

function sumTaskConsumption(meta: TaskMeta): TaskConsumptionDto {
  const estimatedInputTokens = meta.history.reduce((sum, item) => sum + Number(item.estimatedInputTokens || 0), 0);
  const estimatedOutputTokens = meta.history.reduce((sum, item) => sum + Number(item.estimatedOutputTokens || 0), 0);
  const estimatedCostUsd = meta.history.reduce((sum, item) => sum + Number(item.estimatedCostUsd || 0), 0);
  const totalDurationMs = meta.history.reduce((sum, item) => sum + Number(item.durationMs || 0), 0);
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    totalDurationMs,
  };
}

function mapTaskSummary(args: {
  meta: TaskMeta;
  childTaskIds?: string[];
  blockedBy?: string[];
  ready?: boolean;
  ownershipBoundaries?: string[];
  mergeStrategy?: "auto-rebase" | "manual-review";
  projectProgress?: TaskSummaryDto["projectProgress"];
}): TaskSummaryDto {
  const childTaskIds = args.childTaskIds || [];
  const blockedBy = args.blockedBy || [];
  const ready = Boolean(args.ready);
  const meta = args.meta;

  return {
    taskId: meta.taskId,
    title: meta.title,
    type: meta.type,
    typeHint: meta.type,
    project: meta.project,
    status: meta.status,
    currentStage: meta.currentStage,
    stage: meta.currentStage,
    currentAgent: meta.currentAgent || "",
    nextAgent: meta.nextAgent || "",
    humanApprovalRequired: meta.humanApprovalRequired,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    parentTaskId: meta.parentTaskId,
    rootProjectId: meta.rootProjectId,
    sourceKind: meta.sourceKind,
    dependsOn: meta.dependsOn || [],
    blockedBy,
    priority: Number(meta.priority || 3),
    milestone: meta.milestone,
    parallelizable: meta.parallelizable !== false,
    ownershipBoundaries: args.ownershipBoundaries || (meta.ownershipBoundaries || []),
    mergeStrategy: args.mergeStrategy || meta.mergeStrategy || "auto-rebase",
    dispatchLockReservation: meta.dispatchLockReservation,
    ready,
    childTaskIds,
    projectProgress: args.projectProgress || null,
    consumption: sumTaskConsumption(meta),
  };
}

function byUpdatedDesc(a: TaskSummaryDto, b: TaskSummaryDto): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

async function listFilesSafe(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  try {
    return await listFiles(root);
  } catch {
    return [];
  }
}

async function readLastLinesSafe(filePath: string, maxLines: number): Promise<string[]> {
  if (!(await exists(filePath))) return [];
  try {
    const raw = await readText(filePath);
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

export async function listTaskSummaries(): Promise<TaskSummaryDto[]> {
  const taskIds = await allTaskIds();
  const settled = await Promise.allSettled(taskIds.map((taskId) => loadTaskMeta(taskId)));
  const metas = settled
    .filter((item): item is PromiseFulfilledResult<TaskMeta> => item.status === "fulfilled")
    .map((item) => item.value);

  const lockMap = await listFileLocks().catch(() => ({ version: 1 as const, locks: {}, byTask: {}, updatedAt: nowIso() }));
  const snapshot = buildProjectGraphSnapshot(metas, { lockMap });

  return metas
    .map((meta) => mapTaskSummary({
      meta,
      childTaskIds: snapshot.childTaskIdsByParent.get(meta.taskId) || [],
      blockedBy: snapshot.nodeByTaskId.get(meta.taskId)?.blockedBy || [],
      ready: snapshot.nodeByTaskId.get(meta.taskId)?.ready || false,
      ownershipBoundaries: snapshot.nodeByTaskId.get(meta.taskId)?.ownershipBoundaries || [],
      mergeStrategy: snapshot.nodeByTaskId.get(meta.taskId)?.mergeStrategy || "auto-rebase",
      projectProgress: snapshot.projectProgressByParent.get(meta.taskId) || null,
    }))
    .sort(byUpdatedDesc);
}

export async function listReviewQueue(): Promise<ReviewQueueItemDto[]> {
  const summaries = await listTaskSummaries();
  return summaries
    .filter((item) => item.humanApprovalRequired || item.status === "waiting_human")
    .map((item) => ({
      ...item,
      waitingSinceAt: item.updatedAt || item.createdAt,
    }))
    .sort((a, b) => Date.parse(b.waitingSinceAt) - Date.parse(a.waitingSinceAt));
}

export async function readRuntimeStatus(): Promise<RuntimeStatusDto> {
  const daemonStatePath = path.join(runtimeDir(), "daemon-state.json");
  if (!(await exists(daemonStatePath))) {
    return { isAlive: false };
  }

  try {
    const state = await readJson<{
      pid?: number;
      lastHeartbeatAt?: string;
      loop?: number;
      taskCount?: number;
      activeTaskCount?: number;
      workerCount?: number;
    }>(daemonStatePath);

    const isAlive = typeof state.pid === "number" ? processIsRunning(state.pid) : false;
    return {
      isAlive,
      pid: state.pid,
      lastHeartbeatAt: state.lastHeartbeatAt,
      loop: state.loop,
      taskCount: state.taskCount,
      activeTaskCount: state.activeTaskCount,
      workerCount: state.workerCount,
    };
  } catch {
    return { isAlive: false };
  }
}

export async function getOverview(): Promise<OverviewDto> {
  const [runtime, summaries, reviewQueue] = await Promise.all([
    readRuntimeStatus(),
    listTaskSummaries(),
    listReviewQueue(),
  ]);

  const counts = {
    total: summaries.length,
    active: summaries.filter((item) => ["new", "in_progress", "waiting_agent"].includes(item.status)).length,
    waitingHuman: summaries.filter((item) => item.status === "waiting_human" || item.humanApprovalRequired).length,
    failed: summaries.filter((item) => item.status === "failed").length,
    done: summaries.filter((item) => item.status === "done").length,
  };

  const estimatedInputTokens = summaries.reduce((sum, item) => sum + item.consumption.estimatedInputTokens, 0);
  const estimatedOutputTokens = summaries.reduce((sum, item) => sum + item.consumption.estimatedOutputTokens, 0);
  const estimatedCostUsd = summaries.reduce((sum, item) => sum + item.consumption.estimatedCostUsd, 0);

  return {
    runtime,
    counts,
    reviewQueueCount: reviewQueue.length,
    consumption: {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      totalDurationMs: 0,
    },
    updatedAt: nowIso(),
  };
}

export async function getTaskDetail(taskId: string): Promise<TaskDetailDto | null> {
  let meta: TaskMeta;
  try {
    meta = await loadTaskMeta(taskId);
  } catch {
    return null;
  }

  const base = taskDir(taskId);
  const [views, artifacts, doneArtifacts, humanArtifacts, recentEvents, cancelRequest, inputPayload, summaries] = await Promise.all([
    listFilesSafe(path.join(base, "views")),
    listFilesSafe(path.join(base, "artifacts")),
    listFilesSafe(path.join(base, "done")),
    listFilesSafe(path.join(base, "human")),
    readLastLinesSafe(path.join(base, "logs", "events.log"), 60),
    loadTaskCancelRequest(taskId),
    readJson<NewTaskInput>(path.join(base, "input", "new-task.json")).catch(() => null),
    listTaskSummaries(),
  ]);

  let pipelineState = null;
  try {
    pipelineState = await loadPipelineState(taskId);
  } catch {
    pipelineState = null;
  }

  const detailSummary = summaries.find((item) => item.taskId === taskId)
    || mapTaskSummary({
      meta,
      childTaskIds: summaries.filter((item) => item.parentTaskId === taskId).map((item) => item.taskId),
      blockedBy: meta.blockedBy || [],
      ready: ["new", "waiting_agent"].includes(meta.status) && (meta.blockedBy || []).length === 0,
      ownershipBoundaries: meta.ownershipBoundaries || [],
      mergeStrategy: meta.mergeStrategy || "auto-rebase",
      projectProgress: null,
    });
  const childTasks = summaries
    .filter((item) => item.parentTaskId === taskId)
    .map((item) => ({
      taskId: item.taskId,
      title: item.title,
      status: item.status,
      type: item.type,
      blockedBy: item.blockedBy || [],
      ready: item.ready,
      priority: item.priority || 3,
      milestone: item.milestone,
    }));

  return {
    ...detailSummary,
    rawRequest: inputPayload?.rawRequest,
    history: meta.history,
    recentEvents,
    views,
    artifacts,
    doneArtifacts,
    humanArtifacts,
    childTasks,
    pipelineState,
    cancelRequest,
  };
}

const ALL_STATUSES: TaskMeta["status"][] = [
  "new", "in_progress", "waiting_agent", "waiting_human", "blocked", "failed", "done", "archived",
];

export async function getKanbanBoard(): Promise<KanbanBoardDto> {
  const summaries = await listTaskSummaries();

  const board = Object.fromEntries(ALL_STATUSES.map((s) => [s, []])) as unknown as KanbanBoardDto;

  for (const task of summaries) {
    const card: KanbanCardDto = {
      taskId: task.taskId,
      title: task.title,
      type: task.type,
      status: task.status,
      project: task.project,
      priority: task.priority,
      milestone: task.milestone,
      currentAgent: task.currentAgent,
      humanApprovalRequired: task.humanApprovalRequired,
      parentTaskId: task.parentTaskId,
      sourceKind: task.sourceKind,
      childTaskIds: task.childTaskIds,
      totalDurationMs: task.consumption.totalDurationMs,
      totalCostUsd: task.consumption.estimatedCostUsd,
      updatedAt: task.updatedAt,
    };
    board[task.status].push(card);
  }

  return board;
}

export async function getMetricsOverview(hours = 24): Promise<CollaborationMetricsReport> {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  const untilMs = Date.now();
  const sinceMs = untilMs - Math.round(safeHours * 60 * 60 * 1000);
  return buildCollaborationMetricsReport({ sinceMs, untilMs });
}
