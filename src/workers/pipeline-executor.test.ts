import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { PipelineExecutor, PIPELINE_EXECUTOR_REQUEST_FILE, PIPELINE_EXECUTOR_WORKING_FILE } from "./pipeline-executor.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { writeJson } from "../lib/fs.js";
import { createProvider } from "../providers/factory.js";
import type { PipelineDefinition, PipelineState } from "../lib/types.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../lib/pipeline-state.js", () => ({
  loadPipelineState: vi.fn(),
  savePipelineState: vi.fn().mockResolvedValue(undefined),
  advancePipelineState: vi.fn((state: PipelineState, nextStep: number, stepContext: unknown) => ({
    ...state,
    currentStep: nextStep,
    completedSteps: [...state.completedSteps, stepContext],
  })),
  buildStepContext: vi.fn((stepIndex: number, agent: string, output: Record<string, unknown>, opts?: Record<string, unknown>) => ({
    stepIndex,
    agent,
    summary: typeof output.summary === "string" ? output.summary : "",
    keyOutputs: output,
    ...opts,
  })),
  PIPELINE_STATE_FILE: "input/pipeline-state.json",
}));

vi.mock("../lib/pipeline-registry.js", () => ({
  loadPipelineDefinition: vi.fn(),
}));

vi.mock("../lib/pipeline-provider.js", () => ({
  resolveStepProvider: vi.fn().mockResolvedValue({ type: "mock", model: "static-mock" }),
  resolveStepProviderChain: vi.fn().mockResolvedValue([{ type: "mock", model: "static-mock" }]),
}));

vi.mock("../lib/pipeline-prompt.js", () => ({
  resolveStepPrompt: vi.fn().mockResolvedValue("Mock pipeline prompt"),
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        summary: "Step completed successfully",
        result: { key: "value" },
        nextAgent: undefined,
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      estimatedInputTokens: 50,
      estimatedOutputTokens: 30,
      estimatedTotalTokens: 80,
      estimatedCostUsd: 0,
    }),
  }),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

function makeSequentialPipeline(stepCount: number): PipelineDefinition {
  return {
    id: "test-pipeline",
    name: "Test Pipeline",
    routing: "sequential",
    steps: Array.from({ length: stepCount }, (_, i) => ({
      agent: `Agent ${i}`,
    })),
  };
}

function makeConditionalPipeline(steps: PipelineDefinition["steps"]): PipelineDefinition {
  return {
    id: "cond-pipeline",
    name: "Conditional Pipeline",
    routing: "conditional",
    steps,
  };
}

function mockOutput(output: Record<string, unknown>) {
  vi.mocked(createProvider).mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: { summary: "done", ...output },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      estimatedInputTokens: 10,
      estimatedOutputTokens: 10,
      estimatedTotalTokens: 20,
      estimatedCostUsd: 0,
    }),
  } as any);
}

async function runConditionalPipeline(
  pipeline: PipelineDefinition,
  output: Record<string, unknown>,
): Promise<{ processed: boolean; nextStepArg: number }> {
  const { loadPipelineState, advancePipelineState } = await import("../lib/pipeline-state.js");
  const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");

  // Clear accumulated mock call history from previous tests
  vi.mocked(advancePipelineState).mockClear();

  vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
  vi.mocked(loadPipelineState).mockResolvedValue({
    pipelineId: pipeline.id,
    currentStep: 0,
    completedSteps: [],
  });
  mockOutput(output);

  const task = await createTask({
    title: "Conditional routing test",
    typeHint: "Feature",
    project: "test",
    rawRequest: "test",
    extraContext: { relatedFiles: [], logs: [], notes: [] },
  });

  await writeJson(path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE), {
    taskId: task.taskId,
    stage: "pipeline-executor",
    status: "request",
    createdAt: new Date().toISOString(),
    agent: "Pipeline Executor",
    inputRef: "input/pipeline-state.json",
  });

  const executor = new PipelineExecutor();
  const processed = await executor.tryProcess(task.taskId);
  const calls = vi.mocked(advancePipelineState).mock.calls;
  const lastCall = calls[calls.length - 1];
  return { processed, nextStepArg: lastCall ? (lastCall[1] as number) : -1 };
}

describe.sequential("workers/pipeline-executor", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-pipeline-executor-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "synx-pipeline-executor-test" }, null, 2),
      "utf8",
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("requestFileName and workingFileName are correct constants", () => {
    const executor = new PipelineExecutor();
    expect(executor.requestFileName).toBe(PIPELINE_EXECUTOR_REQUEST_FILE);
    expect(executor.workingFileName).toBe(PIPELINE_EXECUTOR_WORKING_FILE);
    expect(PIPELINE_EXECUTOR_REQUEST_FILE).toBe("pipeline-executor.request.json");
    expect(PIPELINE_EXECUTOR_WORKING_FILE).toBe("pipeline-executor.working.json");
  });

  it("tryProcess returns false when no inbox file", async () => {
    const task = await createTask({
      title: "Test pipeline",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Run pipeline",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(false);
  });

  it("tryProcess processes step 0, saves step output, updates pipeline state, queues next executor call", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");

    const pipeline = makeSequentialPipeline(3);
    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "test-pipeline",
      currentStep: 0,
      completedSteps: [],
    });

    const task = await createTask({
      title: "Pipeline test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Run pipeline",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    // Verify step done file was created
    const stepDoneFile = path.join(task.taskPath, "done", "pipeline-step-0.done.json");
    const stepDone = JSON.parse(await fs.readFile(stepDoneFile, "utf8")) as Record<string, unknown>;
    expect(stepDone).toMatchObject({
      taskId: task.taskId,
      stage: "pipeline-step-0",
      status: "done",
      agent: "Agent 0",
    });

    // Verify pipeline state was saved
    const { savePipelineState } = await import("../lib/pipeline-state.js");
    expect(vi.mocked(savePipelineState)).toHaveBeenCalledOnce();

    // Verify next executor call was queued
    const nextInbox = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    const nextRequest = JSON.parse(await fs.readFile(nextInbox, "utf8")) as Record<string, unknown>;
    expect(nextRequest).toMatchObject({
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      agent: "Pipeline Executor",
    });

    // Meta should be waiting_agent since more steps remain
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Pipeline Executor");
  });

  it("tryProcess on final step calls finishStage with humanApprovalRequired: true", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");

    const pipeline = makeSequentialPipeline(2);
    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "test-pipeline",
      currentStep: 1, // last step (index 1 of 2)
      completedSteps: [
        { stepIndex: 0, agent: "Agent 0", summary: "step 0 done", keyOutputs: { summary: "step 0 done" } },
      ],
    });

    const task = await createTask({
      title: "Final step test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Run final step",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.status).toBe("waiting_human");
    // No next executor inbox since it's the final step
    const nextInbox = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await expect(fs.access(nextInbox)).rejects.toThrow();
  });

  it("tryProcess with dynamic routing uses output.nextAgent to resolve next step", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");
    const { createProvider } = await import("../providers/factory.js");

    const pipeline: PipelineDefinition = {
      id: "dynamic-pipeline",
      name: "Dynamic Pipeline",
      routing: "dynamic",
      steps: [
        { agent: "Step A" },
        { agent: "Step B" },
        { agent: "Step C" },
      ],
    };

    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "dynamic-pipeline",
      currentStep: 0,
      completedSteps: [],
    });

    // Step A output says go to Step C (index 2)
    vi.mocked(createProvider).mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          summary: "Step A done, routing to Step C",
          result: {},
          nextAgent: "Step C",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        validationPassed: true,
        providerAttempts: 1,
        providerBackoffRetries: 0,
        providerBackoffWaitMs: 0,
        estimatedInputTokens: 50,
        estimatedOutputTokens: 30,
        estimatedTotalTokens: 80,
        estimatedCostUsd: 0,
      }),
    } as any);

    const task = await createTask({
      title: "Dynamic routing test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Dynamic pipeline",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const { advancePipelineState } = await import("../lib/pipeline-state.js");
    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    // advancePipelineState should have been called with nextStep=2 (Step C index)
    expect(vi.mocked(advancePipelineState)).toHaveBeenCalledWith(
      expect.any(Object),
      2, // index of "Step C"
      expect.any(Object),
    );
  });

  it("tryProcess with sequential routing always goes to currentIndex + 1", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");
    const { createProvider } = await import("../providers/factory.js");

    const pipeline = makeSequentialPipeline(5);
    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "test-pipeline",
      currentStep: 2,
      completedSteps: [],
    });

    // Even if nextAgent is set, sequential routing ignores it
    vi.mocked(createProvider).mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          summary: "Step 2 done",
          result: {},
          nextAgent: "Agent 0", // Would be index 0 in dynamic routing
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        validationPassed: true,
        providerAttempts: 1,
        providerBackoffRetries: 0,
        providerBackoffWaitMs: 0,
        estimatedInputTokens: 50,
        estimatedOutputTokens: 30,
        estimatedTotalTokens: 80,
        estimatedCostUsd: 0,
      }),
    } as any);

    const task = await createTask({
      title: "Sequential routing test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Sequential pipeline",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const { advancePipelineState } = await import("../lib/pipeline-state.js");
    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    // Sequential routing: currentIndex (2) + 1 = 3
    expect(vi.mocked(advancePipelineState)).toHaveBeenCalledWith(
      expect.any(Object),
      3,
      expect.any(Object),
    );
  });

  it("tryProcess handles pipeline already complete (currentStep >= steps.length)", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");

    const pipeline = makeSequentialPipeline(2);
    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "test-pipeline",
      currentStep: 2, // beyond last step index (max is 1)
      completedSteps: [
        { stepIndex: 0, agent: "Agent 0", summary: "done", keyOutputs: { summary: "done" } },
        { stepIndex: 1, agent: "Agent 1", summary: "done", keyOutputs: { summary: "done" } },
      ],
    });

    const task = await createTask({
      title: "Already complete test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Complete pipeline",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.status).toBe("waiting_human");

    // Done file for completed pipeline should exist
    const donePath = path.join(task.taskPath, "done", "pipeline-executor.done.json");
    const done = JSON.parse(await fs.readFile(donePath, "utf8")) as Record<string, unknown>;
    expect(done).toMatchObject({
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "done",
      agent: "Pipeline Executor",
    });
  });

  it("uses fallback provider when primary provider fails", async () => {
    const { loadPipelineState } = await import("../lib/pipeline-state.js");
    const { loadPipelineDefinition } = await import("../lib/pipeline-registry.js");
    const { resolveStepProviderChain } = await import("../lib/pipeline-provider.js");
    const { createProvider } = await import("../providers/factory.js");

    const pipeline = makeSequentialPipeline(2);
    vi.mocked(loadPipelineDefinition).mockResolvedValue(pipeline);
    vi.mocked(loadPipelineState).mockResolvedValue({
      pipelineId: "test-pipeline",
      currentStep: 0,
      completedSteps: [],
    });

    // Primary fails, fallback succeeds
    vi.mocked(resolveStepProviderChain).mockResolvedValue([
      { type: "anthropic", model: "claude-opus-4-6" },
      { type: "mock", model: "fallback-mock" },
    ]);

    const successResult = {
      parsed: { summary: "Fallback succeeded", result: {}, nextAgent: undefined },
      provider: "mock",
      model: "fallback-mock",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      estimatedInputTokens: 10,
      estimatedOutputTokens: 10,
      estimatedTotalTokens: 20,
      estimatedCostUsd: 0,
    };

    vi.mocked(createProvider)
      .mockReturnValueOnce({ generateStructured: vi.fn().mockRejectedValue(new Error("Provider unavailable")) })
      .mockReturnValueOnce({ generateStructured: vi.fn().mockResolvedValue(successResult) });

    const task = await createTask({
      title: "Fallback test",
      typeHint: "Feature",
      project: "test",
      rawRequest: "Test fallback",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await writeJson(path.join(task.taskPath, "inbox", PIPELINE_EXECUTOR_REQUEST_FILE), {
      taskId: task.taskId,
      stage: "pipeline-executor",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Pipeline Executor",
      inputRef: "input/pipeline-state.json",
    });

    const executor = new PipelineExecutor();
    const processed = await executor.tryProcess(task.taskId);
    expect(processed).toBe(true);
    // primary provider + fallback provider both instantiated
    const calls = vi.mocked(createProvider).mock.calls;
    const primaryCall = calls.find((c) => (c[0] as { model?: string }).model === "claude-opus-4-6");
    const fallbackCall = calls.find((c) => (c[0] as { model?: string }).model === "fallback-mock");
    expect(primaryCall).toBeDefined();
    expect(fallbackCall).toBeDefined();
  });

  // ─── Conditional routing ────────────────────────────────────────────────────

  // NOTE: genericAgentOutputSchema (Zod) strips unknown top-level keys during parse().
  // Custom data from agents must live inside the `result` object.
  // Conditions therefore reference `output.result.*` (or `output.summary`, `output.nextAgent`).

  it("conditional routing — goes to first step whose condition is true", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage" },
      { agent: "Bug Fixer", condition: "output.result && output.result.type === 'bug'" },
      { agent: "Feature Builder", condition: "output.result && output.result.type === 'feature'" },
      { agent: "Synx QA Engineer" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { type: "bug" } });
    expect(nextStepArg).toBe(1); // Bug Fixer is at index 1
  });

  it("conditional routing — skips false conditions, picks correct branch", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage" },
      { agent: "Bug Fixer", condition: "output.result && output.result.type === 'bug'" },
      { agent: "Feature Builder", condition: "output.result && output.result.type === 'feature'" },
      { agent: "Synx QA Engineer" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { type: "feature" } });
    expect(nextStepArg).toBe(2); // Feature Builder is at index 2
  });

  it("conditional routing — falls back to defaultNextStep when no condition matches", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage", defaultNextStep: 3 },
      { agent: "Bug Fixer", condition: "output.result && output.result.type === 'bug'" },
      { agent: "Feature Builder", condition: "output.result && output.result.type === 'feature'" },
      { agent: "Synx QA Engineer" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { type: "research" } });
    expect(nextStepArg).toBe(3); // defaultNextStep → QA
  });

  it("conditional routing — first matching condition wins (not later one)", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage" },
      { agent: "Step B", condition: "output.result && output.result.score > 50" },
      { agent: "Step C", condition: "output.result && output.result.score > 10" }, // also true, but B wins
      { agent: "Step D", condition: "output.result && output.result.score > 5" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { score: 60 } });
    expect(nextStepArg).toBe(1); // Step B matched first
  });

  it("conditional routing — stops scan at unconditional step, uses defaultNextStep", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage", defaultNextStep: 3 },
      { agent: "Bug Fixer", condition: "output.result && output.result.type === 'bug'" },
      { agent: "Guard" }, // no condition — terminates scan
      { agent: "Synx QA Engineer" },
    ]);

    // type=feature → Bug Fixer condition false → Guard has no condition → scan stops
    // No match + defaultNextStep=3 → QA
    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { type: "feature" } });
    expect(nextStepArg).toBe(3);
  });

  it("conditional routing — no match and no defaultNextStep falls through to N+1", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage" }, // no defaultNextStep
      { agent: "Bug Fixer", condition: "output.result && output.result.type === 'bug'" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, { result: { type: "feature" } });
    expect(nextStepArg).toBe(1); // sequential fallthrough: 0+1=1
  });

  it("conditional routing — throwing condition expression is treated as false, scan continues", async () => {
    const pipeline = makeConditionalPipeline([
      { agent: "Triage", defaultNextStep: 2 },
      { agent: "Step B", condition: "output.deeply.missing.chain === 'x'" }, // will throw
      { agent: "Synx QA Engineer" },
    ]);

    const { nextStepArg } = await runConditionalPipeline(pipeline, {});
    expect(nextStepArg).toBe(2); // throwing condition → false → defaultNextStep=2
  });
});
