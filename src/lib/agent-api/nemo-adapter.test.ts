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

  it("dispatches synx_create_task and calls createTaskService with parsed params", async () => {
    mocks.getTaskDetail.mockResolvedValue({ taskId: "task-1", status: "new", doneArtifacts: [], history: [] });
    const result = await dispatchNemoAction("synx_create_task", {
      title: "Build feature",
      rawRequest: "Implement the login flow",
      typeHint: "Feature",
      relatedFiles: ["src/auth.ts"],
      notes: ["Keep it simple"],
    }, { enableMutations: true });

    expect(mocks.createTaskService).toHaveBeenCalledWith(expect.objectContaining({
      title: "Build feature",
      rawRequest: "Implement the login flow",
    }));
    expect(result.output_data).toBeDefined();
  });

  it("dispatches synx_list_tasks and filters by query", async () => {
    mocks.listTaskSummaries.mockResolvedValue([
      { taskId: "t-1", title: "Fix login bug", status: "in_progress", project: "web" },
      { taskId: "t-2", title: "Add dashboard", status: "new", project: "web" },
    ] as any);

    const result = await dispatchNemoAction("synx_list_tasks", { q: "login" }, { enableMutations: true });
    expect((result.output_data as any).data).toHaveLength(1);
    expect((result.output_data as any).data[0].taskId).toBe("t-1");
  });

  it("dispatches synx_get_task and handles missing taskId", async () => {
    const result = await dispatchNemoAction("synx_get_task", {}, { enableMutations: true });
    expect(result.output_data.ok).toBe(false);
    expect(result.output_data.error).toBe("taskId is required.");
  });

  it("dispatches synx_list_tasks with status and project filters", async () => {
    mocks.listTaskSummaries.mockResolvedValue([
      { taskId: "t-1", status: "new", project: "p1" },
      { taskId: "t-2", status: "done", project: "p1" },
      { taskId: "t-3", status: "new", project: "p2" },
    ] as any);

    const res1 = await dispatchNemoAction("synx_list_tasks", { status: "new" }, { enableMutations: true });
    expect((res1.output_data as any).data).toHaveLength(2);

    const res2 = await dispatchNemoAction("synx_list_tasks", { project: "p2" }, { enableMutations: true });
    expect((res2.output_data as any).data).toHaveLength(1);
  });

  it("dispatches synx_approve_task and synx_reprove_task", async () => {
    mocks.getTaskDetail.mockResolvedValue({ 
      taskId: "task-1", 
      status: "waiting_human", 
      doneArtifacts: [], 
      history: [] 
    });
    
    await dispatchNemoAction("synx_approve_task", { taskId: "task-1" }, { enableMutations: true });
    expect(mocks.approveTaskService).toHaveBeenCalledWith("task-1");

    await dispatchNemoAction("synx_reprove_task", { taskId: "task-1", reason: "fix it" }, { enableMutations: true });
    expect(mocks.reproveTaskService).toHaveBeenCalledWith({ taskId: "task-1", reason: "fix it" });
  });

  it("dispatches synx_list_pending_review", async () => {
    mocks.listReviewQueue.mockResolvedValue([{ taskId: "t-q" }]);
    const result = await dispatchNemoAction("synx_list_pending_review", {}, { enableMutations: true });
    expect((result.output_data as any).data).toHaveLength(1);
  });
});
