import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTasks, fetchKanban, approveTask, reproveTask, cancelTask, submitProjectPrompt } from "./tasks.js";

function mockFetch(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ ok, data }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api/tasks", () => {
  it("fetchTasks calls /api/tasks and returns the data", async () => {
    vi.stubGlobal("fetch", mockFetch([{ taskId: "t-1" }]));
    const result = await fetchTasks();
    expect(result).toEqual([{ taskId: "t-1", history: [], children: [] }]);
    expect(fetch).toHaveBeenCalledWith("/api/tasks", undefined);
  });

  it("fetchTasks normalizes missing history for nested child tasks", async () => {
    vi.stubGlobal("fetch", mockFetch([{
      taskId: "parent-1",
      children: [{ taskId: "child-1" }],
    }]));
    const result = await fetchTasks();
    expect(result).toEqual([{
      taskId: "parent-1",
      history: [],
      children: [{ taskId: "child-1", history: [], children: [] }],
    }]);
  });

  it("fetchKanban calls /api/kanban and returns the board", async () => {
    const board = { new: [], in_progress: [], waiting_human: [] };
    vi.stubGlobal("fetch", mockFetch(board));
    const result = await fetchKanban();
    expect(result).toEqual(board);
    expect(fetch).toHaveBeenCalledWith("/api/kanban", undefined);
  });

  it("approveTask POSTs to /api/tasks/:id/approve", async () => {
    vi.stubGlobal("fetch", mockFetch(null));
    await approveTask("t-99");
    expect(fetch).toHaveBeenCalledWith("/api/tasks/t-99/approve", { method: "POST" });
  });

  it("reproveTask POSTs with reason in JSON body", async () => {
    vi.stubGlobal("fetch", mockFetch(null));
    await reproveTask("t-99", "needs rework");
    expect(fetch).toHaveBeenCalledWith("/api/tasks/t-99/reprove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "needs rework" }),
    });
  });

  it("cancelTask POSTs to /api/tasks/:id/cancel", async () => {
    vi.stubGlobal("fetch", mockFetch(null));
    await cancelTask("t-99");
    expect(fetch).toHaveBeenCalledWith("/api/tasks/t-99/cancel", { method: "POST" });
  });

  it("submitProjectPrompt POSTs to /api/project", async () => {
    vi.stubGlobal("fetch", mockFetch({ taskId: "task-1" }));
    const result = await submitProjectPrompt("Build onboarding flow");
    expect(result).toEqual({ taskId: "task-1" });
    expect(fetch).toHaveBeenCalledWith("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Build onboarding flow" }),
    });
  });

  it("apiFetch throws when ok is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: "not found" }),
    }));
    await expect(fetchTasks()).rejects.toThrow("not found");
  });
});
