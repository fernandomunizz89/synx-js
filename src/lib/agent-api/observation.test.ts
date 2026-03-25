import { describe, expect, it } from "vitest";
import type { TaskDetailDto } from "../observability/dto.js";
import { buildObservation, deriveNeedsAction, deriveNextPollMs } from "./observation.js";

function makeDetail(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    taskId: overrides.taskId || "task-20260324-sample",
    title: overrides.title || "Sample task",
    type: overrides.type || "Feature",
    typeHint: overrides.typeHint || "Feature",
    project: overrides.project || "agent-api-test",
    status: overrides.status || "in_progress",
    currentStage: overrides.currentStage || "dispatcher",
    stage: overrides.stage || "dispatcher",
    currentAgent: overrides.currentAgent || "Dispatcher",
    nextAgent: overrides.nextAgent || "Synx Front Expert",
    humanApprovalRequired: overrides.humanApprovalRequired || false,
    createdAt: overrides.createdAt || "2026-03-24T10:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-03-24T10:01:00.000Z",
    parentTaskId: overrides.parentTaskId,
    rootProjectId: overrides.rootProjectId || "task-20260324-sample",
    sourceKind: overrides.sourceKind || "standalone",
    dependsOn: overrides.dependsOn || [],
    blockedBy: overrides.blockedBy || [],
    priority: overrides.priority || 3,
    milestone: overrides.milestone,
    parallelizable: overrides.parallelizable ?? true,
    ownershipBoundaries: overrides.ownershipBoundaries || [],
    mergeStrategy: overrides.mergeStrategy || "auto-rebase",
    ready: overrides.ready ?? true,
    childTaskIds: overrides.childTaskIds || [],
    projectProgress: overrides.projectProgress || null,
    consumption: overrides.consumption || {
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCostUsd: 0,
      totalDurationMs: 0,
    },
    rawRequest: overrides.rawRequest || "Do the sample work",
    history: overrides.history || [],
    recentEvents: overrides.recentEvents || [],
    views: overrides.views || [],
    artifacts: overrides.artifacts || [],
    doneArtifacts: overrides.doneArtifacts || [],
    humanArtifacts: overrides.humanArtifacts || [],
    childTasks: overrides.childTasks || [],
    pipelineState: overrides.pipelineState || null,
    cancelRequest: overrides.cancelRequest || null,
  };
}

describe("agent-api/observation", () => {
  describe("deriveNextPollMs", () => {
    it("returns fast interval for in_progress tasks", () => {
      expect(deriveNextPollMs("in_progress")).toBe(3_000);
    });

    it("returns slow interval for terminal tasks", () => {
      expect(deriveNextPollMs("done")).toBe(60_000);
      expect(deriveNextPollMs("failed")).toBe(60_000);
    });

    it("returns default interval for unknown statuses", () => {
      expect(deriveNextPollMs("unknown_status")).toBe(10_000);
    });
  });

  describe("deriveNeedsAction", () => {
    it("requires action when status is waiting_human", () => {
      const detail = makeDetail({ status: "waiting_human" });
      expect(deriveNeedsAction(detail)).toEqual({
        needsAction: true,
        actionRequired: "approve_or_reprove",
      });
    });

    it("requires action when humanApprovalRequired is true", () => {
      const detail = makeDetail({ status: "in_progress", humanApprovalRequired: true });
      expect(deriveNeedsAction(detail)).toEqual({
        needsAction: true,
        actionRequired: "approve_or_reprove",
      });
    });

    it("does not require action for normal execution", () => {
      const detail = makeDetail({ status: "in_progress", humanApprovalRequired: false });
      expect(deriveNeedsAction(detail)).toEqual({
        needsAction: false,
        actionRequired: null,
      });
    });
  });

  describe("buildObservation", () => {
    it("returns not-found observation for null detail", () => {
      const result = buildObservation(null, "task-missing");
      expect(result.ok).toBe(true);
      expect(result.observation.taskId).toBe("task-missing");
      expect(result.observation.message).toBe("Task not found.");
      expect(result.observation.nextPollMs).toBe(10_000);
    });

    it("maps detail to observation envelope", () => {
      const detail = makeDetail({
        status: "waiting_human",
        currentAgent: "Human Review",
        doneArtifacts: ["00-dispatcher.done.json", "90-final-review.pending.json"],
      });
      const result = buildObservation(detail);
      expect(result.ok).toBe(true);
      expect(result.observation.taskId).toBe(detail.taskId);
      expect(result.observation.status).toBe("waiting_human");
      expect(result.observation.currentAgent).toBe("Human Review");
      expect(result.observation.actionRequired).toBe("approve_or_reprove");
      expect(result.observation.output).toBe("90-final-review.pending.json");
      expect(result.observation.nextPollMs).toBe(10_000);
    });
  });
});
