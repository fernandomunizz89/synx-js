import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advancePipelineState, buildStepContext, loadPipelineState, savePipelineState, PIPELINE_STATE_FILE } from "./pipeline-state.js";
import { pipelineStateSchema } from "./schema.js";
import type { PipelineState, PipelineStepContext } from "./types.js";

const originalCwd = process.cwd();

describe.sequential("pipeline-state", () => {
  let root: string;
  let repoRoot: string;
  let taskId: string;
  let taskPath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-pipeline-state-test-"));
    repoRoot = path.join(root, "repo");
    taskId = "task-2026-03-21-abcd-pipeline-test";
    taskPath = path.join(repoRoot, ".ai-agents", "tasks", taskId);
    await fs.mkdir(path.join(taskPath, "input"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "synx-pipeline-state-test" }, null, 2),
      "utf8",
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("loadPipelineState returns validated state from file", async () => {
    const state: PipelineState = {
      pipelineId: "my-pipeline",
      currentStep: 0,
      completedSteps: [],
    };
    await fs.writeFile(
      path.join(taskPath, PIPELINE_STATE_FILE),
      JSON.stringify(state),
      "utf8",
    );

    const loaded = await loadPipelineState(taskId);
    expect(loaded).toEqual(state);
  });

  it("loadPipelineState throws on missing file", async () => {
    await expect(loadPipelineState(taskId)).rejects.toThrow();
  });

  it("savePipelineState writes state to file", async () => {
    const state: PipelineState = {
      pipelineId: "save-test",
      currentStep: 1,
      completedSteps: [
        { stepIndex: 0, agent: "Synx Front Expert", summary: "done", keyOutputs: { summary: "done" } },
      ],
    };

    await savePipelineState(taskId, state);

    const raw = await fs.readFile(path.join(taskPath, PIPELINE_STATE_FILE), "utf8");
    const loaded = JSON.parse(raw) as unknown;
    expect(loaded).toMatchObject({
      pipelineId: "save-test",
      currentStep: 1,
      completedSteps: [{ stepIndex: 0, agent: "Synx Front Expert", summary: "done" }],
    });
  });

  it("advancePipelineState correctly increments step and appends context", () => {
    const initial: PipelineState = {
      pipelineId: "pipeline-abc",
      currentStep: 0,
      completedSteps: [],
    };
    const stepContext: PipelineStepContext = {
      stepIndex: 0,
      agent: "Synx Back Expert",
      summary: "step 0 done",
      keyOutputs: { summary: "step 0 done" },
    };

    const advanced = advancePipelineState(initial, 1, stepContext);

    expect(advanced.pipelineId).toBe("pipeline-abc");
    expect(advanced.currentStep).toBe(1);
    expect(advanced.completedSteps).toHaveLength(1);
    expect(advanced.completedSteps[0]).toEqual(stepContext);
    // Ensure original is not mutated
    expect(initial.currentStep).toBe(0);
    expect(initial.completedSteps).toHaveLength(0);
  });

  it("advancePipelineState appends multiple contexts in order", () => {
    const ctx0: PipelineStepContext = { stepIndex: 0, agent: "Agent A", summary: "a done", keyOutputs: { x: 1 } };
    const ctx1: PipelineStepContext = { stepIndex: 1, agent: "Agent B", summary: "b done", keyOutputs: { x: 2 } };

    let state: PipelineState = {
      pipelineId: "multi-step",
      currentStep: 0,
      completedSteps: [],
    };

    state = advancePipelineState(state, 1, ctx0);
    state = advancePipelineState(state, 2, ctx1);

    expect(state.currentStep).toBe(2);
    expect(state.completedSteps).toHaveLength(2);
    expect(state.completedSteps[0]).toEqual(ctx0);
    expect(state.completedSteps[1]).toEqual(ctx1);
  });

  // ─── buildStepContext ─────────────────────────────────────────────────────

  describe("buildStepContext", () => {
    it("extracts summary from generic output.summary", () => {
      const ctx = buildStepContext(0, "My Agent", { summary: "Analysis complete", result: { count: 5 } });
      expect(ctx.summary).toBe("Analysis complete");
      expect(ctx.agent).toBe("My Agent");
      expect(ctx.stepIndex).toBe(0);
    });

    it("extracts summary from builder output.implementationSummary", () => {
      const ctx = buildStepContext(1, "Builder", {
        implementationSummary: "Added REST endpoint",
        filesChanged: ["src/api.ts"],
        edits: [{ path: "src/api.ts", action: "create", content: "..." }],
      });
      expect(ctx.summary).toBe("Added REST endpoint");
    });

    it("falls back to JSON snippet when no summary field exists", () => {
      const ctx = buildStepContext(0, "Unknown", { customField: "some value" });
      expect(ctx.summary).toContain("customField");
    });

    it("strips edits from keyOutputs to prevent token bloat", () => {
      const output = {
        implementationSummary: "Built feature",
        filesChanged: ["src/foo.ts"],
        edits: Array.from({ length: 50 }, (_, i) => ({ path: `file${i}.ts`, action: "create", content: "x".repeat(500) })),
      };
      const ctx = buildStepContext(0, "Builder", output);
      expect(ctx.keyOutputs).not.toHaveProperty("edits");
      expect(ctx.keyOutputs).toHaveProperty("filesChanged");
      expect(ctx.keyOutputs).toHaveProperty("implementationSummary");
    });

    it("preserves all non-verbose fields in keyOutputs", () => {
      const output = { summary: "done", result: { items: [1, 2, 3] }, nextAgent: "QA" };
      const ctx = buildStepContext(0, "Agent", output);
      expect(ctx.keyOutputs).toEqual(output);
    });

    it("includes optional opts fields when provided", () => {
      const ctx = buildStepContext(2, "Agent", { summary: "ok" }, {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        durationMs: 3500,
      });
      expect(ctx.provider).toBe("anthropic");
      expect(ctx.model).toBe("claude-sonnet-4-6");
      expect(ctx.durationMs).toBe(3500);
    });

    it("omits optional fields when opts not provided", () => {
      const ctx = buildStepContext(0, "Agent", { summary: "ok" });
      expect(ctx.provider).toBeUndefined();
      expect(ctx.model).toBeUndefined();
      expect(ctx.durationMs).toBeUndefined();
    });
  });

  it("schema validation accepts valid state with empty completedSteps", () => {
    const valid = {
      pipelineId: "test-pipeline",
      currentStep: 0,
      completedSteps: [],
    };
    expect(() => pipelineStateSchema.parse(valid)).not.toThrow();
  });

  it("schema validation accepts valid state with PipelineStepContext entries", () => {
    const valid = {
      pipelineId: "test-pipeline",
      currentStep: 1,
      completedSteps: [
        { stepIndex: 0, agent: "My Agent", summary: "done", keyOutputs: { result: "ok" } },
      ],
    };
    expect(() => pipelineStateSchema.parse(valid)).not.toThrow();
  });

  it("schema validation rejects missing pipelineId", () => {
    const invalid = {
      currentStep: 0,
      completedSteps: [],
    };
    expect(() => pipelineStateSchema.parse(invalid)).toThrow();
  });

  it("schema validation rejects empty pipelineId", () => {
    const invalid = {
      pipelineId: "",
      currentStep: 0,
      completedSteps: [],
    };
    expect(() => pipelineStateSchema.parse(invalid)).toThrow();
  });
});
