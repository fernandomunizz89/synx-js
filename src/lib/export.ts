/**
 * Phase 5 — Task Export
 *
 * Exports a task's audit trail and results as a structured JSON report.
 */
import path from "node:path";
import { readJson, exists } from "./fs.js";
import { taskDir } from "./paths.js";
import { loadTaskMeta } from "./task.js";
import { DONE_FILE_NAMES } from "./constants.js";
import type { TaskMeta } from "./types.js";

export interface TaskStageExport {
  stage: string;
  agent: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  estimatedCostUsd?: number;
  estimatedTotalTokens?: number;
}

export interface TaskExport {
  taskId: string;
  title: string;
  type: string;
  project: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  suggestedChain?: string[];
  stages: TaskStageExport[];
  totalCostUsd: number;
  totalTokens: number;
  dispatcherOutput?: unknown;
  qaOutput?: unknown;
  exportedAt: string;
}

/** Export a full task audit trail and results as a structured object. */
export async function exportTask(taskId: string): Promise<TaskExport> {
  const meta: TaskMeta = await loadTaskMeta(taskId);
  const base = taskDir(taskId);

  const stages: TaskStageExport[] = meta.history.map((h) => ({
    stage: h.stage,
    agent: String(h.agent || ""),
    startedAt: h.startedAt,
    endedAt: h.endedAt,
    durationMs: h.durationMs,
    provider: h.provider,
    model: h.model,
    estimatedCostUsd: h.estimatedCostUsd,
    estimatedTotalTokens: h.estimatedTotalTokens,
  }));

  const totalCostUsd = stages.reduce((s, e) => s + (e.estimatedCostUsd ?? 0), 0);
  const totalTokens = stages.reduce((s, e) => s + (e.estimatedTotalTokens ?? 0), 0);

  let dispatcherOutput: unknown = undefined;
  let qaOutput: unknown = undefined;

  try {
    const dp = path.join(base, "done", DONE_FILE_NAMES.dispatcher);
    if (await exists(dp)) dispatcherOutput = await readJson(dp);
  } catch { /* best-effort */ }

  try {
    const qp = path.join(base, "done", DONE_FILE_NAMES.synxQaEngineer);
    if (await exists(qp)) qaOutput = await readJson(qp);
  } catch { /* best-effort */ }

  return {
    taskId,
    title: meta.title,
    type: meta.type,
    project: meta.project,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    suggestedChain: meta.suggestedChain,
    stages,
    totalCostUsd,
    totalTokens,
    dispatcherOutput,
    qaOutput,
    exportedAt: new Date().toISOString(),
  };
}
