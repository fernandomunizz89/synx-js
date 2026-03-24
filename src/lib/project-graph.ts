import { saveTaskMeta } from "./task.js";
import type { TaskMeta, TaskStatus } from "./types.js";

const READY_QUEUE_STATUSES: TaskStatus[] = ["new", "waiting_agent"];
const ACTIVE_STATUSES: TaskStatus[] = ["new", "waiting_agent", "in_progress"];
const TERMINAL_STATUSES: TaskStatus[] = ["done", "failed", "blocked", "archived"];

export interface ProjectMilestoneProgress {
  milestone: string;
  total: number;
  done: number;
  active: number;
  blocked: number;
}

export interface ProjectProgressSummary {
  parentTaskId: string;
  totalChildren: number;
  doneChildren: number;
  failedChildren: number;
  blockedChildren: number;
  activeChildren: number;
  readyChildren: number;
  completionRatio: number;
  state: "not_started" | "in_progress" | "blocked" | "failed" | "done";
  milestones: ProjectMilestoneProgress[];
}

export interface TaskGraphNode {
  taskId: string;
  dependsOn: string[];
  blockedBy: string[];
  ready: boolean;
  priority: number;
  milestone?: string;
  parallelizable: boolean;
}

export interface ProjectGraphSnapshot {
  nodeByTaskId: Map<string, TaskGraphNode>;
  readyTaskIds: string[];
  childTaskIdsByParent: Map<string, string[]>;
  projectProgressByParent: Map<string, ProjectProgressSummary>;
}

export interface PersistProjectGraphResult extends ProjectGraphSnapshot {
  updatedTaskIds: string[];
}

function isReadyQueueStatus(status: TaskStatus): boolean {
  return READY_QUEUE_STATUSES.includes(status);
}

function isActiveStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function normalizeTaskId(value: unknown): string | undefined {
  const taskId = typeof value === "string" ? value.trim() : "";
  return taskId || undefined;
}

function normalizeTaskIdList(value: unknown, taskId: string): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeTaskId(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => item !== taskId);
  return Array.from(new Set(normalized));
}

function normalizePriority(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 3;
  return Math.min(5, Math.max(1, parsed));
}

function normalizeMilestone(value: unknown): string | undefined {
  const milestone = typeof value === "string" ? value.trim() : "";
  return milestone || undefined;
}

function normalizeParallelizable(value: unknown): boolean {
  return value !== false;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function byPriorityAndAgeAsc(a: TaskMeta, b: TaskMeta): number {
  const priorityDiff = normalizePriority(b.priority) - normalizePriority(a.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const aCreatedAtMs = Date.parse(a.createdAt || "");
  const bCreatedAtMs = Date.parse(b.createdAt || "");
  if (Number.isFinite(aCreatedAtMs) && Number.isFinite(bCreatedAtMs) && aCreatedAtMs !== bCreatedAtMs) {
    return aCreatedAtMs - bCreatedAtMs;
  }

  return a.taskId.localeCompare(b.taskId);
}

function buildChildTaskIdsByParent(metas: TaskMeta[], metaById: Map<string, TaskMeta>): Map<string, string[]> {
  const childTaskIdsByParent = new Map<string, string[]>();
  for (const meta of metas) {
    if (!meta.parentTaskId) continue;
    const list = childTaskIdsByParent.get(meta.parentTaskId) || [];
    list.push(meta.taskId);
    childTaskIdsByParent.set(meta.parentTaskId, list);
  }

  for (const [parentTaskId, childTaskIds] of childTaskIdsByParent.entries()) {
    childTaskIds.sort((a, b) => {
      const aMeta = metaById.get(a);
      const bMeta = metaById.get(b);
      return Date.parse(aMeta?.createdAt || "") - Date.parse(bMeta?.createdAt || "");
    });
    childTaskIdsByParent.set(parentTaskId, childTaskIds);
  }

  return childTaskIdsByParent;
}

export function buildProjectGraphSnapshot(metas: TaskMeta[]): ProjectGraphSnapshot {
  const metaById = new Map(metas.map((meta) => [meta.taskId, meta]));
  const childTaskIdsByParent = buildChildTaskIdsByParent(metas, metaById);
  const dependencyBlockersByTaskId = new Map<string, string[]>();
  const conflictBlockersByTaskId = new Map<string, string[]>();

  for (const meta of metas) {
    const dependsOn = normalizeTaskIdList(meta.dependsOn, meta.taskId);
    const blockers = dependsOn.filter((dependencyTaskId) => {
      const dependencyMeta = metaById.get(dependencyTaskId);
      return !dependencyMeta || dependencyMeta.status !== "done";
    });
    dependencyBlockersByTaskId.set(meta.taskId, blockers);
  }

  const nonParallelizableByProject = new Map<string, TaskMeta[]>();
  for (const meta of metas) {
    if (meta.sourceKind !== "project-subtask") continue;
    if (normalizeParallelizable(meta.parallelizable)) continue;
    if (isTerminalStatus(meta.status)) continue;

    const projectId = normalizeTaskId(meta.rootProjectId) || meta.taskId;
    const list = nonParallelizableByProject.get(projectId) || [];
    list.push(meta);
    nonParallelizableByProject.set(projectId, list);
  }

  for (const subtasks of nonParallelizableByProject.values()) {
    const candidateSubtasks = subtasks
      .filter((meta) => isActiveStatus(meta.status))
      .filter((meta) => (dependencyBlockersByTaskId.get(meta.taskId) || []).length === 0);
    if (!candidateSubtasks.length) continue;

    const runningSubtask = candidateSubtasks.find((meta) => meta.status === "in_progress");
    const unlockedSubtask = runningSubtask || [...candidateSubtasks].sort(byPriorityAndAgeAsc)[0];
    if (!unlockedSubtask) continue;

    for (const blockedCandidate of candidateSubtasks) {
      if (blockedCandidate.taskId === unlockedSubtask.taskId) continue;
      const list = conflictBlockersByTaskId.get(blockedCandidate.taskId) || [];
      list.push(unlockedSubtask.taskId);
      conflictBlockersByTaskId.set(blockedCandidate.taskId, list);
    }
  }

  const nodeByTaskId = new Map<string, TaskGraphNode>();
  for (const meta of metas) {
    const dependsOn = normalizeTaskIdList(meta.dependsOn, meta.taskId);
    const computedBlockedBy = Array.from(new Set([
      ...(dependencyBlockersByTaskId.get(meta.taskId) || []),
      ...(conflictBlockersByTaskId.get(meta.taskId) || []),
    ]));
    const blockedBy = isActiveStatus(meta.status) ? computedBlockedBy : [];
    const ready = isReadyQueueStatus(meta.status) && blockedBy.length === 0;
    nodeByTaskId.set(meta.taskId, {
      taskId: meta.taskId,
      dependsOn,
      blockedBy,
      ready,
      priority: normalizePriority(meta.priority),
      milestone: normalizeMilestone(meta.milestone),
      parallelizable: normalizeParallelizable(meta.parallelizable),
    });
  }

  const readyTaskIds = metas
    .filter((meta) => nodeByTaskId.get(meta.taskId)?.ready)
    .sort(byPriorityAndAgeAsc)
    .map((meta) => meta.taskId);

  const projectProgressByParent = new Map<string, ProjectProgressSummary>();
  for (const [parentTaskId, childTaskIds] of childTaskIdsByParent.entries()) {
    const childMetas = childTaskIds.map((taskId) => metaById.get(taskId)).filter((meta): meta is TaskMeta => Boolean(meta));
    const milestoneMap = new Map<string, ProjectMilestoneProgress>();
    let doneChildren = 0;
    let failedChildren = 0;
    let blockedChildren = 0;
    let activeChildren = 0;
    let readyChildren = 0;

    for (const childMeta of childMetas) {
      const childNode = nodeByTaskId.get(childMeta.taskId);
      const childBlocked = Boolean(childNode?.blockedBy.length && isActiveStatus(childMeta.status));
      const childActive = isActiveStatus(childMeta.status);
      const childDone = childMeta.status === "done";
      const childFailed = childMeta.status === "failed" || childMeta.status === "blocked";
      const childReady = Boolean(childNode?.ready);

      if (childDone) doneChildren += 1;
      if (childFailed) failedChildren += 1;
      if (childBlocked) blockedChildren += 1;
      if (childActive) activeChildren += 1;
      if (childReady) readyChildren += 1;

      const milestone = childNode?.milestone || "unassigned";
      const row = milestoneMap.get(milestone) || {
        milestone,
        total: 0,
        done: 0,
        active: 0,
        blocked: 0,
      };
      row.total += 1;
      if (childDone) row.done += 1;
      if (childActive) row.active += 1;
      if (childBlocked) row.blocked += 1;
      milestoneMap.set(milestone, row);
    }

    const totalChildren = childMetas.length;
    const completionRatio = totalChildren > 0 ? Number((doneChildren / totalChildren).toFixed(4)) : 0;
    const state: ProjectProgressSummary["state"] = totalChildren === 0
      ? "not_started"
      : doneChildren === totalChildren
      ? "done"
      : failedChildren > 0 && activeChildren === 0
      ? "failed"
      : blockedChildren > 0 && readyChildren === 0
      ? "blocked"
      : "in_progress";

    const milestones = Array.from(milestoneMap.values())
      .sort((a, b) => {
        if (a.milestone === "unassigned" && b.milestone !== "unassigned") return 1;
        if (a.milestone !== "unassigned" && b.milestone === "unassigned") return -1;
        return a.milestone.localeCompare(b.milestone);
      });

    projectProgressByParent.set(parentTaskId, {
      parentTaskId,
      totalChildren,
      doneChildren,
      failedChildren,
      blockedChildren,
      activeChildren,
      readyChildren,
      completionRatio,
      state,
      milestones,
    });
  }

  return {
    nodeByTaskId,
    readyTaskIds,
    childTaskIdsByParent,
    projectProgressByParent,
  };
}

export async function persistProjectGraphState(metas: TaskMeta[]): Promise<PersistProjectGraphResult> {
  const snapshot = buildProjectGraphSnapshot(metas);
  const updatedTaskIds: string[] = [];

  for (const meta of metas) {
    const node = snapshot.nodeByTaskId.get(meta.taskId);
    const desiredBlockedBy = node?.blockedBy || [];
    const currentBlockedBy = normalizeTaskIdList(meta.blockedBy, meta.taskId);
    let changed = false;

    if (!arraysEqual(currentBlockedBy, desiredBlockedBy)) {
      meta.blockedBy = desiredBlockedBy;
      changed = true;
    }

    const projectProgress = snapshot.projectProgressByParent.get(meta.taskId);
    const isProjectParent = Boolean(projectProgress) && (meta.sourceKind === "project-intake" || meta.type === "Project");
    if (isProjectParent && projectProgress) {
      const projectComplete = projectProgress.totalChildren > 0 && projectProgress.doneChildren === projectProgress.totalChildren;
      const projectFailed = projectProgress.failedChildren > 0 && projectProgress.activeChildren === 0;

      if (projectComplete && meta.status !== "done") {
        meta.status = "done";
        meta.currentStage = "project-complete";
        meta.currentAgent = "Project Orchestrator";
        meta.nextAgent = "";
        meta.humanApprovalRequired = false;
        changed = true;
      } else if (projectFailed && meta.status !== "failed") {
        meta.status = "failed";
        meta.currentStage = "project-failed";
        meta.currentAgent = "Project Orchestrator";
        meta.nextAgent = "";
        meta.humanApprovalRequired = false;
        changed = true;
      } else if (!projectComplete && !projectFailed && meta.status !== "in_progress") {
        meta.status = "in_progress";
        if (meta.currentStage === "project-complete" || meta.currentStage === "project-failed") {
          meta.currentStage = "project-tracking";
        }
        changed = true;
      }
    }

    if (!changed) continue;
    await saveTaskMeta(meta.taskId, meta);
    updatedTaskIds.push(meta.taskId);
  }

  return {
    ...snapshot,
    updatedTaskIds,
  };
}
