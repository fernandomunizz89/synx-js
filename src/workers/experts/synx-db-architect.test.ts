import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxDbArchitect } from "./synx-db-architect.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
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
        implementationSummary: "Added Prisma migration for users table with index on email",
        filesChanged: ["prisma/migrations/20240101_add_users.sql"],
        impactedFiles: [],
        changesMade: ["Created users migration", "Added email index"],
        unitTestsAdded: [],
        testsToRun: ["npx prisma migrate dev --preview-feature"],
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
            path: "prisma/migrations/20240101_add_users.sql",
            action: "create",
            content: "CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE);",
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
      .mockResolvedValue(["prisma/migrations/20240101_add_users.sql"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      changedFiles: ["prisma/migrations/20240101_add_users.sql"],
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

describe.sequential("workers/experts/synx-db-architect", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-db-architect-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("routes to Code Reviewer after successful DB migration", async () => {
    const task = await createTask({
      title: "Add users table with email index",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Create users table in Prisma with a unique email index",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDbArchitect);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-db-architect",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DB Architect",
    });

    const expert = new SynxDbArchitect();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx Code Reviewer");
  });

  it("research loop abort escalates to human review", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "abort_to_human",
      context: null,
      abortReason: "Research loop detected: same migration strategy attempted twice.",
      triggerReasons: ["repeated_recommendation"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Complex DB sharding migration",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Migrate PostgreSQL to a sharded architecture",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDbArchitect);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-db-architect",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DB Architect",
    });

    const expert = new SynxDbArchitect();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("throws when no files changed after applying edits", async () => {
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValue([]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({ appliedFiles: [], changedFiles: [], warnings: [], skippedEdits: [] });

    const task = await createTask({
      title: "No-op migration test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Do nothing to the DB",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDbArchitect);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-db-architect",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DB Architect",
    });

    const expert = new SynxDbArchitect();
    const processed = await expert.tryProcess(task.taskId);
    // When throw happens, tryProcess catches and returns false
    expect(processed).toBe(false);
  });

  it("output includes correct implementation summary and changed files", async () => {
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    vi.mocked(getGitChangedFiles).mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue(["prisma/migrations/20240101_add_orders.sql"]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({
      changedFiles: ["prisma/migrations/20240101_add_orders.sql"],
      warnings: [],
      skippedEdits: [],
    } as any);

    const task = await createTask({
      title: "Add orders table",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Create an orders table linked to users via FK",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDbArchitect);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-db-architect",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx DB Architect",
    });

    const expert = new SynxDbArchitect();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxDbArchitect);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    expect(output).toHaveProperty("implementationSummary");
    expect(output.implementationSummary).toBeTruthy();
    expect(output).toHaveProperty("filesChanged");
    expect(Array.isArray(output.filesChanged)).toBe(true);
    expect(output.filesChanged.length).toBeGreaterThan(0);
    expect(output).toHaveProperty("edits");
    expect(output.nextAgent).toBe("Synx Code Reviewer");
  });
});
