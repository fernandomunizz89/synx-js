import path from "node:path";
import { STAGE_FILE_NAMES } from "./constants.js";
import { ensureDir, exists, listDirectories, readJsonValidated, writeJson, writeText } from "./fs.js";
import { taskDir, tasksDir } from "./paths.js";
import type { NewTaskInput, StageEnvelope, TaskCreationMetadata, TaskMeta, TaskMetaHistoryItem, TaskSourceKind } from "./types.js";
import { nowIso, randomId, slugify, todayDate } from "./utils.js";
import { taskMetaSchema } from "./schema.js";

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

  return {
    ...parsed,
    parentTaskId,
    rootProjectId,
    sourceKind,
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

  meta.parentTaskId = parentTaskId;
  meta.sourceKind = sourceKind;
  meta.rootProjectId = rootProjectId;
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
