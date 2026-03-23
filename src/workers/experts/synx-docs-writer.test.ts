import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxDocsWriter } from "./synx-docs-writer.js";
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

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        implementationSummary: "Updated README with setup instructions and API reference",
        filesChanged: ["README.md"],
        impactedFiles: [],
        changesMade: ["Added installation section", "Added API usage examples"],
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
            path: "README.md",
            action: "create",
            content: "# My Project\n\nDocumentation content here.",
          },
        ],
        nextAgent: "Human Review",
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

vi.mock("../../lib/workspace-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/workspace-tools.js")>();
  return {
    ...actual,
    getGitChangedFiles: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue(["README.md"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      changedFiles: ["README.md"],
      warnings: [],
      skippedEdits: [],
    }),
  };
});

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-docs-writer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-docs-writer-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("documentation task routes directly to Human Review (humanApprovalRequired=true)", async () => {
    const task = await createTask({
      title: "Write project README",
      typeHint: "Documentation",
      project: "test-app",
      rawRequest: "Write a comprehensive README with setup instructions",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDocsWriter);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-docs-writer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Documentation Writer",
    });

    const writer = new SynxDocsWriter();
    const processed = await writer.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
    expect(meta.humanApprovalRequired).toBe(true);
    expect(meta.nextAgent).toBe("Human Review");
  });

  it("produces builder output (file edits for docs)", async () => {
    const task = await createTask({
      title: "Add API documentation",
      typeHint: "Documentation",
      project: "test-app",
      rawRequest: "Document the public API endpoints",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDocsWriter);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-docs-writer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Documentation Writer",
    });

    const writer = new SynxDocsWriter();
    const processed = await writer.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxDocsWriter);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    // Verify builder output shape
    expect(output).toHaveProperty("implementationSummary");
    expect(output).toHaveProperty("filesChanged");
    expect(output).toHaveProperty("edits");
    expect(output.nextAgent).toBe("Human Review");
  });

  it("throws error if no file changes are detected", async () => {
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValue([]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({ appliedFiles: [], changedFiles: [], warnings: [], skippedEdits: [] });

    const task = await createTask({
      title: "No change test",
      typeHint: "Documentation",
      project: "test-app",
      rawRequest: "Update docs",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxDocsWriter);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-docs-writer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Documentation Writer",
    });

    const writer = new SynxDocsWriter();
    const processed = await writer.tryProcess(task.taskId);
    expect(processed).toBe(false);
  });
});
