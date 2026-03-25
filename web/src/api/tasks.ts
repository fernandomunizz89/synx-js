import type { TaskSummary, ReviewQueueItem, OverviewData, KanbanBoard } from "../types.js";

const BASE = "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const json = (await res.json()) as { ok: boolean; data: T; error?: string };
  if (!json.ok) throw new Error(json.error ?? "API error");
  return json.data;
}

export async function fetchTasks(): Promise<TaskSummary[]> {
  return apiFetch<TaskSummary[]>("/api/tasks");
}

export async function fetchOverview(): Promise<OverviewData> {
  return apiFetch<OverviewData>("/api/overview");
}

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  return apiFetch<ReviewQueueItem[]>("/api/review-queue");
}

export async function approveTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${taskId}/approve`, { method: "POST" });
}

export async function reproveTask(taskId: string, reason: string): Promise<void> {
  await apiFetch(`/api/tasks/${taskId}/reprove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function fetchKanban(): Promise<KanbanBoard> {
  return apiFetch<KanbanBoard>("/api/kanban");
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
}
