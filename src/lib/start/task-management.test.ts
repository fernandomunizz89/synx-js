import { describe, expect, it, vi, beforeEach } from "vitest";
import { taskUpdatedAtMs, byMostRecent, summarizeTaskCounts, remediationTarget, pickFocusedTask, resolveHumanTask, buildHumanInputLines, processTaskWithWorkers, processTasksWithConcurrency, loadMetasSafe } from "./task-management.js";
import { loadTaskMeta } from "../task.js";
import { synxWaiting } from "../synx-ui.js";
import { workerList as workers } from "../../workers/index.js";

vi.mock("../task.js", () => ({
  loadTaskMeta: vi.fn(),
}));

vi.mock("../synx-ui.js", () => ({
  synxWaiting: vi.fn((m) => `WAIT: ${m}`),
}));

vi.mock("../../workers/index.js", () => ({
  workerList: [
    { tryProcess: vi.fn() },
    { tryProcess: vi.fn() },
  ],
}));

describe("lib/start/task-management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("taskUpdatedAtMs", () => {
    it("prefers updatedAt over createdAt", () => {
      const meta = { createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z" } as any;
      expect(taskUpdatedAtMs(meta)).toBe(new Date("2024-01-02T00:00:00Z").getTime());
    });

    it("falls back to createdAt", () => {
      const meta = { createdAt: "2024-01-01T00:00:00Z" } as any;
      expect(taskUpdatedAtMs(meta)).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    });
  });

  describe("summarizeTaskCounts", () => {
    it("counts statuses correctly", () => {
      const metas = [
        { status: "new" }, { status: "in_progress" }, { status: "waiting_human" }, { status: "failed" }, { status: "done" },
      ] as any;
      const counts = summarizeTaskCounts(metas);
      expect(counts.active).toBe(2);
      expect(counts.waitingHuman).toBe(1);
      expect(counts.failed).toBe(1);
      expect(counts.done).toBe(1);
    });
  });

  describe("remediationTarget", () => {
    it("returns Synx QA Engineer for Bug task", () => {
      const target = remediationTarget("Bug");
      expect(target.agent).toBe("Synx QA Engineer");
    });

    it("returns Synx Front Expert for other tasks", () => {
      const target = remediationTarget("Feature" as any);
      expect(target.agent).toBe("Synx Front Expert");
    });
  });

  describe("pickFocusedTask", () => {
    it("prefers waiting_human over active", () => {
      const metas = [
        { status: "in_progress", updatedAt: "2024-01-02T00:00:00Z" },
        { status: "waiting_human", updatedAt: "2024-01-01T00:00:00Z" },
      ] as any;
      const result = pickFocusedTask(metas);
      expect(result.meta.status).toBe("waiting_human");
      expect(result.reason).toBe("task waiting for your approval");
    });

    it("prefers latest done if no active/waiting", () => {
      const metas = [
        { status: "done", updatedAt: "2024-01-01T00:00:00Z" },
      ] as any;
      const result = pickFocusedTask(metas);
      expect(result.meta.status).toBe("done");
      expect(result.reason).toBe("latest completed task");
    });

    it("prefers latest failed if no active/waiting/done", () => {
      const metas = [
        { status: "failed", updatedAt: "2024-01-01T00:00:00Z" },
      ] as any;
      const result = pickFocusedTask(metas);
      expect(result.meta.status).toBe("failed");
      expect(result.reason).toBe("latest failed task");
    });

    it("falls back to most recent if none of the above", () => {
      const metas = [
        { status: "unknown", updatedAt: "2024-01-01T00:00:00Z" },
      ] as any;
      const result = pickFocusedTask(metas);
      expect(result.reason).toBe("most recently updated task");
    });
  });

  describe("resolveHumanTask", () => {
    it("finds task with humanApprovalRequired flag", () => {
      const metas = [
        { taskId: "t1", humanApprovalRequired: true, updatedAt: "2024-01-01T00:00:00Z" },
      ] as any;
      expect(resolveHumanTask(metas)?.taskId).toBe("t1");
    });

    it("returns null if no human task", () => {
      expect(resolveHumanTask([{ status: "done" }] as any)).toBeNull();
    });
  });

  describe("buildHumanInputLines", () => {
    it("returns lines for human task", () => {
      const lines = buildHumanInputLines({ taskId: "t1", title: "T1", type: "Bug", currentStage: "qa" } as any);
      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe("WAIT: Task waiting human review: t1");
    });

    it("returns empty array for null", () => {
      expect(buildHumanInputLines(null)).toEqual([]);
    });
  });

  describe("processTasksWithConcurrency", () => {
    it("runs tasks in parallel up to concurrency limit", async () => {
      vi.mocked(workers[0].tryProcess).mockResolvedValue(true);
      vi.mocked(workers[1].tryProcess).mockResolvedValue(true);

      const outcomes = await processTasksWithConcurrency(["t1", "t2", "t3"], 2);
      expect(outcomes).toHaveLength(3);
      expect(workers[0].tryProcess).toHaveBeenCalledTimes(3);
      expect(workers[1].tryProcess).toHaveBeenCalledTimes(3);
    });

    it("returns empty array for empty task list", async () => {
      expect(await processTasksWithConcurrency([], 2)).toEqual([]);
    });
  });

  describe("processTaskWithWorkers", () => {
    it("calls tryProcess on all workers and counts successes", async () => {
      vi.mocked(workers[0].tryProcess).mockResolvedValue(true);
      vi.mocked(workers[1].tryProcess).mockResolvedValue(false);

      const outcome = await processTaskWithWorkers("t1");
      expect(outcome.processedStages).toBe(1);
      expect(workers[0].tryProcess).toHaveBeenCalledWith("t1");
      expect(workers[1].tryProcess).toHaveBeenCalledWith("t1");
    });
  });

  describe("loadMetasSafe", () => {
    it("filters out failed loads", async () => {
      vi.mocked(loadTaskMeta).mockResolvedValueOnce({ taskId: "t1" } as any);
      vi.mocked(loadTaskMeta).mockRejectedValueOnce(new Error("fail"));

      const metas = await loadMetasSafe(["t1", "t2"]);
      expect(metas).toHaveLength(1);
      expect(metas[0].taskId).toBe("t1");
    });
  });
});
