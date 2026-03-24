import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDecomposer } from "./project-decomposer.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { readJson } from "../lib/fs.js";

const mocks = vi.hoisted(() => ({
  createTaskService: vi.fn<(input: unknown) => Promise<{ taskId: string; taskPath: string }>>(),
  saveTaskArtifact: vi.fn<(taskId: string, fileName: string, payload: unknown) => Promise<void>>(),
  loadTaskArtifact: vi.fn(),
  generateStructured: vi.fn(),
}));

vi.mock("../lib/services/task-services.js", () => ({
  createTaskService: mocks.createTaskService,
}));

vi.mock("../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    projectBrief: "project-brief.json",
    requirementsPrd: "requirements-prd.json",
    acceptanceCriteria: "acceptance-criteria.json",
    milestonePlan: "milestone-plan.json",
    clarificationRequest: "clarification-request.json",
    projectDecomposition: "project-decomposition.json",
    uxFlowSpec: "ux-flow-spec.json",
    solutionArchitecture: "solution-architecture.json",
    deliveryPlan: "delivery-plan.json",
  },
  saveTaskArtifact: mocks.saveTaskArtifact,
  loadTaskArtifact: mocks.loadTaskArtifact,
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: mocks.generateStructured,
  }),
}));

vi.mock("../lib/config.js", () => ({
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

const decompositionResult = {
  parsed: {
    projectSummary: "Launch MVP with authentication and dashboard",
    tasks: [
      {
        taskKey: "build-auth-api",
        title: "Build authentication API",
        typeHint: "Feature",
        rawRequest: "Implement auth endpoints and token validation in src/api/auth",
      },
      {
        taskKey: "create-dashboard-shell",
        title: "Create dashboard shell",
        typeHint: "Feature",
        rawRequest: "Create dashboard layout and summary widgets in src/components/dashboard",
      },
    ],
  },
  provider: "mock",
  model: "static-mock",
  parseRetries: 0,
  validationPassed: true,
  providerAttempts: 1,
  providerBackoffRetries: 0,
  providerBackoffWaitMs: 0,
  providerRateLimitWaitMs: 0,
  estimatedInputTokens: 100,
  estimatedOutputTokens: 80,
  estimatedTotalTokens: 180,
  estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-project-decomposer-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-project-decomposer-test" }, null, 2),
    "utf8",
  );
  return { root, repoRoot };
}

describe.sequential("workers/project-decomposer", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();

    mocks.generateStructured.mockResolvedValue(decompositionResult);
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.loadTaskArtifact.mockResolvedValue(null);

    let createdCount = 0;
    mocks.createTaskService.mockImplementation(async () => {
      createdCount += 1;
      return {
        taskId: `task-child-${createdCount}`,
        taskPath: path.join(fixture.repoRoot, ".ai-agents", "tasks", `task-child-${createdCount}`),
      };
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("loads planning artifacts, creates child tasks with linkage metadata, saves decomposition artifact", async () => {
    const parent = await createTask({
      title: "Build complete MVP",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Build complete MVP",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Write the decompose inbox file (simulating handoff from Delivery Planner)
    await fs.writeFile(
      path.join(parent.taskPath, "inbox", "00-project-orchestrator-decompose.request.json"),
      JSON.stringify({
        taskId: parent.taskId,
        stage: "project-orchestrator-decompose",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Project Orchestrator",
        inputRef: "done/05-synx-delivery-planner.done.json",
      }),
      "utf8",
    );

    // Simulate planning artifacts from the five planning workers
    mocks.loadTaskArtifact.mockImplementation(async (_taskId: string, fileName: string) => {
      if (fileName === "project-brief.json") {
        return { problemStatement: "Need auth", targetUsers: ["Teams"], productGoals: ["Secure login"] };
      }
      if (fileName === "requirements-prd.json") {
        return { acceptanceCriteria: ["Users can sign in.", "Unauthenticated requests return 401."] };
      }
      if (fileName === "milestone-plan.json") {
        return { milestones: [{ milestone: "MVP", objective: "Ship auth", deliverables: ["Auth API"] }] };
      }
      return null;
    });

    const worker = new ProjectDecomposer();
    const processed = await worker.tryProcess(parent.taskId);
    expect(processed).toBe(true);

    expect(mocks.generateStructured).toHaveBeenCalledOnce();

    // Planning artifacts loaded (projectBrief, requirementsPrd, milestonePlan, clarificationRequest)
    expect(mocks.loadTaskArtifact).toHaveBeenCalledWith(parent.taskId, "project-brief.json");
    expect(mocks.loadTaskArtifact).toHaveBeenCalledWith(parent.taskId, "requirements-prd.json");
    expect(mocks.loadTaskArtifact).toHaveBeenCalledWith(parent.taskId, "milestone-plan.json");
    expect(mocks.loadTaskArtifact).toHaveBeenCalledWith(parent.taskId, "clarification-request.json");

    // Two child tasks created
    expect(mocks.createTaskService).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = mocks.createTaskService.mock.calls;
    const firstInput = firstCall[0] as {
      project: string;
      metadata?: { sourceKind?: string; parentTaskId?: string; rootProjectId?: string };
    };
    expect(firstInput.project).toBe("platform");
    expect(firstInput.metadata).toMatchObject({
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
      priority: 3,
      parallelizable: true,
    });

    const secondInput = secondCall[0] as { metadata?: { sourceKind?: string } };
    expect(secondInput.metadata?.sourceKind).toBe("project-subtask");

    // Decomposition artifact saved
    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      parent.taskId,
      "project-decomposition.json",
      expect.objectContaining({
        projectTaskId: parent.taskId,
        rootProjectId: parent.taskId,
        createdTaskIds: ["task-child-1", "task-child-2"],
      }),
    );

    // Done file written (no nextAgent — project stays open)
    const done = await readJson<{ output?: { createdTaskIds?: string[] } }>(
      path.join(parent.taskPath, "done", "00-project-orchestrator-decompose.done.json"),
    );
    expect(done.output?.createdTaskIds).toEqual(["task-child-1", "task-child-2"]);

    // Parent task remains in_progress (waiting for subtasks)
    const parentMeta = await loadTaskMeta(parent.taskId);
    expect(parentMeta.status).toBe("in_progress");
    expect(parentMeta.nextAgent).toBe("");
  });

  it("gracefully handles missing planning artifacts (uses empty fallbacks)", async () => {
    const parent = await createTask({
      title: "Minimal project",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Do something",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(parent.taskPath, "inbox", "00-project-orchestrator-decompose.request.json"),
      JSON.stringify({
        taskId: parent.taskId,
        stage: "project-orchestrator-decompose",
        status: "request",
        createdAt: new Date().toISOString(),
        agent: "Project Orchestrator",
        inputRef: "done/05-synx-delivery-planner.done.json",
      }),
      "utf8",
    );

    // All artifacts return null — decomposer should still proceed
    mocks.loadTaskArtifact.mockResolvedValue(null);

    const worker = new ProjectDecomposer();
    const processed = await worker.tryProcess(parent.taskId);
    expect(processed).toBe(true);
    expect(mocks.generateStructured).toHaveBeenCalledOnce();
    expect(mocks.createTaskService).toHaveBeenCalledTimes(2);
  });
});
