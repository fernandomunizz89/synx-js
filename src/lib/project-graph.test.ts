import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskMeta } from "./types.js";
import { buildProjectGraphSnapshot, persistProjectGraphState } from "./project-graph.js";
import { saveTaskMeta } from "./task.js";

vi.mock("./task.js", () => ({
  saveTaskMeta: vi.fn(),
}));

function baseMeta(overrides: Partial<TaskMeta> & Pick<TaskMeta, "taskId" | "title">): TaskMeta {
  return {
    taskId: overrides.taskId,
    title: overrides.title,
    type: overrides.type || "Feature",
    project: overrides.project || "graph-test",
    status: overrides.status || "waiting_agent",
    currentStage: overrides.currentStage || "dispatcher",
    currentAgent: overrides.currentAgent || "",
    nextAgent: overrides.nextAgent || "Dispatcher",
    humanApprovalRequired: overrides.humanApprovalRequired || false,
    createdAt: overrides.createdAt || "2026-03-24T10:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-03-24T10:00:00.000Z",
    parentTaskId: overrides.parentTaskId,
    rootProjectId: overrides.rootProjectId || overrides.taskId,
    sourceKind: overrides.sourceKind || "standalone",
    dependsOn: overrides.dependsOn || [],
    blockedBy: overrides.blockedBy || [],
    priority: overrides.priority,
    milestone: overrides.milestone,
    parallelizable: overrides.parallelizable,
    history: overrides.history || [],
    securityAuditRequired: overrides.securityAuditRequired,
    suggestedChain: overrides.suggestedChain,
  };
}

describe("lib/project-graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes ready subtasks based on dependency blockers", () => {
    const taskA = baseMeta({
      taskId: "task-a",
      title: "Task A",
      status: "done",
    });
    const taskB = baseMeta({
      taskId: "task-b",
      title: "Task B",
      dependsOn: ["task-a"],
      priority: 4,
    });
    const taskC = baseMeta({
      taskId: "task-c",
      title: "Task C",
      dependsOn: ["task-b"],
      priority: 5,
    });

    const snapshot = buildProjectGraphSnapshot([taskA, taskB, taskC]);
    expect(snapshot.nodeByTaskId.get("task-b")?.ready).toBe(true);
    expect(snapshot.nodeByTaskId.get("task-c")?.ready).toBe(false);
    expect(snapshot.nodeByTaskId.get("task-c")?.blockedBy).toEqual(["task-b"]);
    expect(snapshot.readyTaskIds).toEqual(["task-b"]);
  });

  it("enforces non-parallel subtasks to run one at a time per project", () => {
    const highPriority = baseMeta({
      taskId: "task-high",
      title: "High priority",
      sourceKind: "project-subtask",
      rootProjectId: "task-root",
      parentTaskId: "task-root",
      priority: 5,
      parallelizable: false,
    });
    const lowPriority = baseMeta({
      taskId: "task-low",
      title: "Low priority",
      sourceKind: "project-subtask",
      rootProjectId: "task-root",
      parentTaskId: "task-root",
      priority: 2,
      parallelizable: false,
    });

    const snapshot = buildProjectGraphSnapshot([highPriority, lowPriority]);
    expect(snapshot.nodeByTaskId.get("task-high")?.ready).toBe(true);
    expect(snapshot.nodeByTaskId.get("task-low")?.ready).toBe(false);
    expect(snapshot.nodeByTaskId.get("task-low")?.blockedBy).toEqual(["task-high"]);
  });

  it("marks parent project as done when every child is done", async () => {
    const parent = baseMeta({
      taskId: "task-root",
      title: "Parent project",
      type: "Project",
      sourceKind: "project-intake",
      status: "in_progress",
      currentStage: "project-tracking",
      nextAgent: "",
    });
    const childOne = baseMeta({
      taskId: "task-child-1",
      title: "Child one",
      sourceKind: "project-subtask",
      parentTaskId: "task-root",
      rootProjectId: "task-root",
      status: "done",
    });
    const childTwo = baseMeta({
      taskId: "task-child-2",
      title: "Child two",
      sourceKind: "project-subtask",
      parentTaskId: "task-root",
      rootProjectId: "task-root",
      status: "done",
    });

    const result = await persistProjectGraphState([parent, childOne, childTwo]);
    expect(result.projectProgressByParent.get("task-root")?.completionRatio).toBe(1);
    expect(saveTaskMeta).toHaveBeenCalledWith("task-root", expect.objectContaining({
      status: "done",
      currentStage: "project-complete",
      nextAgent: "",
      humanApprovalRequired: false,
    }));
  });
});
