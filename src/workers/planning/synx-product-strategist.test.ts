import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynxProductStrategist } from "./synx-product-strategist.js";
import { createTask } from "../../lib/task.js";
import { readJson } from "../../lib/fs.js";

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  saveTaskArtifact: vi.fn<(taskId: string, fileName: string, payload: unknown) => Promise<void>>(),
}));

vi.mock("../../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    projectBrief: "project-brief.json",
    requirementsPrd: "requirements-prd.json",
    uxFlowSpec: "ux-flow-spec.json",
    solutionArchitecture: "solution-architecture.json",
    deliveryPlan: "delivery-plan.json",
    acceptanceCriteria: "acceptance-criteria.json",
    milestonePlan: "milestone-plan.json",
    clarificationRequest: "clarification-request.json",
    projectDecomposition: "project-decomposition.json",
  },
  saveTaskArtifact: mocks.saveTaskArtifact,
  loadTaskArtifact: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: mocks.generateStructured,
  }),
}));

vi.mock("../../lib/config.js", () => ({
  loadResolvedProjectConfig: vi.fn().mockResolvedValue({
    projectName: "test-app",
    language: "typescript",
    framework: "node",
    humanReviewer: "User",
    tasksDir: ".ai-agents/tasks",
    providers: { dispatcher: { type: "mock", model: "static-mock" } },
    agentProviders: {},
  }),
  resolveProviderConfigForAgent: vi.fn((config: any) => config.providers.dispatcher),
}));

const providerResult = {
  provider: "mock",
  model: "static-mock",
  parseRetries: 0,
  validationPassed: true,
  providerAttempts: 1,
  providerBackoffRetries: 0,
  providerBackoffWaitMs: 0,
  providerRateLimitWaitMs: 0,
  estimatedInputTokens: 50,
  estimatedOutputTokens: 80,
  estimatedTotalTokens: 130,
  estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-product-strategist-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-product-strategist-test" }, null, 2),
    "utf8",
  );
  return { root, repoRoot };
}

describe.sequential("workers/planning/synx-product-strategist", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        problemStatement: "Teams lack a simple auth system.",
        targetUsers: ["Small SaaS teams"],
        productGoals: ["Allow secure sign-in within 2 weeks"],
        inScope: ["Email/password auth", "JWT sessions"],
        outOfScope: ["SSO", "Billing"],
        assumptions: ["Email/password auth is acceptable for MVP"],
        unknowns: ["SSO requirements"],
        confidence: 0.85,
      },
      ...providerResult,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("picks up inbox file, calls LLM, saves product-brief.json, queues requirements analyst", async () => {
    const task = await createTask({
      title: "Build MVP auth",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Add email/password authentication",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate handoff from ProjectOrchestrator by writing the inbox file
    await fs.mkdir(path.join(task.taskPath, "inbox"), { recursive: true });
    await fs.writeFile(
      path.join(task.taskPath, "inbox", "01-synx-product-strategist.request.json"),
      JSON.stringify({
        taskId: task.taskId,
        stage: "synx-product-strategist",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Synx Product Strategist",
        inputRef: "input/new-task.json",
      }),
      "utf8",
    );

    const worker = new SynxProductStrategist();
    const processed = await worker.tryProcess(task.taskId);
    expect(processed).toBe(true);

    expect(mocks.generateStructured).toHaveBeenCalledOnce();

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "project-brief.json",
      expect.objectContaining({
        problemStatement: "Teams lack a simple auth system.",
        targetUsers: ["Small SaaS teams"],
        confidence: 0.85,
      }),
    );

    // Done file written
    const doneFile = path.join(task.taskPath, "done", "01-synx-product-strategist.done.json");
    const done = await readJson<{ output?: { confidence?: number } }>(doneFile);
    expect(done.output?.confidence).toBe(0.85);

    // Next inbox queued for Requirements Analyst
    const nextInbox = path.join(task.taskPath, "inbox", "02-synx-requirements-analyst.request.json");
    const next = await readJson<{ stage?: string; agent?: string }>(nextInbox);
    expect(next.stage).toBe("synx-requirements-analyst");
    expect(next.agent).toBe("Synx Requirements Analyst");
  });

  it("fails gracefully when LLM throws", async () => {
    const task = await createTask({
      title: "Failing task",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Some request",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "01-synx-product-strategist.request.json"),
      JSON.stringify({
        taskId: task.taskId,
        stage: "synx-product-strategist",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Synx Product Strategist",
        inputRef: "input/new-task.json",
      }),
      "utf8",
    );

    mocks.generateStructured.mockRejectedValue(new Error("Provider error"));

    const worker = new SynxProductStrategist();
    const processed = await worker.tryProcess(task.taskId);
    expect(processed).toBe(false);
    expect(mocks.saveTaskArtifact).not.toHaveBeenCalled();
  });
});
