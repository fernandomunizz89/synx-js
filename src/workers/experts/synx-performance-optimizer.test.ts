import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxPerformanceOptimizer } from "./synx-performance-optimizer.js";
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
        implementationSummary: "Applied React.memo and lazy loading to reduce LCP by 600ms",
        filesChanged: ["src/components/HeavyList.tsx"],
        impactedFiles: [],
        changesMade: ["Wrapped HeavyList in React.memo", "Lazy-loaded HeavyList route"],
        unitTestsAdded: [],
        testsToRun: ["npm test"],
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
            path: "src/components/HeavyList.tsx",
            action: "replace_snippet",
            find: "export function HeavyList",
            replace: "export const HeavyList = React.memo(function HeavyList",
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
      .mockResolvedValue(["src/components/HeavyList.tsx"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      changedFiles: ["src/components/HeavyList.tsx"],
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

describe.sequential("workers/experts/synx-performance-optimizer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-performance-optimizer-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("routes to Code Reviewer after successful performance optimization", async () => {
    const task = await createTask({
      title: "Optimize HeavyList component rendering",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Reduce re-renders in HeavyList by applying React.memo and lazy loading",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxPerfOptimizer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-performance-optimizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Performance Optimizer",
    });

    const expert = new SynxPerformanceOptimizer();
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
      abortReason: "Research loop detected: same optimization strategy attempted twice.",
      triggerReasons: ["repeated_recommendation"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Optimize critical rendering path",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Improve LCP below 2.5s for homepage",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxPerfOptimizer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-performance-optimizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Performance Optimizer",
    });

    const expert = new SynxPerformanceOptimizer();
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
      title: "No-op performance test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "No actual changes",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxPerfOptimizer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-performance-optimizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Performance Optimizer",
    });

    const expert = new SynxPerformanceOptimizer();
    const processed = await expert.tryProcess(task.taskId);
    // When throw happens, tryProcess catches and returns false
    expect(processed).toBe(false);
  });

  it("output includes correct implementation summary and changed files", async () => {
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    vi.mocked(getGitChangedFiles).mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue(["src/components/HeavyList.tsx"]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({
      changedFiles: ["src/components/HeavyList.tsx"],
      warnings: [],
      skippedEdits: [],
    } as any);

    const task = await createTask({
      title: "Memoize product list",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Apply React.memo to ProductList to reduce unnecessary re-renders",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxPerfOptimizer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-performance-optimizer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Performance Optimizer",
    });

    const expert = new SynxPerformanceOptimizer();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxPerfOptimizer);
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
