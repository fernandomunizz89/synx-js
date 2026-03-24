import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynxRequirementsAnalyst } from "./synx-requirements-analyst.js";
import { createTask } from "../../lib/task.js";
import { readJson } from "../../lib/fs.js";

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  saveTaskArtifact: vi.fn<(taskId: string, fileName: string, payload: unknown) => Promise<void>>(),
  loadTaskArtifact: vi.fn(),
}));

vi.mock("../../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    projectBrief: "project-brief.json",
    requirementsPrd: "requirements-prd.json",
    acceptanceCriteria: "acceptance-criteria.json",
    uxFlowSpec: "ux-flow-spec.json",
    solutionArchitecture: "solution-architecture.json",
    deliveryPlan: "delivery-plan.json",
    milestonePlan: "milestone-plan.json",
    clarificationRequest: "clarification-request.json",
    projectDecomposition: "project-decomposition.json",
  },
  saveTaskArtifact: mocks.saveTaskArtifact,
  loadTaskArtifact: mocks.loadTaskArtifact,
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
  estimatedInputTokens: 60,
  estimatedOutputTokens: 100,
  estimatedTotalTokens: 160,
  estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-requirements-analyst-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-requirements-analyst-test" }, null, 2),
    "utf8",
  );
  return { root, repoRoot };
}

describe.sequential("workers/planning/synx-requirements-analyst", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.loadTaskArtifact.mockResolvedValue(null);
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        functionalRequirements: ["Users can sign in with email and password"],
        nonFunctionalRequirements: ["Auth endpoints respond within 200ms"],
        acceptanceCriteria: [
          "Users can sign in and receive a JWT.",
          "Unauthenticated requests return 401.",
        ],
        edgeCases: ["Expired tokens return 401, not 500"],
        dataEntities: ["User: id, email, passwordHash, createdAt"],
        openQuestions: [],
      },
      ...providerResult,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("writes requirements-prd.json and acceptance-criteria.json, queues ux-flow-designer", async () => {
    const task = await createTask({
      title: "Build MVP auth",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Add email/password authentication",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "02-synx-requirements-analyst.request.json"),
      JSON.stringify({
        taskId: task.taskId,
        stage: "synx-requirements-analyst",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Synx Requirements Analyst",
        inputRef: "done/01-synx-product-strategist.done.json",
      }),
      "utf8",
    );

    const worker = new SynxRequirementsAnalyst();
    const processed = await worker.tryProcess(task.taskId);
    expect(processed).toBe(true);

    expect(mocks.generateStructured).toHaveBeenCalledOnce();

    // Both artifacts saved
    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "requirements-prd.json",
      expect.objectContaining({
        functionalRequirements: ["Users can sign in with email and password"],
        acceptanceCriteria: expect.arrayContaining(["Users can sign in and receive a JWT."]),
      }),
    );
    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "acceptance-criteria.json",
      expect.objectContaining({
        acceptanceCriteria: expect.arrayContaining(["Users can sign in and receive a JWT."]),
      }),
    );

    // Done file written
    const doneFile = path.join(task.taskPath, "done", "02-synx-requirements-analyst.done.json");
    const done = await readJson<{ output?: { functionalRequirements?: string[] } }>(doneFile);
    expect(done.output?.functionalRequirements).toHaveLength(1);

    // Next inbox queued for UX Flow Designer
    const next = await readJson<{ stage?: string; agent?: string }>(
      path.join(task.taskPath, "inbox", "03-synx-ux-flow-designer.request.json"),
    );
    expect(next.stage).toBe("synx-ux-flow-designer");
    expect(next.agent).toBe("Synx UX Flow Designer");
  });

  it("loads product-brief.json artifact if present (graceful when missing)", async () => {
    const task = await createTask({
      title: "Some project",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Some request",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "02-synx-requirements-analyst.request.json"),
      JSON.stringify({
        taskId: task.taskId,
        stage: "synx-requirements-analyst",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Synx Requirements Analyst",
        inputRef: "done/01-synx-product-strategist.done.json",
      }),
      "utf8",
    );

    // loadTaskArtifact returns null (no product brief) — should not throw
    mocks.loadTaskArtifact.mockResolvedValue(null);

    const worker = new SynxRequirementsAnalyst();
    const processed = await worker.tryProcess(task.taskId);
    expect(processed).toBe(true);
    expect(mocks.generateStructured).toHaveBeenCalledOnce();
  });
});
