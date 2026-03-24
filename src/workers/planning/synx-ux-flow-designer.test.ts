import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynxUxFlowDesigner } from "./synx-ux-flow-designer.js";
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
  provider: "mock", model: "static-mock", parseRetries: 0, validationPassed: true,
  providerAttempts: 1, providerBackoffRetries: 0, providerBackoffWaitMs: 0,
  providerRateLimitWaitMs: 0, estimatedInputTokens: 60, estimatedOutputTokens: 80,
  estimatedTotalTokens: 140, estimatedCostUsd: 0,
};

const originalCwd = process.cwd();

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ux-flow-designer-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("workers/planning/synx-ux-flow-designer", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
    mocks.saveTaskArtifact.mockResolvedValue(undefined);
    mocks.loadTaskArtifact.mockResolvedValue(null);
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        userJourneys: [{
          name: "Sign-in flow",
          steps: ["Open sign-in page", "Enter credentials", "Submit", "Redirect to dashboard"],
          entryPoint: "LoginPage",
          exitPoint: "DashboardShell",
        }],
        screenList: ["LoginPage", "DashboardShell"],
        interactionNotes: ["Show loading spinner on submit", "Inline field validation"],
        accessibilityFlags: ["All form fields must have aria-label"],
      },
      ...providerResult,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("saves ux-flow-spec.json and queues solution architect", async () => {
    const task = await createTask({
      title: "Build auth UI",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Create login and dashboard pages",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "03-synx-ux-flow-designer.request.json"),
      JSON.stringify({
        taskId: task.taskId, stage: "synx-ux-flow-designer", status: "request",
        createdAt: new Date().toISOString(), agent: "Synx UX Flow Designer",
        inputRef: "done/02-synx-requirements-analyst.done.json",
      }),
      "utf8",
    );

    const worker = new SynxUxFlowDesigner();
    expect(await worker.tryProcess(task.taskId)).toBe(true);

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId,
      "ux-flow-spec.json",
      expect.objectContaining({
        userJourneys: expect.arrayContaining([expect.objectContaining({ name: "Sign-in flow" })]),
        screenList: ["LoginPage", "DashboardShell"],
      }),
    );

    const done = await readJson<{ output?: { screenList?: string[] } }>(
      path.join(task.taskPath, "done", "03-synx-ux-flow-designer.done.json"),
    );
    expect(done.output?.screenList).toHaveLength(2);

    const next = await readJson<{ stage?: string; agent?: string }>(
      path.join(task.taskPath, "inbox", "04-synx-solution-architect.request.json"),
    );
    expect(next.stage).toBe("synx-solution-architect");
    expect(next.agent).toBe("Synx Solution Architect");
  });

  it("accepts empty userJourneys and screenList for backend-only tasks", async () => {
    const task = await createTask({
      title: "Add REST endpoint",
      typeHint: "Project",
      project: "api",
      rawRequest: "Add POST /users endpoint",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.writeFile(
      path.join(task.taskPath, "inbox", "03-synx-ux-flow-designer.request.json"),
      JSON.stringify({
        taskId: task.taskId, stage: "synx-ux-flow-designer", status: "request",
        createdAt: new Date().toISOString(), agent: "Synx UX Flow Designer",
        inputRef: "done/02-synx-requirements-analyst.done.json",
      }),
      "utf8",
    );

    mocks.generateStructured.mockResolvedValue({
      parsed: { userJourneys: [], screenList: [], interactionNotes: [], accessibilityFlags: [] },
      ...providerResult,
    });

    const worker = new SynxUxFlowDesigner();
    expect(await worker.tryProcess(task.taskId)).toBe(true);

    expect(mocks.saveTaskArtifact).toHaveBeenCalledWith(
      task.taskId, "ux-flow-spec.json",
      expect.objectContaining({ userJourneys: [], screenList: [] }),
    );
  });
});
