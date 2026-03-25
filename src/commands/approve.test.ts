import { describe, expect, it, vi, beforeEach } from "vitest";
import { approveCommand } from "./approve.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { confirmAction, selectOption } from "../lib/interactive.js";
import { collectReadinessReport } from "../lib/readiness.js";
import { approveTaskService } from "../lib/services/task-services.js";

vi.mock("../lib/task.js", () => ({
  allTaskIds: vi.fn(),
  loadTaskMeta: vi.fn(),
}));

vi.mock("../lib/interactive.js", () => ({
  confirmAction: vi.fn(),
  selectOption: vi.fn(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/readiness.js", () => ({
  collectReadinessReport: vi.fn(),
  printReadinessReport: vi.fn(),
}));

vi.mock("../lib/logging.js", () => ({
  logTaskEvent: vi.fn(),
}));

vi.mock("../lib/paths.js", () => ({
  taskDir: vi.fn().mockReturnValue("/tmp/task"),
}));

vi.mock("../lib/services/task-services.js", () => ({
  approveTaskService: vi.fn(),
}));

import { type Command } from "commander";

/** Reset Commander option values between tests */
function resetCommandOptions(cmd: Command): void {
  (cmd as unknown as { _optionValues: Record<string, unknown> })._optionValues = {};
  (cmd as unknown as { _optionValueSources: Record<string, unknown> })._optionValueSources = {};
  for (const sub of cmd.commands) resetCommandOptions(sub);
}

describe("approve command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandOptions(approveCommand);
    vi.mocked(collectReadinessReport).mockResolvedValue({} as any);
    vi.mocked(approveTaskService).mockResolvedValue(undefined);
    // Suppress console.log during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const runCommand = async (args: string[]) => {
    // We need to use parseAsync to handle the async action
    // Commander expects [node, script, ...args]
    await approveCommand.parseAsync(["node", "synx", "approve", ...args]);
  };

  it("exits early if no tasks found", async () => {
    vi.mocked(allTaskIds).mockResolvedValue([]);
    await runCommand([]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No tasks found"));
  });

  it("exits early if no tasks waiting for approval", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: false,
        status: "done",
        createdAt: "2024"
    } as any);
    await runCommand([]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No tasks are waiting for human approval"));
  });

  it("approves a task with --yes", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    const meta = { 
        taskId: "task-1", 
        humanApprovalRequired: true,
        status: "waiting_human",
        createdAt: "2024"
    };
    vi.mocked(loadTaskMeta).mockResolvedValue(meta as any);
    
    await runCommand(["--task-id", "task-1", "--yes"]);
    
    expect(approveTaskService).toHaveBeenCalledWith("task-1");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Task approved: task-1"));
  });

  it("asks for confirmation without --yes and approves if confirmed", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: true,
        status: "waiting_human",
        createdAt: "2024"
    } as any);
    vi.mocked(confirmAction).mockResolvedValue(true);
    
    await runCommand(["--task-id", "task-1"]);
    
    expect(confirmAction).toHaveBeenCalled();
    expect(approveTaskService).toHaveBeenCalledWith("task-1");
  });

  it("aborts approval if confirmation is denied", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: true,
        status: "waiting_human",
        createdAt: "2024"
    } as any);
    vi.mocked(confirmAction).mockResolvedValue(false);
    
    await runCommand(["--task-id", "task-1"]);
    
    expect(confirmAction).toHaveBeenCalled();
    expect(approveTaskService).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Approval canceled"));
  });

  it("selects a task interactively if no taskId provided", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: true,
        status: "waiting_human",
        createdAt: "2024",
        title: "Test Task",
        type: "Feature",
        currentStage: "Reviewer"
    } as any);
    vi.mocked(selectOption).mockResolvedValue("task-1");
    vi.mocked(confirmAction).mockResolvedValue(true);
    
    await runCommand([]);
    
    expect(selectOption).toHaveBeenCalled();
    expect(approveTaskService).toHaveBeenCalledWith("task-1");
  });

  it("exits if the specified task is not waiting for approval", async () => {
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: false,
        status: "done",
        createdAt: "2024"
    } as any);
    
    await runCommand(["--task-id", "task-1"]);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("not waiting for human approval"));
    expect(approveTaskService).not.toHaveBeenCalled();
  });

  it("auto-selects single task with --yes", async () => {
    vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(loadTaskMeta).mockResolvedValue({ 
        taskId: "task-1", 
        humanApprovalRequired: true,
        status: "waiting_human",
        createdAt: "2024"
    } as any);
    
    await runCommand(["--yes"]);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Auto-selected: task-1"));
    expect(approveTaskService).toHaveBeenCalledWith("task-1");
  });
});
