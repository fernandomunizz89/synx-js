import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "./constants.js";
import { ensureDir, exists, listDirectories, readJsonValidated, writeJson, writeText } from "./fs.js";
import { taskDir, tasksDir } from "./paths.js";
import type { NewTaskInput, StageEnvelope, TaskMeta, TaskMetaHistoryItem } from "./types.js";
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

export async function ensureTaskStructure(baseTaskDir: string): Promise<void> {
  const dirs = ["input", "inbox", "working", "done", "failed", "human", "artifacts", "logs", "views"];
  for (const dir of dirs) await ensureDir(path.join(baseTaskDir, dir));
}

export async function createTask(input: NewTaskInput): Promise<{ taskId: string; taskPath: string }> {
  const id = `task-${todayDate()}-${randomId(4)}-${slugify(input.title)}`;
  const dir = taskDir(id);
  await ensureTaskStructure(dir);

  const meta: TaskMeta = {
    taskId: id,
    title: input.title,
    type: input.typeHint,
    project: input.project,
    status: "new",
    currentStage: "submitted",
    currentAgent: "",
    nextAgent: "Dispatcher",
    humanApprovalRequired: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    history: [],
  };

  await writeJson(path.join(dir, "meta.json"), meta);
  await writeJson(path.join(dir, "input", "new-task.json"), input);
  await writeJson(path.join(dir, "inbox", STAGE_FILE_NAMES.dispatcher), {
    taskId: id,
    stage: "dispatcher",
    status: "request",
    createdAt: nowIso(),
    agent: "Dispatcher",
    inputRef: "input/new-task.json",
  } satisfies StageEnvelope);

  return { taskId: id, taskPath: dir };
}

export async function loadTaskMeta(taskId: string): Promise<TaskMeta> {
  const parsed = await readJsonValidated(path.join(taskDir(taskId), "meta.json"), taskMetaSchema);
  return {
    ...parsed,
    currentAgent: normalizeTaskMetaAgent(String(parsed.currentAgent || "")),
    nextAgent: normalizeTaskMetaAgent(String(parsed.nextAgent || "")),
    history: parsed.history.map((item) => ({
      ...item,
      agent: normalizeTaskMetaHistoryAgent(String(item.agent || "Human Review")),
    })),
  };
}

export async function saveTaskMeta(taskId: string, meta: TaskMeta): Promise<void> {
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
    agent: "Human Review",
    inputRef: `done/${DONE_FILE_NAMES.pr}`,
  });
}

export async function writeView(taskId: string, fileName: string, content: string): Promise<void> {
  await writeText(path.join(taskDir(taskId), "views", fileName), content);
}
