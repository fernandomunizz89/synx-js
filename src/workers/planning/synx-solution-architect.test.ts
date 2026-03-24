import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynxSolutionArchitect } from "./synx-solution-architect.js";
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
    uxFlowSpec: "ux-flow-spec.json",
    solutionArchitecture: "solution-architecture.json",
    deliveryPlan: "delivery-plan.json",
    acceptanceCriteria: "acceptance-criteria.json",
    milestonePlan: "milestone-plan.json",
    clarificationRequest: "clarification-request.json",
    projectDecomposition: "project-decomposition.json",
  },
  saveTaskArtifact: mocks.saveTaskArtifact,
  loadTaskArtifact: mocks.loadTaskArtifact,
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({ generateStructured: mocks.generateStructured }),
}));

vi.mock("../../lib/config.js", () => ({
  loadResolvedProjectConfig: vi.fn().mockResolvedValue({
    projectName: "test-app", language: "typescript", framework: "node",
    humanReviewer: "User", tasksDir: ".ai-agents/tasks",
    providers: { dispatcher: { type: "mock", model: "static-mock" } },
    agentProviders: {},
  }),
  resolveProviderConfigForAgent: vi.fn((config: any) => config.providers.dispatcher),
}));

const providerResult = {
  provider: "mock", model: "static-mock", parseRetries: 0, validationPassed: true,
  providerAttempts: 1, providerBackoffRetries: 0, providerBackoffWaitMs: 0,
  providerRateLimitWaitMs: 0, estimatedInputTokens: 70, estimatedOutputTokens: 90,
  estimatedTotalTokens: 160, estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-solution-architect-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("workers/planning/synx-solution-architect", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.loadTaskArtifact.mockResolvedValue(null);
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        components: [
          { name: "AuthAPI", responsibility: "Handle sign-in and token issuance", layer: "backend" },
          { name: "LoginPage", responsibility: "Render sign-in form and submit credentials", layer: "frontend" },
        ],
        dataModelOutline: ["User: id, email, passwordHash, createdAt"],
        integrationPoints: ["Email delivery service for password reset"],
        techDecisions: ["Use JWT: stateless, easy to validate at edge"],
        riskFlags: ["Password hashing algorithm must meet current NIST recommendations"],
      },
      ...providerResult,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("saves solution-architecture.json with components and queues delivery planner", async () => {
    const task = await createTask({
      title: "Design auth architecture",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Auth system with JWT and Prisma",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "04-synx-solution-architect.request.json"),
      JSON.stringify({
        taskId: task.taskId, stage: "synx-solution-architect", status: "request",
        createdAt: new Date().toISOString(), agent: "Synx Solution Architect",
        inputRef: "done/03-synx-ux-flow-designer.done.json",
      }),
      "utf8",
    );

    const worker = new SynxSolutionArchitect();
    expect(await worker.tryProcess(task.taskId)).toBe(true);

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "solution-architecture.json",
      expect.objectContaining({
        components: expect.arrayContaining([
          expect.objectContaining({ name: "AuthAPI", layer: "backend" }),
        ]),
      }),
    );

    const done = await readJson<{ output?: { components?: unknown[] } }>(
      path.join(task.taskPath, "done", "04-synx-solution-architect.done.json"),
    );
    expect(done.output?.components).toHaveLength(2);

    const next = await readJson<{ stage?: string; agent?: string }>(
      path.join(task.taskPath, "inbox", "05-synx-delivery-planner.request.json"),
    );
    expect(next.stage).toBe("synx-delivery-planner");
    expect(next.agent).toBe("Synx Delivery Planner");
  });
});
