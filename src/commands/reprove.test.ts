import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  allTaskIds: vi.fn<() => Promise<string[]>>(),
  loadTaskMeta: vi.fn<() => Promise<any>>(),
  saveTaskMeta: vi.fn<(taskId: string, meta: unknown) => Promise<void>>(),
  logTaskEvent: vi.fn<() => Promise<void>>(),
  collectReadinessReport: vi.fn<() => Promise<{ ok: boolean; issues: Array<{ severity: "error" | "warning"; message: string }> }>>(),
  printReadinessReport: vi.fn(),
  commandExample: vi.fn<(value: string) => string>(),
  writeJson: vi.fn<(path: string, value: unknown) => Promise<void>>(),
  exists: vi.fn<(path: string) => Promise<boolean>>(),
  readJson: vi.fn<(path: string) => Promise<unknown>>(),
  confirmAction: vi.fn<() => Promise<boolean>>(),
  selectOption: vi.fn<() => Promise<string>>(),
  runCommand: vi.fn<() => Promise<{ exitCode: number | null; stdout: string; stderr: string }>>(),
  isGitRepository: vi.fn<() => Promise<boolean>>(),
  taskDir: vi.fn<(taskId: string) => string>(),
  repoRoot: vi.fn<() => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/task.js", () => ({
  allTaskIds: mocks.allTaskIds,
  loadTaskMeta: mocks.loadTaskMeta,
  saveTaskMeta: mocks.saveTaskMeta,
}));

vi.mock("../lib/logging.js", () => ({
  logTaskEvent: mocks.logTaskEvent,
}));

vi.mock("../lib/readiness.js", () => ({
  collectReadinessReport: mocks.collectReadinessReport,
  printReadinessReport: mocks.printReadinessReport,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

vi.mock("../lib/fs.js", () => ({
  writeJson: mocks.writeJson,
  exists: mocks.exists,
  readJson: mocks.readJson,
}));

vi.mock("../lib/interactive.js", () => ({
  confirmAction: mocks.confirmAction,
  selectOption: mocks.selectOption,
}));

vi.mock("../lib/command-runner.js", () => ({
  runCommand: mocks.runCommand,
  isGitRepository: mocks.isGitRepository,
}));

vi.mock("../lib/paths.js", () => ({
  taskDir: mocks.taskDir,
  repoRoot: mocks.repoRoot,
}));

import { reproveCommand } from "./reprove.js";

describe.sequential("commands/reprove", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.allTaskIds.mockReset().mockResolvedValue(["task-1"]);
    mocks.loadTaskMeta.mockReset().mockResolvedValue({
      taskId: "task-1",
      title: "Fix timer",
      type: "Bug",
      status: "waiting_human",
      currentStage: "pr",
      currentAgent: "PR Writer",
      nextAgent: "",
      humanApprovalRequired: true,
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
      history: [],
    });
    mocks.saveTaskMeta.mockReset().mockResolvedValue(undefined);
    mocks.logTaskEvent.mockReset().mockResolvedValue(undefined);
    mocks.collectReadinessReport.mockReset().mockResolvedValue({ ok: true, issues: [] });
    mocks.printReadinessReport.mockReset();
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.writeJson.mockReset().mockResolvedValue(undefined);
    mocks.exists.mockReset().mockResolvedValue(false);
    mocks.readJson.mockReset().mockResolvedValue({});
    mocks.confirmAction.mockReset().mockResolvedValue(true);
    mocks.selectOption.mockReset().mockResolvedValue("task-1");
    mocks.runCommand.mockReset().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    mocks.isGitRepository.mockReset().mockResolvedValue(true);
    mocks.taskDir.mockReset().mockImplementation((taskId: string) => `/tmp/${taskId}`);
    mocks.repoRoot.mockReset().mockReturnValue("/tmp");
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reproves waiting task and returns to Bug Fixer without rollback by default", async () => {
    await reproveCommand.parseAsync([
      "node",
      "synx",
      "--task-id",
      "task-1",
      "--yes",
    ]);

    expect(mocks.saveTaskMeta).toHaveBeenCalledTimes(1);
    const savedMeta = mocks.saveTaskMeta.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(savedMeta).toMatchObject({
      status: "waiting_agent",
      currentStage: "reproved",
      currentAgent: "Human Review",
      nextAgent: "Bug Investigator",
      humanApprovalRequired: false,
    });

    expect(mocks.writeJson).toHaveBeenCalled();
    const requestCall = mocks.writeJson.mock.calls.find(([file]) => String(file).includes("bug-investigator.request.json"));
    expect(requestCall).toBeTruthy();

    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it("does not reprove task when task is not waiting for human review", async () => {
    mocks.loadTaskMeta.mockResolvedValueOnce({
      taskId: "task-1",
      title: "Fix timer",
      type: "Bug",
      status: "in_progress",
      currentStage: "qa",
      currentAgent: "QA Validator",
      nextAgent: "PR Writer",
      humanApprovalRequired: false,
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
      history: [],
    });

    await reproveCommand.parseAsync([
      "node",
      "synx",
      "--task-id",
      "task-1",
      "--yes",
    ]);

    expect(mocks.saveTaskMeta).not.toHaveBeenCalled();
    expect(mocks.writeJson).not.toHaveBeenCalled();
  });

  it("throws on invalid rollback mode", async () => {
    await expect(reproveCommand.parseAsync([
      "node",
      "synx",
      "--task-id",
      "task-1",
      "--rollback",
      "all",
      "--yes",
    ])).rejects.toThrow(/Invalid --rollback value/);
  });
});
