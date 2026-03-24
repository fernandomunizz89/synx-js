import { describe, expect, it, vi, beforeEach } from "vitest";
import { cancelCommand } from "./cancel.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { cancelTaskService } from "../lib/services/task-services.js";

vi.mock("../lib/task.js", () => ({
  allTaskIds: vi.fn(),
  loadTaskMeta: vi.fn(),
}));

vi.mock("../lib/services/task-services.js", () => ({
  cancelTaskService: vi.fn(),
}));

describe("cancel command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cancelTaskService).mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("throws error if no active task found", async () => {
    vi.mocked(allTaskIds).mockResolvedValue([]);
    await expect(cancelCommand.parseAsync(["node", "cancel"])).rejects.toThrow("No active task found");
  });

  it("cancels the most recently active task by default", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-old", "task-new"]);
    vi.mocked(loadTaskMeta).mockImplementation(async (id) => {
        if (id === "task-old") return { taskId: "task-old", status: "in_progress", updatedAt: "2024-01-01T10:00:00Z" } as any;
        return { taskId: "task-new", status: "in_progress", updatedAt: "2024-01-01T11:00:00Z" } as any;
    });

    await cancelCommand.parseAsync(["node", "cancel"]);
    
    expect(cancelTaskService).toHaveBeenCalledWith(expect.objectContaining({
        taskId: "task-new"
    }));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Cancellation requested for task-new"));
  });

  it("cancels a specific task if provided", async () => {
    vi.mocked(loadTaskMeta).mockResolvedValue({ taskId: "task-spec", status: "in_progress" } as any);
    
    await cancelCommand.parseAsync(["node", "cancel", "task-spec"]);
    
    expect(cancelTaskService).toHaveBeenCalledWith(expect.objectContaining({
        taskId: "task-spec"
    }));
  });

  it("throws if task is not in a cancellable status", async () => {
    vi.mocked(loadTaskMeta).mockResolvedValue({ taskId: "task-done", status: "done" } as any);
    
    await expect(cancelCommand.parseAsync(["node", "cancel", "task-done"])).rejects.toThrow("cannot be cancelled");
  });
});
