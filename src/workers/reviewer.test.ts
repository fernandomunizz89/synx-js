import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReviewerWorker } from "./reviewer.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { createProvider } from "../providers/factory.js";

vi.mock("../lib/config.js", () => ({
  loadPromptFile: vi.fn(),
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn(),
}));

vi.mock("./base.js", () => ({
  WorkerBase: class {
    protected buildAgentInput = vi.fn();
    protected finishStage = vi.fn();
  }
}));

describe("ReviewerWorker", () => {
  let worker: ReviewerWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new ReviewerWorker();
  });

  it("processes a task and transitions to QA", async () => {
    const taskId = "task-123";
    const request = { stage: "reviewer" };
    
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      providers: { planner: { type: "mock", model: "m" } }
    } as any);
    vi.mocked(loadPromptFile).mockResolvedValue("Review this: {{INPUT_JSON}}");
    
    const mockProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          whatLooksGood: ["Good"],
          issuesFound: [],
          requiredChanges: [],
          verdict: "approved",
          nextAgent: "QA Validator"
        },
        provider: "mock",
        model: "m"
      })
    };
    vi.mocked(createProvider).mockReturnValue(mockProvider as any);
    
    // @ts-ignore - access protected
    worker.buildAgentInput.mockResolvedValue({ task: { typeHint: "fix" } });

    // @ts-ignore - access protected 
    await worker.processTask(taskId, request as any);

    // @ts-ignore
    expect(worker.finishStage).toHaveBeenCalledWith(expect.objectContaining({
      taskId,
      nextAgent: "QA Validator",
      nextStage: "qa"
    }));
  });

  it("handles empty lists and different verdicts", async () => {
    const taskId = "task-456";
    const request = { stage: "reviewer" };
    
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      providers: { planner: { type: "mock", model: "m" } }
    } as any);
    vi.mocked(loadPromptFile).mockResolvedValue("Review this: {{INPUT_JSON}}");
    
    const mockProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          whatLooksGood: [],
          issuesFound: ["Problem"],
          requiredChanges: ["Fix it"],
          verdict: "needs_changes",
          nextAgent: "QA Validator"
        },
        provider: "mock",
        model: "m"
      })
    };
    vi.mocked(createProvider).mockReturnValue(mockProvider as any);
    
    // @ts-ignore - access protected
    worker.buildAgentInput.mockResolvedValue({ task: { typeHint: "refactor" } });

    // @ts-ignore - access protected 
    await worker.processTask(taskId, request as any);

    // @ts-ignore
    expect(worker.finishStage).toHaveBeenCalledWith(expect.objectContaining({
      taskId,
      output: expect.objectContaining({
        verdict: "needs_changes"
      })
    }));
  });
});
