import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildStepContext, loadPipelineState, savePipelineState, advancePipelineState, PIPELINE_STATE_FILE } from "./pipeline-state.js";
import { readJsonValidated, writeJson } from "./fs.js";
import { taskDir } from "./paths.js";
import path from "node:path";

vi.mock("./fs.js", () => ({
  readJsonValidated: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  taskDir: vi.fn((id) => `/tmp/synx-tasks/${id}`),
}));

describe("lib/pipeline-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildStepContext", () => {
    it("extracts summary from output.summary", () => {
      const output = { summary: "Done task", edits: [] };
      const ctx = buildStepContext(1, "AgentA", output);
      expect(ctx.summary).toBe("Done task");
    });

    it("extracts summary from output.implementationSummary if summary is missing", () => {
      const output = { implementationSummary: "Implemented feature", edits: [] };
      const ctx = buildStepContext(1, "AgentA", output);
      expect(ctx.summary).toBe("Implemented feature");
    });

    it("falls back to truncated stringified JSON if no summary fields exist", () => {
      const output = { foo: "bar", baz: "qux" };
      const ctx = buildStepContext(1, "AgentA", output);
      expect(ctx.summary).toContain('{"foo":"bar","baz":"qux"}');
    });

    it("strips fields in STRIPPED_FIELDS (e.g. edits)", () => {
      const output = { summary: "S", edits: [{ file: "a.ts" }], data: "keep" };
      const ctx = buildStepContext(1, "AgentA", output);
      expect(ctx.keyOutputs).toHaveProperty("data", "keep");
      expect(ctx.keyOutputs).not.toHaveProperty("edits");
    });

    it("includes additional options like provider and model", () => {
      const output = { summary: "S" };
      const opts = { provider: "p1", model: "m1", durationMs: 123 };
      const ctx = buildStepContext(1, "AgentA", output, opts);
      expect(ctx.provider).toBe("p1");
      expect(ctx.model).toBe("m1");
      expect(ctx.durationMs).toBe(123);
    });
  });

  describe("loadPipelineState", () => {
    it("reads from the correct task-specific file path", async () => {
      const mockState = { currentStep: 0, completedSteps: [] };
      vi.mocked(readJsonValidated).mockResolvedValue(mockState);

      const state = await loadPipelineState("task-123");
      expect(taskDir).toHaveBeenCalledWith("task-123");
      expect(readJsonValidated).toHaveBeenCalledWith(
        expect.stringContaining(path.join("task-123", PIPELINE_STATE_FILE)),
        expect.any(Object)
      );
      expect(state).toEqual(mockState);
    });
  });

  describe("savePipelineState", () => {
    it("writes to the correct task-specific file path", async () => {
      const mockState = { currentStep: 1, completedSteps: [] };
      await savePipelineState("task-123", mockState as any);
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining(path.join("task-123", PIPELINE_STATE_FILE)),
        mockState
      );
    });
  });

  describe("advancePipelineState", () => {
    it("updates currentStep and appends completedStep", () => {
      const initialState = {
        currentStep: 0,
        completedSteps: [],
        task: {} as any,
      };
      const stepCtx = { stepIndex: 0, agent: "A", summary: "done" } as any;
      
      const newState = advancePipelineState(initialState as any, 1, stepCtx);
      
      expect(newState.currentStep).toBe(1);
      expect(newState.completedSteps).toHaveLength(1);
      expect(newState.completedSteps[0]).toEqual(stepCtx);
      // Ensure immutability
      expect(newState).not.toBe(initialState);
      expect(newState.completedSteps).not.toBe(initialState.completedSteps);
    });
  });
});
