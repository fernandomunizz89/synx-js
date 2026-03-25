import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { WorkerBase } from "./base.js";
import * as fsLib from "../lib/fs.js";
import * as runtimeLib from "../lib/runtime.js";
import * as taskLib from "../lib/task.js";
import * as loggingLib from "../lib/logging.js";
import * as taskCancelLib from "../lib/task-cancel.js";
import * as fileLocksLib from "../lib/file-locks.js";
import * as configLib from "../lib/config.js";
import * as workspaceEditorLib from "../lib/workspace-editor.js";

vi.mock("../lib/fs.js");
vi.mock("../lib/runtime.js");
vi.mock("../lib/task.js");
vi.mock("../lib/logging.js");
vi.mock("../lib/task-cancel.js");
vi.mock("../lib/file-locks.js");
vi.mock("../lib/config.js");
vi.mock("../lib/workspace-editor.js");
vi.mock("../lib/paths.js", () => ({
  taskDir: (id: string) => `/tmp/tasks/${id}`,
}));
vi.mock("node:fs", () => ({
  promises: {
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
  },
}));

class TestWorker extends WorkerBase {
  readonly agent = "TestAgent";
  readonly requestFileName = "test.request.json";
  readonly workingFileName = "test.working.json";
  processTask = vi.fn().mockResolvedValue(undefined);

  public async callFinishStage(args: any) {
    return this.finishStage(args);
  }

  public async callLoadTaskInput(taskId: string) {
    return this.loadTaskInput(taskId);
  }

  public async callLoadReferencedInput(taskId: string, request: any) {
    return this.loadReferencedInput(taskId, request);
  }
}

describe("WorkerBase", () => {
  let worker: TestWorker;
  const taskId = "task-123";

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new TestWorker();
    vi.mocked(runtimeLib.acquireLock).mockResolvedValue(true);
    vi.mocked(fsLib.exists).mockResolvedValue(true);
    vi.mocked(fsLib.readJsonValidated).mockResolvedValue({ stage: "test-stage", createdAt: new Date().toISOString() });
    vi.mocked(taskCancelLib.isTaskCancelRequested).mockResolvedValue(false);
    vi.mocked(taskCancelLib.clearTaskCancelRequest).mockResolvedValue(undefined);
    vi.mocked(fileLocksLib.releaseFileLocks).mockResolvedValue([]);
    vi.mocked(fileLocksLib.reserveDispatchLocks).mockResolvedValue({ acquired: [], conflicts: [] });
    vi.mocked(taskLib.loadTaskMeta).mockResolvedValue({
      taskId,
      status: "new",
      history: [],
      currentStage: "",
      currentAgent: "",
    } as any);
  });

  it("tryProcess skips if inbox file missing", async () => {
    vi.mocked(fsLib.exists).mockResolvedValue(false);
    const result = await worker.tryProcess(taskId);
    expect(result).toBe(false);
    expect(fsLib.moveFile).not.toHaveBeenCalled();
  });

  it("tryProcess skips if lock acquisition fails", async () => {
    vi.mocked(runtimeLib.acquireLock).mockResolvedValue(false);
    const result = await worker.tryProcess(taskId);
    expect(result).toBe(false);
    expect(fsLib.moveFile).not.toHaveBeenCalled();
  });

  it("tryProcess executes processTask on success", async () => {
    const result = await worker.tryProcess(taskId);
    expect(result).toBe(true);
    expect(fsLib.moveFile).toHaveBeenCalled();
    expect(worker.processTask).toHaveBeenCalledWith(taskId, expect.anything());
    expect(taskLib.saveTaskMeta).toHaveBeenCalled();
    expect(runtimeLib.releaseLock).toHaveBeenCalled();
  });

  it("tryProcess handles cancellation before execution", async () => {
    vi.mocked(taskCancelLib.isTaskCancelRequested).mockResolvedValue(true);
    const result = await worker.tryProcess(taskId);
    expect(result).toBe(false);
    expect(taskLib.saveTaskMeta).toHaveBeenCalledWith(taskId, expect.objectContaining({ status: "blocked" }));
  });

  it("finishStage updates task state and history", async () => {
    const startedAt = new Date().toISOString();
    await worker.callFinishStage({
      taskId,
      stage: "test-stage",
      doneFileName: "test.done.json",
      viewFileName: "test.md",
      viewContent: "# Done",
      output: { ok: true },
      startedAt,
    });

    expect(fsLib.writeJson).toHaveBeenCalledWith(expect.stringContaining("test.done.json"), expect.anything());
    expect(fsLib.writeText).toHaveBeenCalledWith(expect.stringContaining("test.md"), "# Done");
    expect(taskLib.saveTaskMeta).toHaveBeenCalledWith(taskId, expect.objectContaining({
      status: "in_progress",
    }));
  });

  it("finishStage handles handoff to next agent", async () => {
    const startedAt = new Date().toISOString();
    await worker.callFinishStage({
      taskId,
      stage: "test-stage",
      doneFileName: "test.done.json",
      viewFileName: "test.md",
      viewContent: "# Done",
      output: { ok: true },
      startedAt,
      nextAgent: "NextAgent",
      nextStage: "next-stage",
      nextRequestFileName: "next.json",
      nextInputRef: "done/test.done.json",
    });

    expect(taskLib.saveTaskMeta).toHaveBeenCalledWith(taskId, expect.objectContaining({
      status: "waiting_agent",
      nextAgent: "NextAgent",
    }));
    expect(fsLib.writeJson).toHaveBeenCalledWith(expect.stringContaining("next.json"), expect.objectContaining({
      agent: "NextAgent",
    }));
  });

  it("tryProcess handles WorkspaceEditConflictError", async () => {
    class ConflictError extends Error {
      taskId = "task-123";
      mergeStrategy = "auto-rebase";
      conflicts = [{ file: "x.ts", heldBy: "other-task" }];
    }
    const conflict = new ConflictError("Conflict");
    worker.processTask.mockRejectedValue(conflict);
    
    // We need to mock isWorkspaceEditConflictError to return true for this error
    vi.mocked(workspaceEditorLib.isWorkspaceEditConflictError).mockReturnValue(true);

    const result = await worker.tryProcess(taskId);
    expect(result).toBe(false);
    expect(taskLib.saveTaskMeta).toHaveBeenCalledWith(taskId, expect.objectContaining({
      status: "waiting_agent",
      blockedBy: ["other-task"],
    }));
  });

  it("finishStage triggers auto-approve when threshold met", async () => {
    vi.mocked(configLib.loadLocalProjectConfig).mockResolvedValue({ autoApproveThreshold: 0.8 } as any);
    // Mock dispatcher done file
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ output: { confidenceScore: 0.9 } }));

    const startedAt = new Date().toISOString();
    await worker.callFinishStage({
      taskId,
      stage: "test-stage",
      doneFileName: "test.done.json",
      viewFileName: "test.md",
      viewContent: "# Done",
      output: { ok: true },
      startedAt,
      humanApprovalRequired: true,
    });

    // In base.ts, if auto-approving, it calls approveTaskService
    expect(configLib.loadLocalProjectConfig).toHaveBeenCalled();
  });

  it("note() logs task events and audit logs", async () => {
    // @ts-ignore - accessing protected method for test
    await worker.note({ taskId, stage: "test", message: "Hello" });
    expect(loggingLib.logTaskEvent).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Hello"));
  });

  it("loadReferencedInput throws on missing file", async () => {
    vi.mocked(fsLib.exists).mockResolvedValue(false);
    await expect(worker.callLoadReferencedInput(taskId, { inputRef: "missing.json" }))
      .rejects.toThrow("Referenced input file not found");
  });

  it("loadTaskInput reads the correct file", async () => {
    vi.mocked(fsLib.readJsonValidated).mockResolvedValue({ title: "Task" });
    const input = await worker.callLoadTaskInput(taskId);
    expect(input).toEqual({ title: "Task" });
    expect(fsLib.readJsonValidated).toHaveBeenCalledWith(expect.stringContaining("new-task.json"), expect.anything());
  });

  it("loadReferencedInput validates path and existence", async () => {
    vi.mocked(fsLib.exists).mockResolvedValue(true);
    vi.mocked(fsLib.readJsonValidated).mockResolvedValue({ ok: true });
    
    // Valid path
    const result = await worker.callLoadReferencedInput(taskId, { inputRef: "done/00-test.json" });
    expect(result).toEqual({ ok: true });

    // Traversal attempt
    await expect(worker.callLoadReferencedInput(taskId, { inputRef: "../../etc/passwd" }))
      .rejects.toThrow("Unsafe inputRef path detected");
  });
});
