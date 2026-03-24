import { describe, expect, it, vi } from "vitest";
import { runInlineCommand } from "./command-handler.js";

// Mocking dependencies
vi.mock("../task.js", () => ({
  allTaskIds: vi.fn(),
  loadTaskMeta: vi.fn(),
}));

vi.mock("./task-management.js", () => ({
  summarizeTaskCounts: vi.fn(),
  pickFocusedTask: vi.fn(),
  loadMetasSafe: vi.fn(),
  byMostRecent: vi.fn(),
}));

vi.mock("../qa-preferences.js", () => ({
  resolveTaskQaPreferences: vi.fn(),
}));

vi.mock("../services/task-services.js", () => ({
  approveTaskService: vi.fn(),
  createTaskService: vi.fn(),
  reproveTaskService: vi.fn(),
}));

describe("lib/start/command-handler", () => {
  const context = {
    pushEvent: vi.fn(),
    requestStop: vi.fn(),
  };

  it("handles help command", async () => {
    await runInlineCommand({ kind: "help" }, context);
    expect(context.pushEvent).toHaveBeenCalledWith(expect.stringContaining("Commands:"));
  });

  it("handles stop command", async () => {
    await runInlineCommand({ kind: "stop" }, context);
    expect(context.requestStop).toHaveBeenCalledWith("SIGTERM");
  });

  it("handles unknown command", async () => {
    await runInlineCommand({ kind: "unknown", raw: "...", message: "Error msg" }, context);
    expect(context.pushEvent).toHaveBeenCalledWith("Error msg");
  });

  it("handles new task command", async () => {
    const { resolveTaskQaPreferences } = await import("../qa-preferences.js");
    const { createTaskService } = await import("../services/task-services.js");
    
    vi.mocked(resolveTaskQaPreferences).mockReturnValue({ objective: "test-obj" } as any);
    vi.mocked(createTaskService).mockResolvedValue({ taskId: "T1" } as any);

    await runInlineCommand({ kind: "new", title: "Test", type: "Bug" }, context);
    
    expect(createTaskService).toHaveBeenCalled();
    expect(context.pushEvent).toHaveBeenCalledWith(expect.stringContaining("Task created: T1"));
  });

  it("handles status command with no tasks", async () => {
    const { allTaskIds } = await import("../task.js");
    vi.mocked(allTaskIds).mockResolvedValue([]);

    await runInlineCommand({ kind: "status", all: false }, context);
    expect(context.pushEvent).toHaveBeenCalledWith("No tasks found.");
  });

  it("handles approve command when not authorized", async () => {
    const { loadTaskMeta } = await import("../task.js");
    vi.mocked(loadTaskMeta).mockResolvedValue({ taskId: "T1", humanApprovalRequired: false } as any);

    await runInlineCommand({ kind: "approve", taskId: "T1" }, context);
    expect(context.pushEvent).toHaveBeenCalledWith(expect.stringContaining("is not waiting for human approval"));
  });

  it("handles approve command when valid", async () => {
    const { loadTaskMeta } = await import("../task.js");
    const { approveTaskService } = await import("../services/task-services.js");
    
    vi.mocked(loadTaskMeta).mockResolvedValue({ taskId: "T1", humanApprovalRequired: true } as any);
    vi.mocked(approveTaskService).mockResolvedValue(undefined as any);

    await runInlineCommand({ kind: "approve", taskId: "T1" }, context);
    expect(approveTaskService).toHaveBeenCalledWith("T1");
    expect(context.pushEvent).toHaveBeenCalledWith(expect.stringContaining("Task approved: T1"));
  });

  it("handles reprove command with valid reason", async () => {
    const { loadTaskMeta } = await import("../task.js");
    const { reproveTaskService } = await import("../services/task-services.js");

    vi.mocked(loadTaskMeta).mockResolvedValue({ taskId: "T1", humanApprovalRequired: true } as any);
    vi.mocked(reproveTaskService).mockResolvedValue({ targetAgent: "Expert" } as any);

    await runInlineCommand({ kind: "reprove", taskId: "T1", reason: "Bad quality" }, context);
    expect(reproveTaskService).toHaveBeenCalledWith(expect.objectContaining({ reason: "Bad quality" }));
    expect(context.pushEvent).toHaveBeenCalledWith(expect.stringContaining("Task reproved: T1 -> Expert"));
  });
});
