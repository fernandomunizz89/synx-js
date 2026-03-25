import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  collectReadinessReport: vi.fn<() => Promise<{ ok: boolean; issues: unknown[] }>>(),
  printReadinessReport: vi.fn<(report: unknown, label: string) => void>(),
  allTaskIds: vi.fn<() => Promise<string[]>>(),
  loadTaskMeta: vi.fn<(taskId: string) => Promise<any>>(),
  approveTaskService: vi.fn<(taskId: string) => Promise<void>>(),
  reproveTaskService: vi.fn<(args: unknown) => Promise<{ taskId: string; targetAgent: string; targetStage: string }>>(),
  cancelTaskService: vi.fn<(args: unknown) => Promise<void>>(),
  createTaskService: vi.fn<(args: unknown) => Promise<{ taskId: string; taskPath: string }>>(),
  getOverview: vi.fn<() => Promise<any>>(),
  listTaskSummaries: vi.fn<() => Promise<any[]>>(),
  listReviewQueue: vi.fn<() => Promise<any[]>>(),
  getTaskDetail: vi.fn<(taskId: string) => Promise<any>>(),
  getMetricsOverview: vi.fn<(hours: number) => Promise<any>>(),
  getTaskConsumptionRanking: vi.fn<(limit: number) => Promise<any[]>>(),
  getAgentConsumptionRanking: vi.fn<(limit: number) => Promise<any[]>>(),
  getProjectConsumptionRanking: vi.fn<(limit: number) => Promise<any[]>>(),
  getMetricsTimeline: vi.fn<(days: number) => Promise<any[]>>(),
  getAdvancedAnalyticsReport: vi.fn<(args: unknown) => Promise<any>>(),
  writeRuntimeControl: vi.fn<(args: unknown) => Promise<any>>(),
  applyTaskRollback: vi.fn<(taskId: string) => Promise<any>>(),
  invalidateQueryCache: vi.fn<() => void>(),
}));

vi.mock("../bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../readiness.js", () => ({
  collectReadinessReport: mocks.collectReadinessReport,
  printReadinessReport: mocks.printReadinessReport,
}));

vi.mock("../task.js", () => ({
  allTaskIds: mocks.allTaskIds,
  loadTaskMeta: mocks.loadTaskMeta,
}));

vi.mock("../services/task-services.js", () => ({
  approveTaskService: mocks.approveTaskService,
  reproveTaskService: mocks.reproveTaskService,
  cancelTaskService: mocks.cancelTaskService,
  createTaskService: mocks.createTaskService,
}));

vi.mock("../observability/queries.js", () => ({
  getOverview: mocks.getOverview,
  listTaskSummaries: mocks.listTaskSummaries,
  listReviewQueue: mocks.listReviewQueue,
  getTaskDetail: mocks.getTaskDetail,
  getMetricsOverview: mocks.getMetricsOverview,
  invalidateQueryCache: mocks.invalidateQueryCache,
}));

vi.mock("../observability/analytics.js", () => ({
  getTaskConsumptionRanking: mocks.getTaskConsumptionRanking,
  getAgentConsumptionRanking: mocks.getAgentConsumptionRanking,
  getProjectConsumptionRanking: mocks.getProjectConsumptionRanking,
  getMetricsTimeline: mocks.getMetricsTimeline,
  getAdvancedAnalyticsReport: mocks.getAdvancedAnalyticsReport,
}));

vi.mock("../runtime.js", () => ({
  writeRuntimeControl: mocks.writeRuntimeControl,
}));

vi.mock("../services/task-rollback.js", () => ({
  applyTaskRollback: mocks.applyTaskRollback,
}));

import { approveCommand } from "../../commands/approve.js";
import { reproveCommand } from "../../commands/reprove.js";
import { runInlineCommand } from "../start/command-handler.js";
import { createUiRequestHandler } from "./server.js";

async function startEphemeralServer(handler: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

describe.sequential("ui action channel parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    vi.mocked(mocks.ensureGlobalInitialized).mockResolvedValue(undefined);
    vi.mocked(mocks.ensureProjectInitialized).mockResolvedValue(undefined);
    vi.mocked(mocks.collectReadinessReport).mockResolvedValue({ ok: true, issues: [] });

    vi.mocked(mocks.allTaskIds).mockResolvedValue(["task-1"]);
    vi.mocked(mocks.loadTaskMeta).mockResolvedValue({
      taskId: "task-1",
      title: "Task parity",
      type: "Feature",
      status: "waiting_human",
      currentStage: "human-review",
      currentAgent: "Human Review",
      nextAgent: "",
      humanApprovalRequired: true,
      createdAt: "2026-03-22T10:00:00.000Z",
      updatedAt: "2026-03-22T10:00:00.000Z",
      history: [],
      project: "parity",
    });

    vi.mocked(mocks.approveTaskService).mockResolvedValue(undefined);
    vi.mocked(mocks.reproveTaskService).mockResolvedValue({
      taskId: "task-1",
      targetAgent: "Synx Front Expert",
      targetStage: "synx-front-expert",
    });
    vi.mocked(mocks.cancelTaskService).mockResolvedValue(undefined);

    vi.mocked(mocks.getOverview).mockResolvedValue({
      runtime: { isAlive: true },
      counts: { total: 1, active: 0, waitingHuman: 1, failed: 0, done: 0 },
      reviewQueueCount: 1,
      consumption: {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedTotalTokens: 0,
        estimatedCostUsd: 0,
      },
      updatedAt: "2026-03-22T10:00:00.000Z",
    });
    vi.mocked(mocks.listTaskSummaries).mockResolvedValue([]);
    vi.mocked(mocks.listReviewQueue).mockResolvedValue([]);
    vi.mocked(mocks.getTaskDetail).mockResolvedValue(null);
    vi.mocked(mocks.getMetricsOverview).mockResolvedValue({});
    vi.mocked(mocks.getTaskConsumptionRanking).mockResolvedValue([]);
    vi.mocked(mocks.getAgentConsumptionRanking).mockResolvedValue([]);
    vi.mocked(mocks.getProjectConsumptionRanking).mockResolvedValue([]);
    vi.mocked(mocks.getMetricsTimeline).mockResolvedValue([]);
    vi.mocked(mocks.getAdvancedAnalyticsReport).mockResolvedValue({
      tasks: [],
      agents: [],
      projects: [],
      timeline: [],
      bottlenecks: [],
      qaLoops: { tasksWithQa: 0, totalQaLoops: 0, avgQaLoopsPerTask: 0 },
    });
    vi.mocked(mocks.writeRuntimeControl).mockResolvedValue({
      command: "pause",
      requestedAt: "2026-03-22T10:00:00.000Z",
      requestedBy: "web-ui",
      reason: "",
    });
    vi.mocked(mocks.applyTaskRollback).mockResolvedValue(null);

    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("approve flow uses the same shared service across CLI, TUI, and Web", async () => {
    await approveCommand.parseAsync(["node", "synx", "approve", "--task-id", "task-1", "--yes"]);

    await runInlineCommand(
      { kind: "approve", taskId: "task-1" },
      {
        pushEvent: () => undefined,
        requestStop: () => undefined,
      },
    );

    const realtime = {
      subscribe: () => () => undefined,
      close: () => undefined,
    } as any;
    const server = await startEphemeralServer(createUiRequestHandler({
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
      realtime,
    }));

    try {
      const response = await fetch(`${server.baseUrl}/api/tasks/task-1/approve`, {
        method: "POST",
      });
      expect(response.status).toBe(200);
    } finally {
      await server.close();
    }

    expect(mocks.approveTaskService).toHaveBeenCalledTimes(3);
    expect(mocks.approveTaskService).toHaveBeenNthCalledWith(1, "task-1");
    expect(mocks.approveTaskService).toHaveBeenNthCalledWith(2, "task-1");
    expect(mocks.approveTaskService).toHaveBeenNthCalledWith(3, "task-1");
  });

  it("reprove flow uses the same shared service across CLI, TUI, and Web", async () => {
    await reproveCommand.parseAsync([
      "node",
      "synx",
      "reprove",
      "--task-id",
      "task-1",
      "--reason",
      "Need improvements",
      "--rollback",
      "none",
      "--yes",
    ]);

    await runInlineCommand(
      { kind: "reprove", taskId: "task-1", reason: "Need improvements" },
      {
        pushEvent: () => undefined,
        requestStop: () => undefined,
      },
    );

    const realtime = {
      subscribe: () => () => undefined,
      close: () => undefined,
    } as any;
    const server = await startEphemeralServer(createUiRequestHandler({
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
      realtime,
    }));

    try {
      const response = await fetch(`${server.baseUrl}/api/tasks/task-1/reprove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Need improvements", rollbackMode: "none" }),
      });
      expect(response.status).toBe(200);
    } finally {
      await server.close();
    }

    expect(mocks.reproveTaskService).toHaveBeenCalledTimes(3);
    const calls = mocks.reproveTaskService.mock.calls.map((entry) => entry[0] as { taskId: string; reason: string; rollbackMode?: string });
    expect(calls.every((entry) => entry.taskId === "task-1")).toBe(true);
    expect(calls.every((entry) => entry.reason === "Need improvements")).toBe(true);
    expect(calls.every((entry) => (entry.rollbackMode || "none") === "none")).toBe(true);
  });
});
