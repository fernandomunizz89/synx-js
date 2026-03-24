import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynxDeliveryPlanner } from "./synx-delivery-planner.js";
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
  providerRateLimitWaitMs: 0, estimatedInputTokens: 80, estimatedOutputTokens: 100,
  estimatedTotalTokens: 180, estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-delivery-planner-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("workers/planning/synx-delivery-planner", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.loadTaskArtifact.mockResolvedValue(null);
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        milestones: [
          {
            milestone: "MVP",
            objective: "Ship auth and dashboard",
            deliverables: ["Auth API", "Dashboard shell"],
            priority: 5,
          },
        ],
        parallelismConstraints: ["Auth API must be complete before dashboard can be wired"],
        clarification: { required: false, questions: [] },
      },
      ...providerResult,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("saves delivery-plan.json and milestone-plan.json, queues project decomposer", async () => {
    const task = await createTask({
      title: "Plan delivery",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Auth and dashboard MVP",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "05-synx-delivery-planner.request.json"),
      JSON.stringify({
        taskId: task.taskId, stage: "synx-delivery-planner", status: "request",
        createdAt: new Date().toISOString(), agent: "Synx Delivery Planner",
        inputRef: "done/04-synx-solution-architect.done.json",
      }),
      "utf8",
    );

    const worker = new SynxDeliveryPlanner();
    expect(await worker.tryProcess(task.taskId)).toBe(true);

    // Both delivery-plan.json and milestone-plan.json saved
    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "delivery-plan.json",
      expect.objectContaining({
        milestones: expect.arrayContaining([expect.objectContaining({ milestone: "MVP" })]),
      }),
    );
    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "milestone-plan.json",
      expect.objectContaining({
        milestones: expect.arrayContaining([
          expect.objectContaining({ milestone: "MVP", deliverables: ["Auth API", "Dashboard shell"] }),
        ]),
      }),
    );

    // No clarification-request.json when not required
    const clarificationCalls = mocks.saveTaskArtifact.mock.calls.filter(
      ([, file]) => file === "clarification-request.json",
    );
    expect(clarificationCalls).toHaveLength(0);

    // Queued for project decomposer
    const next = await readJson<{ stage?: string; agent?: string }>(
      path.join(task.taskPath, "inbox", "00-project-orchestrator-decompose.request.json"),
    );
    expect(next.stage).toBe("project-orchestrator-decompose");
    expect(next.agent).toBe("Project Orchestrator");
  });

  it("saves clarification-request.json when clarification is required", async () => {
    const task = await createTask({
      title: "Ambiguous project",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Build something",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "05-synx-delivery-planner.request.json"),
      JSON.stringify({
        taskId: task.taskId, stage: "synx-delivery-planner", status: "request",
        createdAt: new Date().toISOString(), agent: "Synx Delivery Planner",
        inputRef: "done/04-synx-solution-architect.done.json",
      }),
      "utf8",
    );

    mocks.generateStructured.mockResolvedValue({
      parsed: {
        milestones: [{ milestone: "MVP", objective: "TBD", deliverables: ["TBD"], priority: 3 }],
        parallelismConstraints: [],
        clarification: {
          required: true,
          rationale: "The target platform is ambiguous",
          questions: ["Is this a web app, mobile app, or both?"],
        },
      },
      ...providerResult,
    });

    const worker = new SynxDeliveryPlanner();
    expect(await worker.tryProcess(task.taskId)).toBe(true);

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "clarification-request.json",
      expect.objectContaining({ required: true, questions: ["Is this a web app, mobile app, or both?"] }),
    );
  });
});
