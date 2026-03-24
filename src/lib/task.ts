import path from "node:path";
import { STAGE_FILE_NAMES } from "./constants.js";
import { ensureDir, exists, listDirectories, readJsonValidated, writeJson, writeText } from "./fs.js";
import { taskDir, tasksDir } from "./paths.js";
import type {
  NewTaskInput,
  StageEnvelope,
  TaskCreationMetadata,
  TaskMergeStrategy,
  TaskMeta,
  TaskMetaHistoryItem,
  TaskPriority,
  TaskSourceKind,
} from "./types.js";
import { nowIso, randomId, slugify, todayDate } from "./utils.js";
import { taskMetaSchema } from "./schema.js";

const DEFAULT_TASK_PRIORITY: TaskPriority = 3;
const DEFAULT_TASK_MERGE_STRATEGY: TaskMergeStrategy = "auto-rebase";

function normalizeTaskMetaHistoryAgent(agent: string): TaskMetaHistoryItem["agent"] {
  if (agent === "System") return "Human Review";
  return agent as TaskMetaHistoryItem["agent"];
}

function normalizeTaskMetaAgent(agent: string): TaskMeta["currentAgent"] {
  if (agent === "System" || agent === "[none]") return "";
  return agent as TaskMeta["currentAgent"];
}

function normalizeOptionalTaskId(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeTaskIdList(value: unknown, options?: { excludeTaskId?: string }): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeOptionalTaskId(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => (options?.excludeTaskId ? item !== options.excludeTaskId : true));
  return Array.from(new Set(normalized));
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_TASK_PRIORITY;
  const safe = Math.min(5, Math.max(1, parsed));
  return safe as TaskPriority;
}

function normalizeTaskMilestone(value: unknown): string | undefined {
  const milestone = typeof value === "string" ? value.trim() : "";
  return milestone || undefined;
}

function normalizeTaskParallelizable(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no"].includes(normalized)) return false;
    if (["true", "1", "yes"].includes(normalized)) return true;
  }
  return true;
}

function normalizeOwnershipBoundary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  return normalized || undefined;
}

function normalizeOwnershipBoundaries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeOwnershipBoundary(item))
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(normalized));
}

function normalizeTaskMergeStrategy(value: unknown): TaskMergeStrategy {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "manual-review") return "manual-review";
  return DEFAULT_TASK_MERGE_STRATEGY;
}

function inferSourceKind(typeHint: NewTaskInput["typeHint"], parentTaskId?: string): TaskSourceKind {
  if (parentTaskId) return "project-subtask";
  return typeHint === "Project" ? "project-intake" : "standalone";
}

function normalizeTaskSourceKind(args: {
  sourceKind?: string;
  typeHint: NewTaskInput["typeHint"];
  parentTaskId?: string;
}): TaskSourceKind {
  const value = String(args.sourceKind || "").trim().toLowerCase();
  if (value === "standalone" || value === "project-intake" || value === "project-subtask") {
    return value;
  }
  return inferSourceKind(args.typeHint, args.parentTaskId);
}

function resolveTaskRelationshipMeta(args: {
  taskId: string;
  typeHint: NewTaskInput["typeHint"];
  metadata?: TaskCreationMetadata;
}): Pick<TaskMeta, "parentTaskId" | "rootProjectId" | "sourceKind"> {
  const parentTaskId = normalizeOptionalTaskId(args.metadata?.parentTaskId);
  const sourceKind = normalizeTaskSourceKind({
    sourceKind: args.metadata?.sourceKind,
    typeHint: args.typeHint,
    parentTaskId,
  });
  const rootProjectId = normalizeOptionalTaskId(args.metadata?.rootProjectId)
    || (sourceKind === "project-subtask" ? (parentTaskId || args.taskId) : args.taskId);
  return {
    parentTaskId,
    rootProjectId,
    sourceKind,
  };
}

function resolveTaskExecutionMeta(args: {
  taskId: string;
  metadata?: TaskCreationMetadata;
}): Pick<TaskMeta, "dependsOn" | "blockedBy" | "priority" | "milestone" | "parallelizable" | "ownershipBoundaries" | "mergeStrategy"> {
  const dependsOn = normalizeTaskIdList(args.metadata?.dependsOn, { excludeTaskId: args.taskId });
  const blockedBy = normalizeTaskIdList(args.metadata?.blockedBy, { excludeTaskId: args.taskId });
  const mergedBlockedBy = Array.from(new Set([...dependsOn, ...blockedBy]));
  const priority = normalizeTaskPriority(args.metadata?.priority);
  const milestone = normalizeTaskMilestone(args.metadata?.milestone);
  const parallelizable = normalizeTaskParallelizable(args.metadata?.parallelizable);
  const ownershipBoundaries = normalizeOwnershipBoundaries(args.metadata?.ownershipBoundaries);
  const mergeStrategy = normalizeTaskMergeStrategy(args.metadata?.mergeStrategy);
  return {
    dependsOn,
    blockedBy: mergedBlockedBy,
    priority,
    milestone,
    parallelizable,
    ownershipBoundaries,
    mergeStrategy,
  };
}

export async function ensureTaskStructure(baseTaskDir: string): Promise<void> {
  const dirs = ["input", "inbox", "working", "done", "failed", "human", "artifacts", "logs", "views"];
  for (const dir of dirs) await ensureDir(path.join(baseTaskDir, dir));
}

function resolveInitialStage(input: NewTaskInput): {
  stage: string;
  requestFileName: string;
  agent: TaskMeta["nextAgent"];
} {
  if (input.typeHint === "Project") {
    return {
      stage: "project-orchestrator",
      requestFileName: STAGE_FILE_NAMES.projectOrchestrator,
      agent: "Project Orchestrator",
    };
  }

  return {
    stage: "dispatcher",
    requestFileName: STAGE_FILE_NAMES.dispatcher,
    agent: "Dispatcher",
  };
}

export async function createTask(input: NewTaskInput, metadata?: TaskCreationMetadata): Promise<{ taskId: string; taskPath: string }> {
  const id = `task-${todayDate()}-${randomId(4)}-${slugify(input.title)}`;
  const dir = taskDir(id);
  await ensureTaskStructure(dir);
  const entryStage = resolveInitialStage(input);
  const createdAt = nowIso();
  const relationshipMeta = resolveTaskRelationshipMeta({
    taskId: id,
    typeHint: input.typeHint,
    metadata,
  });
  const executionMeta = resolveTaskExecutionMeta({
    taskId: id,
    metadata,
  });

  const meta: TaskMeta = {
    taskId: id,
    title: input.title,
    type: input.typeHint,
    project: input.project,
    status: "new",
    currentStage: "submitted",
    currentAgent: "",
    nextAgent: entryStage.agent,
    humanApprovalRequired: false,
    createdAt,
    updatedAt: createdAt,
    parentTaskId: relationshipMeta.parentTaskId,
    rootProjectId: relationshipMeta.rootProjectId,
    sourceKind: relationshipMeta.sourceKind,
    dependsOn: executionMeta.dependsOn,
    blockedBy: executionMeta.blockedBy,
    priority: executionMeta.priority,
    milestone: executionMeta.milestone,
    parallelizable: executionMeta.parallelizable,
    ownershipBoundaries: executionMeta.ownershipBoundaries,
    mergeStrategy: executionMeta.mergeStrategy,
    history: [],
  };

  await writeJson(path.join(dir, "meta.json"), meta);
  await writeJson(path.join(dir, "input", "new-task.json"), input);
  await writeJson(path.join(dir, "inbox", entryStage.requestFileName), {
    taskId: id,
    stage: entryStage.stage,
    status: "request",
    createdAt: nowIso(),
    agent: entryStage.agent,
    inputRef: "input/new-task.json",
  } satisfies StageEnvelope);

  return { taskId: id, taskPath: dir };
}

export async function loadTaskMeta(taskId: string): Promise<TaskMeta> {
  const parsed = await readJsonValidated(path.join(taskDir(taskId), "meta.json"), taskMetaSchema);
  const parentTaskId = normalizeOptionalTaskId(parsed.parentTaskId);
  const sourceKind = normalizeTaskSourceKind({
    sourceKind: parsed.sourceKind,
    typeHint: parsed.type,
    parentTaskId,
  });
  const rootProjectId = normalizeOptionalTaskId(parsed.rootProjectId)
    || (sourceKind === "project-subtask" ? (parentTaskId || parsed.taskId) : parsed.taskId);
  const dependsOn = normalizeTaskIdList(parsed.dependsOn, { excludeTaskId: parsed.taskId });
  const blockedBy = normalizeTaskIdList(parsed.blockedBy, { excludeTaskId: parsed.taskId });
  const priority = normalizeTaskPriority(parsed.priority);
  const milestone = normalizeTaskMilestone(parsed.milestone);
  const parallelizable = normalizeTaskParallelizable(parsed.parallelizable);
  const ownershipBoundaries = normalizeOwnershipBoundaries(parsed.ownershipBoundaries);
  const mergeStrategy = normalizeTaskMergeStrategy(parsed.mergeStrategy);

  return {
    ...parsed,
    parentTaskId,
    rootProjectId,
    sourceKind,
    dependsOn,
    blockedBy,
    priority,
    milestone,
    parallelizable,
    ownershipBoundaries,
    mergeStrategy,
    currentAgent: normalizeTaskMetaAgent(String(parsed.currentAgent || "")),
    nextAgent: normalizeTaskMetaAgent(String(parsed.nextAgent || "")),
    history: parsed.history.map((item) => ({
      ...item,
      agent: normalizeTaskMetaHistoryAgent(String(item.agent || "Human Review")),
    })),
  };
}

export async function saveTaskMeta(taskId: string, meta: TaskMeta): Promise<void> {
  const parentTaskId = normalizeOptionalTaskId(meta.parentTaskId);
  const sourceKind = normalizeTaskSourceKind({
    sourceKind: meta.sourceKind,
    typeHint: meta.type,
    parentTaskId,
  });
  const rootProjectId = normalizeOptionalTaskId(meta.rootProjectId)
    || (sourceKind === "project-subtask" ? (parentTaskId || meta.taskId) : meta.taskId);
  const dependsOn = normalizeTaskIdList(meta.dependsOn, { excludeTaskId: meta.taskId });
  const blockedBy = normalizeTaskIdList(meta.blockedBy, { excludeTaskId: meta.taskId });
  const priority = normalizeTaskPriority(meta.priority);
  const milestone = normalizeTaskMilestone(meta.milestone);
  const parallelizable = normalizeTaskParallelizable(meta.parallelizable);
  const ownershipBoundaries = normalizeOwnershipBoundaries(meta.ownershipBoundaries);
  const mergeStrategy = normalizeTaskMergeStrategy(meta.mergeStrategy);

  meta.parentTaskId = parentTaskId;
  meta.sourceKind = sourceKind;
  meta.rootProjectId = rootProjectId;
  meta.dependsOn = dependsOn;
  meta.blockedBy = blockedBy;
  meta.priority = priority;
  meta.milestone = milestone;
  meta.parallelizable = parallelizable;
  meta.ownershipBoundaries = ownershipBoundaries;
  meta.mergeStrategy = mergeStrategy;
  meta.updatedAt = nowIso();
  await writeJson(path.join(taskDir(taskId), "meta.json"), meta);
}

export async function allTaskIds(): Promise<string[]> {
  if (!(await exists(tasksDir()))) return [];
  return listDirectories(tasksDir());
}

export async function latestTaskId(): Promise<string> {
  const ids = (await allTaskIds()).sort().reverse();
  if (!ids.length) throw new Error("No tasks found.");
  return ids[0];
}

export async function finalizeForHumanReview(taskId: string): Promise<void> {
  await writeJson(path.join(taskDir(taskId), "human", "90-final-review.request.json"), {
    taskId,
    stage: "human-review",
    status: "request",
    createdAt: nowIso(),
  });
}

export async function writeView(taskId: string, fileName: string, content: string): Promise<void> {
  await writeText(path.join(taskDir(taskId), "views", fileName), content);
}
