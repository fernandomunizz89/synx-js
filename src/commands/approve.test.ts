import { describe, expect, it, vi, beforeEach } from "vitest";
import { approveCommand } from "./approve.js";
import { allTaskIds, loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { confirmAction, selectOption } from "../lib/interactive.js";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { collectReadinessReport } from "../lib/readiness.js";

vi.mock("../lib/task.js", () => ({
  allTaskIds: vi.fn(),
  loadTaskMeta: vi.fn(),
  saveTaskMeta: vi.fn(),
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

describe("approve command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectReadinessReport).mockResolvedValue({} as any);
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
    
    expect(saveTaskMeta).toHaveBeenCalledWith("task-1", expect.objectContaining({
        status: "done",
        humanApprovalRequired: false
    }));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Task approved: task-1"));
  });

  // it("asks for confirmation without --yes", async () => {
  //   vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
  //   vi.mocked(loadTaskMeta).mockResolvedValue({ 
  //       taskId: "task-1", 
  //       humanApprovalRequired: true,
  //       status: "waiting_human",
  //       createdAt: "2024"
  //   } as any);
  //   vi.mocked(confirmAction).mockResolvedValue(true);
    
  //   await runCommand(["--task-id", "task-1"]);
    
  //   expect(confirmAction).toHaveBeenCalled();
  //   expect(saveTaskMeta).toHaveBeenCalled();
  // });

  // it("selects a task interactively if no taskId provided", async () => {
  //   vi.mocked(allTaskIds).mockResolvedValue(["task-1"]);
  //   vi.mocked(loadTaskMeta).mockResolvedValue({ 
  //       taskId: "task-1", 
  //       humanApprovalRequired: true,
  //       status: "waiting_human",
  //       createdAt: "2024",
  //       title: "Test Task",
  //       type: "feature",
  //       currentStage: "reviewer"
  //   } as any);
  //   vi.mocked(selectOption).mockResolvedValue("task-1");
  //   vi.mocked(confirmAction).mockResolvedValue(true);
    
  //   await runCommand([]);
    
  //   expect(selectOption).toHaveBeenCalled();
  //   expect(saveTaskMeta).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "done" }));
  // });
});
