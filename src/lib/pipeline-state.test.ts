import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advancePipelineState, loadPipelineState, savePipelineState, PIPELINE_STATE_FILE } from "./pipeline-state.js";
import { pipelineStateSchema } from "./schema.js";
import type { PipelineState, PipelineStepResult } from "./types.js";

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
        { stepIndex: 0, agent: "Synx Front Expert", output: { summary: "done" } },
      ],
    };

    await savePipelineState(taskId, state);

    const raw = await fs.readFile(path.join(taskPath, PIPELINE_STATE_FILE), "utf8");
    const loaded = JSON.parse(raw) as unknown;
    expect(loaded).toMatchObject({
      pipelineId: "save-test",
      currentStep: 1,
      completedSteps: [{ stepIndex: 0, agent: "Synx Front Expert" }],
    });
  });

  it("advancePipelineState correctly increments step and appends result", () => {
    const initial: PipelineState = {
      pipelineId: "pipeline-abc",
      currentStep: 0,
      completedSteps: [],
    };
    const stepResult: PipelineStepResult = {
      stepIndex: 0,
      agent: "Synx Back Expert",
      output: { summary: "step 0 done" },
    };

    const advanced = advancePipelineState(initial, 1, stepResult);

    expect(advanced.pipelineId).toBe("pipeline-abc");
    expect(advanced.currentStep).toBe(1);
    expect(advanced.completedSteps).toHaveLength(1);
    expect(advanced.completedSteps[0]).toEqual(stepResult);
    // Ensure original is not mutated
    expect(initial.currentStep).toBe(0);
    expect(initial.completedSteps).toHaveLength(0);
  });

  it("advancePipelineState appends multiple results in order", () => {
    const step0: PipelineStepResult = { stepIndex: 0, agent: "Agent A", output: { x: 1 } };
    const step1: PipelineStepResult = { stepIndex: 1, agent: "Agent B", output: { x: 2 } };

    let state: PipelineState = {
      pipelineId: "multi-step",
      currentStep: 0,
      completedSteps: [],
    };

    state = advancePipelineState(state, 1, step0);
    state = advancePipelineState(state, 2, step1);

    expect(state.currentStep).toBe(2);
    expect(state.completedSteps).toHaveLength(2);
    expect(state.completedSteps[0]).toEqual(step0);
    expect(state.completedSteps[1]).toEqual(step1);
  });

  it("schema validation accepts valid state", () => {
    const valid = {
      pipelineId: "test-pipeline",
      currentStep: 0,
      completedSteps: [],
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
