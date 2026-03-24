import path from "node:path";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../constants.js";
import { loadResolvedProjectConfig } from "../config.js";
import { exists, listFiles, readJson, writeJson } from "../fs.js";
import { recordPipelineApproval, recordPipelineReproval, recordTaskOutcomeLearning } from "../learnings.js";
import { logRuntimeEvent, logTaskEvent } from "../logging.js";
import { taskDir, repoRoot } from "../paths.js";
import { loadPipelineState } from "../pipeline-state.js";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import { requestTaskCancel } from "../task-cancel.js";
import { nowIso } from "../utils.js";
import { deliverWebhook } from "../webhooks.js";
import type { AgentName, NewTaskInput, StageEnvelope, TaskCreationMetadata, TaskMergeStrategy, TaskPriority, TaskSourceKind, TaskType } from "../types.js";
import type { RollbackSummary } from "./task-rollback.js";

export type ProjectSource = "explicit" | "resolved-config" | "repository";
export type RollbackMode = "none" | "task";

export interface TaskServiceCreationMetadata extends TaskCreationMetadata {
  sourceKind?: TaskSourceKind;
}

export interface ReproveTaskServiceResult {
  taskId: string;
  targetAgent: AgentName;
  targetStage: string;
  rollbackStep?: string;
}

function remediationTarget(taskType: TaskType): {
  agent: AgentName;
  stage: string;
  requestFileName: string;
} {
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

function normalizeProjectName(value: string | undefined): string {
  return String(value || "").trim();
}

function inferProjectFromRepository(): string {
  const repo = path.basename(repoRoot()).trim();
  return repo || "workspace";
}

async function findPreviousDecisionAt(taskId: string, beforeIso: string): Promise<string | undefined> {
  const humanDir = path.join(taskDir(taskId), "human");
  if (!(await exists(humanDir))) return undefined;

  const beforeMs = Date.parse(beforeIso);
  if (!Number.isFinite(beforeMs)) return undefined;

  let files: string[] = [];
  try {
    files = await listFiles(humanDir);
  } catch {
    return undefined;
  }

  let best: string | undefined;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const file of files) {
    if (!/^90-final-review\.(approved|reproved)\.json$/.test(file)) continue;
    try {
      const record = await readJson<{ createdAt?: string }>(path.join(humanDir, file));
      const createdAt = String(record.createdAt || "").trim();
      const createdAtMs = Date.parse(createdAt);
      if (!Number.isFinite(createdAtMs)) continue;
      if (createdAtMs >= beforeMs) continue;
      if (createdAtMs > bestMs) {
        best = createdAt;
        bestMs = createdAtMs;
      }
    } catch {
      continue;
    }
  }

  return best;
}

export async function resolveProjectName(project: string | undefined): Promise<{ project: string; source: ProjectSource }> {
  const explicitProject = normalizeProjectName(project);
  if (explicitProject) {
    return { project: explicitProject, source: "explicit" };
  }

  try {
    const resolvedConfig = await loadResolvedProjectConfig();
    const configProject = normalizeProjectName(resolvedConfig.projectName);
    if (configProject) {
      return { project: configProject, source: "resolved-config" };
    }
  } catch {
    // Configuration may not be initialized yet. Fall back to repository name below.
  }

  return {
    project: inferProjectFromRepository(),
    source: "repository",
  };
}

export async function createTaskService(input: Omit<NewTaskInput, "project"> & {
  project?: string;
  metadata?: TaskServiceCreationMetadata;
}): Promise<{
  taskId: string;
  taskPath: string;
  project: string;
  projectSource: ProjectSource;
  parentTaskId?: string;
  rootProjectId?: string;
  sourceKind?: TaskSourceKind;
  dependsOn?: string[];
  blockedBy?: string[];
  priority?: TaskPriority;
  milestone?: string;
  parallelizable?: boolean;
  ownershipBoundaries?: string[];
  mergeStrategy?: TaskMergeStrategy;
}> {
  const resolvedProject = await resolveProjectName(input.project);
  const { metadata, project: _project, ...taskInput } = input;
  const newTaskInput: NewTaskInput = {
    ...taskInput,
    project: resolvedProject.project,
  };
  const created = metadata
    ? await createTask(newTaskInput, metadata)
    : await createTask(newTaskInput);
  await logRuntimeEvent({
    event: "task.created",
    taskId: created.taskId,
    source: "task-service",
    payload: {
      title: input.title,
      type: input.typeHint,
      project: resolvedProject.project,
      projectSource: resolvedProject.source,
      sourceKind: metadata?.sourceKind,
      parentTaskId: metadata?.parentTaskId,
      rootProjectId: metadata?.rootProjectId,
      dependsOn: metadata?.dependsOn,
      blockedBy: metadata?.blockedBy,
      priority: metadata?.priority,
      milestone: metadata?.milestone,
      parallelizable: metadata?.parallelizable,
      ownershipBoundaries: metadata?.ownershipBoundaries,
      mergeStrategy: metadata?.mergeStrategy,
    },
  });

  return {
    ...created,
    project: resolvedProject.project,
    projectSource: resolvedProject.source,
    parentTaskId: metadata?.parentTaskId,
    rootProjectId: metadata?.rootProjectId,
    sourceKind: metadata?.sourceKind,
    dependsOn: metadata?.dependsOn,
    blockedBy: metadata?.blockedBy,
    priority: metadata?.priority,
    milestone: metadata?.milestone,
    parallelizable: metadata?.parallelizable,
    ownershipBoundaries: metadata?.ownershipBoundaries,
    mergeStrategy: metadata?.mergeStrategy,
  };
}

export async function approveTaskService(taskId: string): Promise<void> {
  const meta = await loadTaskMeta(taskId);
  if (!meta.humanApprovalRequired) {
    throw new Error(`Task ${taskId} is not waiting for human approval.`);
  }

  const createdAt = nowIso();
  const previousDecisionAt = await findPreviousDecisionAt(taskId, createdAt);
  meta.status = "done";
  meta.currentStage = "approved";
  meta.currentAgent = "Human Review";
  meta.nextAgent = "";
  meta.humanApprovalRequired = false;
  await saveTaskMeta(taskId, meta);

  await writeJson(path.join(taskDir(taskId), "human", "90-final-review.approved.json"), {
    taskId,
    stage: "human-review",
    status: "done",
    createdAt,
    agent: "Human Review",
    output: {
      decision: "approved",
    },
  });
  await logTaskEvent(taskDir(taskId), "Human approval completed. Task marked as done.");
  await logRuntimeEvent({
    event: "task.approved",
    taskId,
    source: "task-service",
    payload: {
      decision: "approved",
    },
  });
  await logRuntimeEvent({
    event: "task.decision_recorded",
    taskId,
    source: "task-service",
    payload: {
      decision: "approved",
    },
  });

  let pipelineRecorded = false;
  try {
    const pipelineState = await loadPipelineState(taskId);
    await recordPipelineApproval(taskId, pipelineState.pipelineId, pipelineState.completedSteps);
    pipelineRecorded = true;
  } catch {
    // Non-pipeline task.
  }
  if (!pipelineRecorded) {
    await recordTaskOutcomeLearning({
      taskId,
      taskType: meta.type,
      sourceKind: meta.sourceKind,
      project: meta.project,
      history: meta.history,
      outcome: "approved",
      decidedAt: createdAt,
      rootProjectId: meta.rootProjectId,
      parentTaskId: meta.parentTaskId,
      previousDecisionAt,
    });
  }

  // Phase 5 — webhook delivery (best-effort)
  await deliverWebhook("task.approved", taskId, { decision: "approved" }).catch(() => {});
}

export async function reproveTaskService(args: {
  taskId: string;
  reason?: string;
  rollbackMode?: RollbackMode;
  rollbackStep?: string;
  rollbackSummary?: RollbackSummary | null;
}): Promise<ReproveTaskServiceResult> {
  const meta = await loadTaskMeta(args.taskId);
  if (!meta.humanApprovalRequired) {
    throw new Error(`Task ${args.taskId} is not waiting for human review.`);
  }

  const target = remediationTarget(meta.type);
  const createdAt = nowIso();
  const previousDecisionAt = await findPreviousDecisionAt(args.taskId, createdAt);
  const reason = String(args.reason || "").trim();
  const rollbackMode = args.rollbackMode || "none";
  const rollbackStep = String(args.rollbackStep || "").trim();
  const rollbackSummary = args.rollbackSummary || null;
  const qaDoneRef = `done/${DONE_FILE_NAMES.synxQaEngineer}`;
  const nextInputRef = qaDoneRef;

  meta.status = "waiting_agent";
  meta.currentStage = "reproved";
  meta.currentAgent = "Human Review";
  meta.nextAgent = target.agent;
  meta.humanApprovalRequired = false;
  await saveTaskMeta(args.taskId, meta);

  const stageRequest: StageEnvelope = {
    taskId: args.taskId,
    stage: target.stage,
    status: "request",
    createdAt,
    agent: target.agent,
    inputRef: nextInputRef,
  };

  await writeJson(path.join(taskDir(args.taskId), "inbox", target.requestFileName), stageRequest);
  await writeJson(path.join(taskDir(args.taskId), "human", "90-final-review.reproved.json"), {
    taskId: args.taskId,
    stage: "human-review",
    status: "done",
    createdAt,
    agent: "Human Review",
    output: {
      decision: "reproved",
      returnedTo: target.agent,
      reason,
      rollbackMode,
      rollbackStep,
      rollbackSummary,
    },
  });
  await logTaskEvent(taskDir(args.taskId), `Human reprove completed. Task returned to ${target.agent}. Reason: ${reason}`);
  await logRuntimeEvent({
    event: "task.reproved",
    taskId: args.taskId,
    source: "task-service",
    payload: {
      decision: "reproved",
      reason,
      rollbackMode,
      rollbackStep,
      returnedTo: target.agent,
    },
  });
  await logRuntimeEvent({
    event: "task.decision_recorded",
    taskId: args.taskId,
    source: "task-service",
    payload: {
      decision: "reproved",
      reason,
      rollbackMode,
      rollbackStep,
      returnedTo: target.agent,
    },
  });

  let pipelineRecorded = false;
  try {
    const pipelineState = await loadPipelineState(args.taskId);
    await recordPipelineReproval(args.taskId, pipelineState.pipelineId, pipelineState.completedSteps, reason);
    pipelineRecorded = true;
  } catch {
    // Non-pipeline task.
  }
  if (!pipelineRecorded) {
    await recordTaskOutcomeLearning({
      taskId: args.taskId,
      taskType: meta.type,
      sourceKind: meta.sourceKind,
      project: meta.project,
      history: meta.history,
      outcome: "reproved",
      decidedAt: createdAt,
      reproveReason: reason,
      rootProjectId: meta.rootProjectId,
      parentTaskId: meta.parentTaskId,
      previousDecisionAt,
    });
  }

  // Phase 5 — webhook delivery (best-effort)
  await deliverWebhook("task.reproved", args.taskId, { decision: "reproved", reason, returnedTo: target.agent }).catch(() => {});

  return {
    taskId: args.taskId,
    targetAgent: target.agent,
    targetStage: target.stage,
    rollbackStep,
  };
}

export async function cancelTaskService(args: { taskId: string; reason?: string }): Promise<void> {
  await requestTaskCancel({
    taskId: args.taskId,
    requestedBy: "human",
    reason: args.reason,
  });
  await logRuntimeEvent({
    event: "task.cancel_requested",
    taskId: args.taskId,
    source: "task-service",
    payload: {
      reason: String(args.reason || "").trim(),
    },
  });
}
