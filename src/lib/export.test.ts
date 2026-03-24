import { describe, it, expect, vi } from "vitest";

vi.mock("./task.js", () => ({
  loadTaskMeta: vi.fn(),
  allTaskIds: vi.fn(),
  saveTaskMeta: vi.fn(),
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn().mockResolvedValue(false),
  readJson: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  taskDir: vi.fn().mockReturnValue("/tasks/task-001"),
}));

const mockMeta = {
  taskId: "task-001",
  title: "Add user auth",
  type: "Feature",
  project: "my-app",
  status: "done",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  rootProjectId: "task-001",
  sourceKind: "standalone",
  dependsOn: [],
  blockedBy: [],
  priority: 3,
  parallelizable: true,
  suggestedChain: ["Synx Back Expert", "Synx Code Reviewer"],
  history: [
    {
      stage: "dispatcher",
      agent: "Dispatcher",
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:02:00.000Z",
      durationMs: 60000,
      provider: "openai-compatible",
      model: "gpt-4o",
      estimatedCostUsd: 0.01,
      estimatedTotalTokens: 1000,
    },
    {
      stage: "synx-back-expert",
      agent: "Synx Back Expert",
      startedAt: "2026-01-01T00:02:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
      durationMs: 180000,
      provider: "openai-compatible",
      model: "gpt-4o",
      estimatedCostUsd: 0.05,
      estimatedTotalTokens: 5000,
    },
  ],
  humanApprovalRequired: false,
  currentStage: "done",
  currentAgent: "Human Review",
  nextAgent: "",
};

describe("exportTask", () => {
  it("returns task export with stages from meta history", async () => {
    const { loadTaskMeta, allTaskIds } = await import("./task.js");
    vi.mocked(loadTaskMeta).mockResolvedValue(mockMeta as any);
    vi.mocked(allTaskIds).mockResolvedValue(["task-001"]);

    const { exportTask } = await import("./export.js");
    const result = await exportTask("task-001");

    expect(result.taskId).toBe("task-001");
    expect(result.title).toBe("Add user auth");
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].agent).toBe("Dispatcher");
    expect(result.stages[1].agent).toBe("Synx Back Expert");
    expect(result.suggestedChain).toEqual(["Synx Back Expert", "Synx Code Reviewer"]);
  });

  it("sums totalCostUsd and totalTokens across stages", async () => {
    const { loadTaskMeta, allTaskIds } = await import("./task.js");
    vi.mocked(loadTaskMeta).mockResolvedValue(mockMeta as any);
    vi.mocked(allTaskIds).mockResolvedValue(["task-001"]);

    const { exportTask } = await import("./export.js");
    const result = await exportTask("task-001");

    expect(result.totalCostUsd).toBeCloseTo(0.06, 5);
    expect(result.totalTokens).toBe(6000);
  });

  it("includes dispatcherOutput when done file exists", async () => {
    const { loadTaskMeta, allTaskIds } = await import("./task.js");
    const { exists, readJson } = await import("./fs.js");
    vi.mocked(loadTaskMeta).mockResolvedValue(mockMeta as any);
    vi.mocked(allTaskIds).mockResolvedValue(["task-001"]);
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readJson).mockResolvedValue({ output: { type: "Feature", goal: "Add user auth" } });

    const { exportTask } = await import("./export.js");
    const result = await exportTask("task-001");

    expect(result.dispatcherOutput).toBeDefined();
  });
});
