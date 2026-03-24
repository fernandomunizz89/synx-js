import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createTaskService: vi.fn(),
  approveTaskService: vi.fn(),
  reproveTaskService: vi.fn(),
  getTaskDetail: vi.fn(),
  listTaskSummaries: vi.fn(),
  listReviewQueue: vi.fn(),
  getOverview: vi.fn(),
}));

vi.mock("../services/task-services.js", () => ({
  createTaskService: mocks.createTaskService,
  approveTaskService: mocks.approveTaskService,
  reproveTaskService: mocks.reproveTaskService,
}));

vi.mock("../observability/queries.js", () => ({
  getTaskDetail: mocks.getTaskDetail,
  listTaskSummaries: mocks.listTaskSummaries,
  listReviewQueue: mocks.listReviewQueue,
  getOverview: mocks.getOverview,
}));

import { dispatchNemoAction, generateColangSample, listNemoActions } from "./nemo-adapter.js";

describe("agent-api/nemo-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTaskService.mockResolvedValue({ taskId: "task-1", taskPath: "/tmp/task-1" });
    mocks.approveTaskService.mockResolvedValue(undefined);
    mocks.reproveTaskService.mockResolvedValue({ taskId: "task-1", targetAgent: "Synx Front Expert", targetStage: "synx-front-expert" });
    mocks.getTaskDetail.mockResolvedValue(null);
    mocks.listTaskSummaries.mockResolvedValue([]);
    mocks.listReviewQueue.mockResolvedValue([]);
    mocks.getOverview.mockResolvedValue({ runtime: { isAlive: true } });
  });

  it("lists 7 NeMo actions", () => {
    const actions = listNemoActions();
    expect(actions).toHaveLength(7);
    expect(actions.map((action) => action.name)).toContain("synx_create_task");
    expect(actions.map((action) => action.name)).toContain("synx_get_status");
  });

  it("returns unknown action error", async () => {
    const result = await dispatchNemoAction("synx_unknown", {}, { enableMutations: true });
    expect(result.output_data.ok).toBe(false);
    expect(result.output_data.error).toBe("Unknown action: synx_unknown");
  });

  it("blocks mutations when disabled", async () => {
    const result = await dispatchNemoAction("synx_create_task", {
      title: "x",
      rawRequest: "y",
    }, { enableMutations: false });
    expect(result.output_data.ok).toBe(false);
    expect(result.output_data.error).toBe("Mutations disabled.");
    expect(mocks.createTaskService).not.toHaveBeenCalled();
  });

  it("includes all action blocks in generated colang sample", () => {
    const baseUrl = "http://localhost:4317";
    const sample = generateColangSample(baseUrl);
    for (const action of listNemoActions()) {
      expect(sample).toContain(`define action ${action.name}`);
      expect(sample).toContain(`${baseUrl}/api/v1/nemo/actions/${action.name}`);
    }
  });
});
