import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskMeta } from "../lib/types.js";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  collectReadinessReport: vi.fn<() => Promise<{ ok: boolean; issues: Array<{ severity: "error" | "warning"; message: string }> }>>(),
  printReadinessReport: vi.fn(),
  allTaskIds: vi.fn<() => Promise<string[]>>(),
  loadTaskMeta: vi.fn<(taskId: string) => Promise<TaskMeta>>(),
  commandExample: vi.fn<(value: string) => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/readiness.js", () => ({
  collectReadinessReport: mocks.collectReadinessReport,
  printReadinessReport: mocks.printReadinessReport,
}));

vi.mock("../lib/task.js", () => ({
  allTaskIds: mocks.allTaskIds,
  loadTaskMeta: mocks.loadTaskMeta,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

import { statusCommand } from "./status.js";

describe.sequential("commands/status", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  function makeMeta(overrides: Partial<TaskMeta>): TaskMeta {
    return {
      taskId: "task-default",
      title: "Default",
      type: "Feature",
      project: "project",
      status: "new",
      currentStage: "submitted",
      currentAgent: "",
      nextAgent: "Dispatcher",
      humanApprovalRequired: false,
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
      rootProjectId: "task-default",
      sourceKind: "standalone",
      history: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.collectReadinessReport.mockReset().mockResolvedValue({ ok: true, issues: [] });
    mocks.printReadinessReport.mockReset();
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.allTaskIds.mockReset().mockResolvedValue(["task-1", "task-2", "task-3"]);
    mocks.loadTaskMeta.mockReset().mockImplementation(async (taskId: string) => {
      if (taskId === "task-1") {
        return makeMeta({
          taskId,
          title: "Needs approval",
          status: "waiting_human",
          currentStage: "human-review",
          currentAgent: "Human Review",
          nextAgent: "",
          humanApprovalRequired: true,
          updatedAt: "2026-03-16T01:00:00.000Z",
        });
      }
      if (taskId === "task-2") {
        return makeMeta({
          taskId,
          title: "In progress",
          status: "in_progress",
          currentAgent: "Dispatcher",
          updatedAt: "2026-03-16T00:30:00.000Z",
        });
      }
      return makeMeta({
        taskId,
        title: "Done task",
        status: "done",
        currentAgent: "Human Review",
        nextAgent: "",
        updatedAt: "2026-03-15T23:00:00.000Z",
      });
    });
    // @ts-ignore - reset options to avoid interference between tests
    statusCommand._optionValues = {};
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows focused task preferring waiting_human entries", async () => {
    await statusCommand.parseAsync(["node", "synx"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Focused task");
    expect(output).toContain("Needs approval");
    expect(output).toContain("Showing the task waiting for your approval.");
    expect(output).toContain("Next step: run `synx approve`");
  });

  it("shows all tasks when --all is provided", async () => {
    await statusCommand.parseAsync(["node", "synx", "--all"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Tasks (all)");
    expect(output).toContain("Needs approval");
    expect(output).toContain("In progress");
    expect(output).toContain("Done task");
  });

  it("shows no tasks message when none found", async () => {
    mocks.allTaskIds.mockResolvedValue([]);
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No tasks found.");
    expect(output).toContain("synx new");
  });

  it("shows doctor suggestion when tasks failed and none active", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-fail"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({ 
      taskId: "task-fail", 
      status: "failed",
      updatedAt: "2026-03-16T00:00:00.000Z" 
    }));
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Next step: run `synx doctor` to diagnose failures.");
  });

  it("shows new suggestion when no tasks active or waiting", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-done"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({ 
      taskId: "task-done", 
      status: "done",
      updatedAt: "2026-03-16T00:00:00.000Z" 
    }));
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Next step: run `synx new` to create another task.");
  });

  it("shows keep running suggestion when tasks are active", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-active"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({ 
      taskId: "task-active", 
      status: "in_progress",
      updatedAt: "2026-03-16T00:00:00.000Z" 
    }));
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Next step: keep `synx start` running");
  });

  it("handles invalid dates in taskUpdatedAtMs", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-invalid"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({ 
      taskId: "task-invalid", 
      updatedAt: "invalid-date",
      createdAt: "invalid-date"
    }));
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Focused task");
  });

  it("picks latest done as focused when no active exist", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-done"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({ 
      taskId: "task-done", 
      status: "done"
    }));
    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Showing the latest completed task.");
  });

  it("prints dispatch lock reservation details when present", async () => {
    mocks.allTaskIds.mockResolvedValue(["task-locked"]);
    mocks.loadTaskMeta.mockResolvedValue(makeMeta({
      taskId: "task-locked",
      status: "in_progress",
      currentStage: "synx-front-expert",
      currentAgent: "Synx Front Expert",
      nextAgent: "Synx QA Engineer",
      dispatchLockReservation: {
        reservedAt: "2026-03-16T00:00:00.000Z",
        reservedFiles: ["src/features/shared"],
        stage: "synx-front-expert",
      },
    }));

    await statusCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Dispatch lock stage: synx-front-expert");
    expect(output).toContain("Dispatch lock files: src/features/shared");
  });
});
