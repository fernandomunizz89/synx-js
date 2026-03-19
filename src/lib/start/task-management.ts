import { STAGE_FILE_NAMES } from "../constants.js";
import { loadTaskMeta } from "../task.js";
import type { AgentName, TaskMeta, TaskType } from "../types.js";
import { synxWaiting } from "../synx-ui.js";
import { workerList as workers } from "../../workers/index.js";

export interface TaskProcessOutcome {
  taskId: string;
  processedStages: number;
}

export interface RemediationTarget {
  agent: AgentName;
  stage: string;
  requestFileName: string;
}

export interface StatusCounts {
  active: number;
  waitingHuman: number;
  failed: number;
  done: number;
}

export function taskUpdatedAtMs(meta: TaskMeta): number {
  const timestamp = meta.updatedAt || meta.createdAt;
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function byMostRecent(a: TaskMeta, b: TaskMeta): number {
  return taskUpdatedAtMs(b) - taskUpdatedAtMs(a);
}

export function summarizeTaskCounts(metas: TaskMeta[]): StatusCounts {
  return {
    active: metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
    waitingHuman: metas.filter((x) => x.status === "waiting_human").length,
    failed: metas.filter((x) => x.status === "failed").length,
    done: metas.filter((x) => x.status === "done").length,
  };
}

export function remediationTarget(taskType: TaskType): RemediationTarget {
  if (taskType === "Bug") {
    return {
      agent: "Synx QA Engineer",
      stage: "synx-qa-engineer",
      requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
    };
  }

  return {
    agent: "Synx Front Expert",
    stage: "synx-front-expert",
    requestFileName: STAGE_FILE_NAMES.synxFrontExpert,
  };
}

export function pickFocusedTask(metas: TaskMeta[]): { meta: TaskMeta; reason: string } {
  const sorted = [...metas].sort(byMostRecent);

  const waitingHuman = sorted.find((x) => x.status === "waiting_human");
  if (waitingHuman) {
    return {
      meta: waitingHuman,
      reason: "task waiting for your approval",
    };
  }

  const active = sorted.find((x) => ["new", "in_progress", "waiting_agent"].includes(x.status));
  if (active) {
    return {
      meta: active,
      reason: "task currently in progress",
    };
  }

  const latestDone = sorted.find((x) => x.status === "done");
  if (latestDone) {
    return {
      meta: latestDone,
      reason: "latest completed task",
    };
  }

  const latestFailed = sorted.find((x) => x.status === "failed");
  if (latestFailed) {
    return {
      meta: latestFailed,
      reason: "latest failed task",
    };
  }

  return {
    meta: sorted[0],
    reason: "most recently updated task",
  };
}

export function resolveHumanTask(metas: TaskMeta[]): TaskMeta | null {
  const waiting = metas
    .filter((meta) => meta.humanApprovalRequired || meta.status === "waiting_human")
    .sort(byMostRecent);
  return waiting[0] || null;
}

export function buildHumanInputLines(humanTask: TaskMeta | null): string[] {
  if (!humanTask) return [];

  return [
    synxWaiting(`Task waiting human review: ${humanTask.taskId}`),
    `Title: ${humanTask.title}`,
    `Type: ${humanTask.type} | Stage: ${humanTask.currentStage}`,
    "Type `approve` to finalize, or `reprove --reason \"...\"` to send it back.",
    "Tip: in this mode, free-text reply is treated as reprove reason.",
  ];
}

export async function processTaskWithWorkers(taskId: string): Promise<TaskProcessOutcome> {
  let processedStages = 0;
  for (const worker of workers) {
    const processed = await worker.tryProcess(taskId);
    if (processed) processedStages += 1;
  }
  return {
    taskId,
    processedStages,
  };
}

export async function processTasksWithConcurrency(taskIds: string[], concurrency: number): Promise<TaskProcessOutcome[]> {
  if (!taskIds.length) return [];
  const safeConcurrency = Math.max(1, Math.min(concurrency, taskIds.length));
  const outcomes = new Array<TaskProcessOutcome>(taskIds.length);
  let cursor = 0;

  const runners = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const nextIndex = cursor++;
      if (nextIndex >= taskIds.length) return;
      const taskId = taskIds[nextIndex];
      outcomes[nextIndex] = await processTaskWithWorkers(taskId);
    }
  });

  await Promise.all(runners);
  return outcomes.filter((item): item is TaskProcessOutcome => Boolean(item));
}

export async function loadMetasSafe(taskIds: string[]): Promise<TaskMeta[]> {
  const metaResults = await Promise.allSettled(taskIds.map((taskId) => loadTaskMeta(taskId)));
  return metaResults
    .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof loadTaskMeta>>> => item.status === "fulfilled")
    .map((item) => item.value);
}
