import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, exists, readJson, writeJson } from "./fs.js";
import { runtimeDir } from "./paths.js";
import { nowIso } from "./utils.js";

export interface TaskCancelRequest {
  taskId: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
}

function cancelRequestsDir(): string {
  return path.join(runtimeDir(), "cancel-requests");
}

function taskCancelRequestPath(taskId: string): string {
  return path.join(cancelRequestsDir(), `${taskId}.json`);
}

export async function requestTaskCancel(args: {
  taskId: string;
  requestedBy?: string;
  reason?: string;
}): Promise<TaskCancelRequest> {
  const request: TaskCancelRequest = {
    taskId: args.taskId,
    requestedAt: nowIso(),
    requestedBy: (args.requestedBy || "human").trim() || "human",
    reason: (args.reason || "Task cancelled by user.").trim() || "Task cancelled by user.",
  };
  await ensureDir(cancelRequestsDir());
  await writeJson(taskCancelRequestPath(args.taskId), request);
  return request;
}

export async function isTaskCancelRequested(taskId: string): Promise<boolean> {
  return exists(taskCancelRequestPath(taskId));
}

export async function loadTaskCancelRequest(taskId: string): Promise<TaskCancelRequest | null> {
  const target = taskCancelRequestPath(taskId);
  if (!(await exists(target))) return null;
  try {
    const payload = await readJson<TaskCancelRequest>(target);
    if (!payload || typeof payload !== "object") return null;
    if (payload.taskId !== taskId) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function clearTaskCancelRequest(taskId: string): Promise<void> {
  await fs.unlink(taskCancelRequestPath(taskId)).catch(() => undefined);
}
