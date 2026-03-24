import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectOrchestrator } from "./project-orchestrator.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { readJson } from "../lib/fs.js";

const mocks = vi.hoisted(() => ({
  createTaskService: vi.fn<(input: unknown) => Promise<{ taskId: string; taskPath: string }>>(),
  saveTaskArtifact: vi.fn<(taskId: string, fileName: string, payload: unknown) => Promise<void>>(),
}));

vi.mock("../lib/services/task-services.js", () => ({
  createTaskService: mocks.createTaskService,
}));

vi.mock("../lib/task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    projectProfile: "project-profile.json",
    projectDecomposition: "project-decomposition.json",
  },
  saveTaskArtifact: mocks.saveTaskArtifact,
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        projectSummary: "Launch MVP with authentication and dashboard",
        tasks: [
          {
            title: "Build authentication API",
            typeHint: "Feature",
            rawRequest: "Implement auth endpoints and token validation",
          },
          {
            title: "Create dashboard shell",
            typeHint: "Feature",
            rawRequest: "Create dashboard layout and summary widgets",
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
    }),
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

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-project-orchestrator-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-project-orchestrator-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("workers/project-orchestrator", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();

    let createdCount = 0;
    mocks.createTaskService.mockImplementation(async () => {
      createdCount += 1;
      return {
        taskId: `task-child-${createdCount}`,
        taskPath: path.join(fixture.repoRoot, ".ai-agents", "tasks", `task-child-${createdCount}`),
      };
    });
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("creates child tasks with project linkage metadata and persists decomposition artifact", async () => {
    const parent = await createTask({
      title: "Build complete MVP",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Build complete MVP",
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
      },
    });

    const worker = new ProjectOrchestrator();
    const processed = await worker.tryProcess(parent.taskId);
    expect(processed).toBe(true);

    expect(mocks.createTaskService).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mocks.createTaskService.mock.calls;
    const firstInput = firstCall[0] as {
      project: string;
      metadata?: { sourceKind?: string; parentTaskId?: string; rootProjectId?: string };
    };
    const secondInput = secondCall[0] as {
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
    expect(secondInput.metadata).toMatchObject({
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
      priority: 3,
      parallelizable: true,
    });

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      parent.taskId,
      "project-decomposition.json",
      expect.objectContaining({
        projectTaskId: parent.taskId,
        rootProjectId: parent.taskId,
        createdTaskIds: ["task-child-1", "task-child-2"],
      }),
    );

    const parentMeta = await loadTaskMeta(parent.taskId);
    expect(parentMeta.status).toBe("in_progress");
    expect(parentMeta.sourceKind).toBe("project-intake");
    expect(parentMeta.rootProjectId).toBe(parent.taskId);

    const done = await readJson<{ output?: { createdTaskIds?: string[] } }>(
      path.join(parent.taskPath, "done", "00-project-orchestrator.done.json"),
    );
    expect(done.output?.createdTaskIds).toEqual(["task-child-1", "task-child-2"]);
  });
});
