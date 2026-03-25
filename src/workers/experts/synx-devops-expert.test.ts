import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxDevopsExpert } from "./synx-devops-expert.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../lib/orchestrator.js", () => ({
  requestResearchContext: vi.fn().mockResolvedValue({ status: "skip", context: null, triggerReasons: [], reusedContext: false }),
  formatResearchContextTag: vi.fn().mockReturnValue(""),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        implementationSummary: "Added GitHub Actions CI pipeline",
        filesChanged: [".github/workflows/ci.yml"],
        impactedFiles: [],
        changesMade: ["Created ci.yml workflow"],
        unitTestsAdded: [],
        testsToRun: [],
        technicalRisks: [],
        riskAssessment: {
          buildRisk: "low",
          syntaxRisk: "low",
          importExportRisk: "low",
          typingRisk: "low",
          logicRisk: "low",
          integrationRisk: "low",
          regressionRisk: "low",
        },
        reviewFocus: [],
        manualValidationNeeded: [],
        residualRisks: [],
        verificationMode: "static_review",
        risks: [],
        edits: [
          {
            path: ".github/workflows/ci.yml",
            action: "create",
            content: "name: CI\non: [push]",
          },
        ],
        nextAgent: "Synx Code Reviewer",
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 100,
    }),
  }),
}));

vi.mock("../../lib/config.js", () => ({
  loadResolvedProjectConfig: vi.fn().mockResolvedValue({
    projectName: "test-app",
    language: "typescript",
    framework: "nextjs",
    humanReviewer: "User",
    tasksDir: ".ai-agents/tasks",
    providers: {
      planner: { type: "mock", model: "static-mock" },
      dispatcher: { type: "mock", model: "static-mock" },
    },
    agentProviders: {},
  }),
  loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
  resolveProviderConfigForAgent: vi.fn((cfg: any) => cfg.providers.planner),
}));

vi.mock("../../lib/post-edit-sanity.js", () => ({
  runPostEditSanityChecks: vi.fn().mockResolvedValue({
    checks: [],
    blockingFailureSummaries: [],
    outOfScopeFailureSummaries: [],
    metrics: {
      cheapChecksExecuted: 0,
      heavyChecksExecuted: 0,
      heavyChecksSkipped: 0,
      fullBuildChecksExecuted: 0,
      earlyInScopeFailures: false,
    },
  }),
}));

vi.mock("../../lib/code-quality-bootstrap.js", () => ({
  ensureCodeQualityBootstrap: vi.fn().mockResolvedValue({ notes: [], warnings: [], changedFiles: [] }),
}));

vi.mock("../../lib/workspace-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/workspace-tools.js")>();
  return {
    ...actual,
    detectTestCapabilities: vi.fn().mockResolvedValue({
      hasPackageJson: true,
      hasE2EDir: false,
      hasE2EScript: false,
      hasE2ESpecFiles: false,
      hasUnitTestScript: false,
      hasUnitTestFiles: false,
      e2eScripts: [],
    }),
    getGitChangedFiles: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([".github/workflows/ci.yml"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      changedFiles: [".github/workflows/ci.yml"],
      warnings: [],
      skippedEdits: [],
    }),
  };
});

vi.mock("../../lib/qa-remediation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/qa-remediation.js")>();
  return { ...actual, synthesizeQaSelectorHotfixEdits: vi.fn().mockResolvedValue({ edits: [], notes: [], warnings: [] }) };
});

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-devops-expert", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-devops-expert-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes an infra task and routes to Synx Code Reviewer", async () => {
    const task = await createTask({
      title: "Add CI pipeline",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add a GitHub Actions CI pipeline with lint, test, and build stages",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDevopsExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-devops-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DevOps Expert",
    });

    const expert = new SynxDevopsExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx Code Reviewer");
  });

  it("escalates to human review when the research loop guard triggers", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "abort_to_human",
      context: null,
      abortReason: "Research repeated.",
      triggerReasons: ["repeated_recommendation"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Complex K8s migration",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Migrate from Docker Compose to Kubernetes",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDevopsExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-devops-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DevOps Expert",
    });

    const expert = new SynxDevopsExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("produces builder output (file edits) for infra tasks", async () => {
    const { DONE_FILE_NAMES } = await import("../../lib/constants.js");

    const task = await createTask({
      title: "Add Dockerfile",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Create a production-ready Dockerfile",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDevopsExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-devops-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DevOps Expert",
    });

    const expert = new SynxDevopsExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxDevopsExpert);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    // Verify builder output shape
    expect(output).toHaveProperty("implementationSummary");
    expect(output).toHaveProperty("filesChanged");
    expect(output).toHaveProperty("edits");
    expect(output.nextAgent).toBe("Synx Code Reviewer");
  });

  it("throws error if no code changes are detected", async () => {
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValue([]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({ appliedFiles: [], changedFiles: [], warnings: [], skippedEdits: [] });

    const task = await createTask({
      title: "No change test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Do nothing",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDevopsExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-devops-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DevOps Expert",
    });

    const expert = new SynxDevopsExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(false);
  });
});
