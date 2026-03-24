import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies before importing the module under test
vi.mock("../lib/config.js", () => ({
  loadLocalProjectConfig: vi.fn(),
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("../lib/services/task-services.js", () => ({
  approveTaskService: vi.fn(),
}));

vi.mock("../lib/logging.js", () => ({
  logAgentAudit: vi.fn().mockResolvedValue(undefined),
  logDaemon: vi.fn().mockResolvedValue(undefined),
  logQueueLatency: vi.fn().mockResolvedValue(undefined),
  logRuntimeEvent: vi.fn().mockResolvedValue(undefined),
  logTaskEvent: vi.fn().mockResolvedValue(undefined),
  logTiming: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/task.js", () => ({
  loadTaskMeta: vi.fn(),
  saveTaskMeta: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/task-cancel.js", () => ({
  clearTaskCancelRequest: vi.fn(),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
  loadTaskCancelRequest: vi.fn(),
}));

vi.mock("../lib/synx-ui.js", () => ({
  formatSynxStreamLog: vi.fn((msg: string) => msg),
}));

vi.mock("../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
}));

const originalCwd = process.cwd();

describe.sequential("WorkerBase auto-approve", () => {
  let root = "";
  let taskId = "";
  let taskPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-auto-approve-test-"));
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "synx-auto-approve-test" }, null, 2),
      "utf8",
    );
    process.chdir(root);

    taskId = "task-auto-approve-test";
    taskPath = path.join(root, ".ai-agents", "tasks", taskId);
    await fs.mkdir(path.join(taskPath, "done"), { recursive: true });
    await fs.mkdir(path.join(taskPath, "views"), { recursive: true });
    await fs.mkdir(path.join(taskPath, "input"), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  async function runFinishStage(
    confidenceScore: number | undefined,
    threshold: number | undefined,
  ): Promise<void> {
    // Write dispatcher done file
    if (confidenceScore !== undefined) {
      await fs.writeFile(
        path.join(taskPath, "done", "00-dispatcher.done.json"),
        JSON.stringify({
          taskId,
          stage: "dispatch",
          status: "done",
          createdAt: new Date().toISOString(),
          agent: "Dispatcher",
          output: { confidenceScore },
        }),
        "utf8",
      );
    }

    // Set up mocks
    const { loadLocalProjectConfig } = await import("../lib/config.js");
    const { loadTaskMeta, saveTaskMeta } = await import("../lib/task.js");

    vi.mocked(loadLocalProjectConfig).mockResolvedValue({
      projectName: "test",
      language: "TypeScript",
      framework: "Next.js",
      humanReviewer: "Alice",
      tasksDir: ".tasks",
      autoApproveThreshold: threshold,
    });

    vi.mocked(loadTaskMeta).mockResolvedValue({
      taskId,
      title: "Test task",
      type: "Feature",
      project: "test",
      status: "in_progress",
      currentStage: "qa",
      currentAgent: "Synx QA Engineer",
      nextAgent: "Human Review",
      humanApprovalRequired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    });
    vi.mocked(saveTaskMeta).mockResolvedValue(undefined);

    // Dynamically import WorkerBase after mocks are set
    const { WorkerBase } = await import("./base.js");

    class TestWorker extends WorkerBase {
      readonly agent = "Synx QA Engineer" as const;
      readonly requestFileName = "05-qa.request.json";
      readonly workingFileName = "05-qa.working.json";
      protected async processTask(): Promise<void> {}

      async callFinishStage(): Promise<void> {
        return this.finishStage({
          taskId,
          stage: "qa",
          doneFileName: "05-qa.done.json",
          viewFileName: "05-qa.view.md",
          viewContent: "# QA done",
          output: { verdict: "pass" },
          nextAgent: "Human Review",
          humanApprovalRequired: true,
          startedAt: new Date().toISOString(),
        });
      }
    }

    const worker = new TestWorker();
    await worker.callFinishStage();
  }

  it("auto-approves when confidence >= threshold", async () => {
    const { approveTaskService } = await import("../lib/services/task-services.js");
    vi.mocked(approveTaskService).mockResolvedValue(undefined);

    await runFinishStage(0.92, 0.85);

    expect(approveTaskService).toHaveBeenCalledWith(taskId);
  });

  it("does not auto-approve when confidence < threshold", async () => {
    const { approveTaskService } = await import("../lib/services/task-services.js");
    vi.mocked(approveTaskService).mockResolvedValue(undefined);

    await runFinishStage(0.70, 0.85);

    expect(approveTaskService).not.toHaveBeenCalled();
  });

  it("does not auto-approve when threshold is not configured", async () => {
    const { approveTaskService } = await import("../lib/services/task-services.js");
    vi.mocked(approveTaskService).mockResolvedValue(undefined);

    await runFinishStage(0.99, undefined);

    expect(approveTaskService).not.toHaveBeenCalled();
  });

  it("does not auto-approve when no dispatcher done file exists", async () => {
    const { approveTaskService } = await import("../lib/services/task-services.js");
    vi.mocked(approveTaskService).mockResolvedValue(undefined);

    // No confidence score written
    await runFinishStage(undefined, 0.80);

    expect(approveTaskService).not.toHaveBeenCalled();
  });
});
