import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadResolvedProjectConfig: vi.fn<() => Promise<{ projectName: string }>>(),
  createTask: vi.fn<() => Promise<{ taskId: string; taskPath: string }>>(),
  loadTaskMeta: vi.fn<() => Promise<any>>(),
  saveTaskMeta: vi.fn<() => Promise<void>>(),
  writeJson: vi.fn<() => Promise<void>>(),
  recordPipelineApproval: vi.fn<() => Promise<void>>(),
  recordPipelineReproval: vi.fn<() => Promise<void>>(),
  logTaskEvent: vi.fn<() => Promise<void>>(),
  taskDir: vi.fn<(taskId: string) => string>(),
  repoRoot: vi.fn<() => string>(),
  loadPipelineState: vi.fn<() => Promise<any>>(),
  requestTaskCancel: vi.fn<() => Promise<void>>(),
  nowIso: vi.fn<() => string>(),
}));

vi.mock("../config.js", () => ({
  loadResolvedProjectConfig: mocks.loadResolvedProjectConfig,
}));

vi.mock("../task.js", () => ({
  createTask: mocks.createTask,
  loadTaskMeta: mocks.loadTaskMeta,
  saveTaskMeta: mocks.saveTaskMeta,
}));

vi.mock("../fs.js", () => ({
  writeJson: mocks.writeJson,
}));

vi.mock("../learnings.js", () => ({
  recordPipelineApproval: mocks.recordPipelineApproval,
  recordPipelineReproval: mocks.recordPipelineReproval,
}));

vi.mock("../logging.js", () => ({
  logTaskEvent: mocks.logTaskEvent,
}));

vi.mock("../paths.js", () => ({
  taskDir: mocks.taskDir,
  repoRoot: mocks.repoRoot,
}));

vi.mock("../pipeline-state.js", () => ({
  loadPipelineState: mocks.loadPipelineState,
}));

vi.mock("../task-cancel.js", () => ({
  requestTaskCancel: mocks.requestTaskCancel,
}));

vi.mock("../utils.js", () => ({
  nowIso: mocks.nowIso,
}));

import {
  approveTaskService,
  cancelTaskService,
  createTaskService,
  reproveTaskService,
  resolveProjectName,
} from "./task-services.js";

describe("lib/services/task-services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadResolvedProjectConfig.mockResolvedValue({ projectName: "resolved-project" });
    mocks.createTask.mockResolvedValue({ taskId: "task-1", taskPath: "/tmp/task-1" });
    mocks.loadTaskMeta.mockResolvedValue({
      taskId: "task-1",
      type: "Bug",
      status: "waiting_human",
      currentStage: "human-review",
      currentAgent: "Human Review",
      nextAgent: "",
      humanApprovalRequired: true,
    });
    mocks.saveTaskMeta.mockResolvedValue(undefined);
    mocks.writeJson.mockResolvedValue(undefined);
    mocks.recordPipelineApproval.mockResolvedValue(undefined);
    mocks.recordPipelineReproval.mockResolvedValue(undefined);
    mocks.logTaskEvent.mockResolvedValue(undefined);
    mocks.taskDir.mockImplementation((taskId: string) => `/tmp/${taskId}`);
    mocks.repoRoot.mockReturnValue("/tmp/synx-repo");
    mocks.loadPipelineState.mockResolvedValue({
      pipelineId: "pipe-1",
      completedSteps: [{ stepIndex: 0, agent: "Synx Front Expert", summary: "ok", keyOutputs: {} }],
    });
    mocks.requestTaskCancel.mockResolvedValue(undefined);
    mocks.nowIso.mockReturnValue("2026-03-22T10:00:00.000Z");
  });

  it("prefers explicit project name when provided", async () => {
    const resolved = await resolveProjectName("  custom-project  ");
    expect(resolved).toEqual({ project: "custom-project", source: "explicit" });
    expect(mocks.loadResolvedProjectConfig).not.toHaveBeenCalled();
  });

  it("falls back to resolved project config and then repository name", async () => {
    const fromConfig = await resolveProjectName("");
    expect(fromConfig).toEqual({ project: "resolved-project", source: "resolved-config" });

    mocks.loadResolvedProjectConfig.mockResolvedValueOnce({ projectName: "   " });
    const fromRepo = await resolveProjectName(undefined);
    expect(fromRepo).toEqual({ project: "synx-repo", source: "repository" });
  });

  it("normalizes project in task creation service", async () => {
    const created = await createTaskService({
      title: "My task",
      typeHint: "Feature",
      rawRequest: "My task",
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
      },
    });

    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      project: "resolved-project",
      title: "My task",
    }));
    expect(created.project).toBe("resolved-project");
    expect(created.projectSource).toBe("resolved-config");
  });

  it("records approved artifact and pipeline learning on approve", async () => {
    await approveTaskService("task-1");

    expect(mocks.saveTaskMeta).toHaveBeenCalledWith("task-1", expect.objectContaining({
      status: "done",
      currentStage: "approved",
      humanApprovalRequired: false,
    }));
    expect(mocks.writeJson).toHaveBeenCalledWith(
      "/tmp/task-1/human/90-final-review.approved.json",
      expect.objectContaining({
        taskId: "task-1",
        output: expect.objectContaining({ decision: "approved" }),
      }),
    );
    expect(mocks.recordPipelineApproval).toHaveBeenCalledWith("task-1", "pipe-1", expect.any(Array));
  });

  it("records reproved artifact and routes task back to remediation stage", async () => {
    const result = await reproveTaskService({
      taskId: "task-1",
      reason: "Needs fixes",
      rollbackMode: "task",
      rollbackSummary: {
        requested: 2,
        trackedRestored: ["a.ts"],
        untrackedRemoved: [],
        skipped: ["b.ts"],
        warnings: [],
      },
    });

    expect(result.targetAgent).toBe("Synx QA Engineer");
    expect(mocks.saveTaskMeta).toHaveBeenCalledWith("task-1", expect.objectContaining({
      status: "waiting_agent",
      currentStage: "reproved",
      nextAgent: "Synx QA Engineer",
      humanApprovalRequired: false,
    }));

    const requestCall = mocks.writeJson.mock.calls.find(([file]) => String(file).includes("synx-qa-engineer.request.json"));
    expect(requestCall).toBeDefined();
    expect(requestCall?.[1]).toMatchObject({
      stage: "synx-qa-engineer",
      status: "request",
    });
    expect(mocks.writeJson).toHaveBeenCalledWith(
      "/tmp/task-1/human/90-final-review.reproved.json",
      expect.objectContaining({
        output: expect.objectContaining({
          decision: "reproved",
          reason: "Needs fixes",
          rollbackMode: "task",
        }),
      }),
    );
    expect(mocks.recordPipelineReproval).toHaveBeenCalledWith("task-1", "pipe-1", expect.any(Array), "Needs fixes");
  });

  it("delegates cancellation request as human action", async () => {
    await cancelTaskService({ taskId: "task-1", reason: "No longer needed" });
    expect(mocks.requestTaskCancel).toHaveBeenCalledWith({
      taskId: "task-1",
      requestedBy: "human",
      reason: "No longer needed",
    });
  });
});
