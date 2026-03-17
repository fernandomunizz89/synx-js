import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { SynxFrontExpert } from "./synx-front-expert.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        implementationSummary: "Added dark mode toggle",
        filesChanged: ["src/components/Toggle.tsx"],
        impactedFiles: [],
        changesMade: ["Created Toggle.tsx"],
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
            path: "src/components/Toggle.tsx",
            action: "create",
            content: "export const Toggle = () => <button>Toggle</button>;",
          },
        ],
        nextAgent: "Synx QA Engineer",
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
  }),
  loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
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
  ensureCodeQualityBootstrap: vi.fn().mockResolvedValue({
    notes: [],
    warnings: [],
    changedFiles: [],
  }),
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
    // First call (gitChangedBefore): empty — second call (gitChangedFiles): has the file
    getGitChangedFiles: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue(["src/components/Toggle.tsx"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({
      files: [],
      summary: "mock workspace",
    }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      changedFiles: ["src/components/Toggle.tsx"],
      warnings: [],
      skippedEdits: [],
    }),
  };
});

vi.mock("../../lib/orchestrator.js", () => ({
  requestResearchContext: vi.fn().mockResolvedValue({ status: "skip", context: null, triggerReasons: [], reusedContext: false }),
  formatResearchContextTag: vi.fn().mockReturnValue(""),
}));

vi.mock("../../lib/qa-remediation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/qa-remediation.js")>();
  return {
    ...actual,
    synthesizeQaSelectorHotfixEdits: vi.fn().mockResolvedValue({
      edits: [],
      notes: [],
      warnings: [],
    }),
  };
});

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-front-expert", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-front-expert-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "synx-front-expert-test" }, null, 2),
      "utf8",
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a feature task and routes to Synx QA Engineer", async () => {
    const task = await createTask({
      title: "Add dark mode toggle",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add a dark mode toggle button using Next.js App Router",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
    });

    const expert = new SynxFrontExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx QA Engineer");
  });

  it("escalates to human review when the research loop guard triggers", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "abort_to_human",
      context: null,
      abortReason: "Research recommendation repeated.",
      triggerReasons: ["repeated_recommendation"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Complex Next.js refactor",
      typeHint: "Refactor",
      project: "test-app",
      rawRequest: "Refactor layout to RSC",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
    });

    const expert = new SynxFrontExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("processes a QA remediation task", async () => {
    const { DONE_FILE_NAMES } = await import("../../lib/constants.js");
    const { ARTIFACT_FILES } = await import("../../lib/task-artifacts.js");
    const { applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    const { runPostEditSanityChecks } = await import("../../lib/post-edit-sanity.js");
    const { getGitChangedFiles } = await import("../../lib/workspace-tools.js");
    const { createProvider } = await import("../../providers/factory.js");

    vi.mocked(getGitChangedFiles)
      .mockResolvedValueOnce([])
      .mockResolvedValue(["src/components/Button.tsx"]);

    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "Fixing a11y",
          filesChanged: ["src/components/Button.tsx"],
          impactedFiles: [],
          changesMade: ["Added aria-label"],
          unitTestsAdded: [],
          testsToRun: ["npm test", "npx playwright test"],
          technicalRisks: ["A11y regression"],
          riskAssessment: { buildRisk: "low", syntaxRisk: "low", logicRisk: "low" },
          reviewFocus: [],
          manualValidationNeeded: [],
          residualRisks: [],
          verificationMode: "executed_checks",
          risks: ["Risk A"],
          edits: [{ path: "src/components/Button.tsx", action: "replace_snippet", find: "button", replace: 'button aria-label="test"' }],
          nextAgent: "Synx QA Engineer",
        },
      }),
    } as any);

    vi.mocked(applyWorkspaceEdits).mockResolvedValueOnce({
      appliedFiles: ["src/components/Button.tsx"],
      changedFiles: ["src/components/Button.tsx"],
      warnings: ["Warning A"],
      skippedEdits: ["Skip A"],
    });

    vi.mocked(runPostEditSanityChecks).mockResolvedValueOnce({
      success: false,
      blockingFailureSummaries: ["Sanity fail A"],
      results: [],
    } as any);


    const task = await createTask({
      title: "Fix accessibility findings",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Fix the items found by QA",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.mkdir(path.join(task.taskPath, "artifacts"), { recursive: true });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.projectProfile), { profile: "test" });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.featureBrief), { brief: "test" });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.symbolContract), { symbols: [] });

    const qaDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer);
    await writeJson(qaDonePath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      output: {
        verdict: "fail",
        failures: ["Button lacks aria-label"],
        qaHandoffContext: {
          attempt: 1,
          maxRetries: 3,
          returnedTo: "Synx Front Expert",
          summary: "A11y fail",
          latestFindings: [
            {
              issue: "Button lacks aria-label",
              expectedResult: "Aria-label exists",
              receivedResult: "No aria-label",
              evidence: ["HTML snapshot"],
              recommendedAction: "Add aria-label",
            },
          ],
        },
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
      inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
    });

    const expert = new SynxFrontExpert();
    let processed = false;
    try {
      processed = await expert.tryProcess(task.taskId);
    } catch (e) {
      console.error("EXPERT THREW:", e);
      throw e;
    }

    if (!processed) {
      const auditLogPath = path.join(task.taskPath, "logs", "agent-audit.log");
      const audit = await fs.readFile(auditLogPath, "utf8").catch(() => "no audit block");
      console.error("AUDIT LOG FOR FAILURE:\n", audit);
    }

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
  });

  it("exercises conditional logic branches", async () => {
    const { ensureCodeQualityBootstrap } = await import("../../lib/code-quality-bootstrap.js");
    const { runPostEditSanityChecks } = await import("../../lib/post-edit-sanity.js");
    const { synthesizeQaSelectorHotfixEdits } = await import("../../lib/qa-remediation.js");
    const { getGitChangedFiles, detectTestCapabilities } = await import("../../lib/workspace-tools.js");

    // 1. Trigger bootstrap notes/warnings
    vi.mocked(ensureCodeQualityBootstrap).mockResolvedValueOnce({
      notes: ["Bootstrap note"],
      warnings: ["Bootstrap warning"],
      changedFiles: [],
    });

    // 2. Trigger sanity failures
    vi.mocked(runPostEditSanityChecks).mockResolvedValueOnce({
      success: false,
      blockingFailureSummaries: ["Critical sanity fail"],
      results: [],
    } as any);

    // 3. Trigger selector hotfix notes/warnings
    vi.mocked(synthesizeQaSelectorHotfixEdits).mockResolvedValueOnce({
      edits: [],
      notes: ["Hotfix note"],
      warnings: ["Hotfix warning"],
    });

    // 4. Trigger E2E auto-injection branch (preferences require E2E but command missing)
    vi.mocked(detectTestCapabilities).mockResolvedValueOnce({
      hasPackageJson: true,
      hasE2EDir: true,
      hasE2EScript: true,
      hasE2ESpecFiles: true,
      hasUnitTestScript: false,
      hasUnitTestFiles: false,
      e2eScripts: ["test:e2e"], // command is 'npm run test:e2e'
    } as any);

    const task = await createTask({
      title: "Branch test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Focus on branches",
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
        qaPreferences: { e2ePolicy: "required", e2eFramework: "playwright" }
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
    });

    const expert = new SynxFrontExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    // Verify branches were hit
    expect(output.changesMade).toContain("Bootstrap note");
    expect(output.changesMade).toContain("Hotfix note");
    expect(output.risks).toContain("Bootstrap warning");
    expect(output.risks).toContain("Quality gate: Critical sanity fail");
    expect(output.risks).toContain("Hotfix warning");
    expect(output.testsToRun).toContain("npm run --if-present test:e2e");
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
    });

    const expert = new SynxFrontExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(false);
  });

  it("includes research context tag when available", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    const { getGitChangedFiles } = await import("../../lib/workspace-tools.js");

    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValueOnce([]).mockResolvedValue(["src/components/Toggle.tsx"]);

    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "success",
      context: "User likes blue buttons",
      reusedContext: false,
      triggerReasons: []
    } as any);

    const task = await createTask({
      title: "Research test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add button",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxFrontExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
    });

    const expert = new SynxFrontExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);
  });
});

