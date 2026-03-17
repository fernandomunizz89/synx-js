import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { SynxSeoSpecialist } from "./synx-seo-specialist.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        implementationSummary: "Added JSON-LD to homepage",
        filesChanged: ["app/page.tsx"],
        impactedFiles: [],
        changesMade: ["Added Organization JSON-LD"],
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
            path: "app/page.tsx",
            action: "create",
            content: "export default function Page() { return <main />; }",
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
    metrics: { cheapChecksExecuted: 0, heavyChecksExecuted: 0, heavyChecksSkipped: 0, fullBuildChecksExecuted: 0, earlyInScopeFailures: false },
  }),
}));

vi.mock("../../lib/code-quality-bootstrap.js", () => ({
  ensureCodeQualityBootstrap: vi.fn().mockResolvedValue({ notes: [], warnings: [], changedFiles: [] }),
}));

vi.mock("../../lib/workspace-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/workspace-tools.js")>();
  return {
    ...actual,
    detectTestCapabilities: vi.fn().mockResolvedValue({ hasPackageJson: true, hasE2EDir: false, hasE2EScript: false, hasE2ESpecFiles: false, hasUnitTestScript: false, hasUnitTestFiles: false, e2eScripts: [] }),
    // First call (gitChangedBefore): empty — second call (gitChangedFiles): has the file
    // This ensures effectiveChanged = ["app/page.tsx"] and the no-changes guard doesn't throw.
    getGitChangedFiles: vi.fn()
      .mockResolvedValueOnce([])                    // gitChangedBefore
      .mockResolvedValue(["app/page.tsx"]),         // gitChangedFiles + subsequent calls
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({ changedFiles: ["app/page.tsx"], warnings: [], skippedEdits: [] }),
  };
});

vi.mock("../../lib/orchestrator.js", () => ({
  requestResearchContext: vi.fn().mockResolvedValue({ status: "skip", context: null, triggerReasons: [], reusedContext: false }),
  formatResearchContextTag: vi.fn().mockReturnValue(""),
}));

vi.mock("../../lib/qa-remediation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/qa-remediation.js")>();
  return { ...actual, synthesizeQaSelectorHotfixEdits: vi.fn().mockResolvedValue({ edits: [], notes: [], warnings: [] }) };
});

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-seo-specialist", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-seo-specialist-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-seo-test" }, null, 2), "utf8");
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes an SEO task and routes to Synx QA Engineer", async () => {
    const task = await createTask({
      title: "Add JSON-LD to homepage",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add Organization JSON-LD structured data to the homepage",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
      // inputRef removed: it's optional and new-task.json is not a StageEnvelope
    });

    const expert = new SynxSeoSpecialist();
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
      abortReason: "Research repeated.",
      triggerReasons: ["repeated_recommendation"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Full CWV audit",
      typeHint: "Refactor",
      project: "test-app",
      rawRequest: "Fix LCP regression on product listing pages",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("processes a QA remediation task", async () => {
    const { DONE_FILE_NAMES } = await import("../../lib/constants.js");
    const { ARTIFACT_FILES } = await import("../../lib/task-artifacts.js");
    const { applyWorkspaceEdits, getGitChangedFiles } = await import("../../lib/workspace-tools.js");
    const { createProvider } = await import("../../providers/factory.js");

    vi.mocked(getGitChangedFiles)
      .mockResolvedValueOnce([])
      .mockResolvedValue(["src/pages/index.html"]);

    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "Fixing SEO findings",
          filesChanged: ["src/pages/index.html"],
          impactedFiles: [],
          changesMade: ["Added meta description"],
          unitTestsAdded: [],
          testsToRun: [],
          technicalRisks: ["Canonical URL mismatch"],
          riskAssessment: { buildRisk: "low", syntaxRisk: "low", logicRisk: "low" },
          reviewFocus: [],
          manualValidationNeeded: [],
          residualRisks: [],
          verificationMode: "static_review",
          risks: ["Risk A"],
          edits: [{ path: "src/pages/index.html", action: "replace_snippet", find: "<head>", replace: '<head><meta name="description" content="test">' }],
          nextAgent: "Synx QA Engineer",
        },
      }),
    } as any);

    vi.mocked(applyWorkspaceEdits).mockResolvedValueOnce({
      appliedFiles: ["src/pages/index.html"],
      changedFiles: ["src/pages/index.html"],
      warnings: ["Warning A"],
      skippedEdits: ["Skip A"],
    });

    const task = await createTask({
      title: "Fix SEO findings",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Fix the items found by QA",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    await fs.mkdir(path.join(task.taskPath, "artifacts"), { recursive: true });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.projectProfile), { profile: "test" });

    const qaDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer);
    await writeJson(qaDonePath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      output: {
        verdict: "fail",
        failures: ["Missing meta"],
        qaHandoffContext: {
          attempt: 1,
          maxRetries: 3,
          returnedTo: "Synx SEO Specialist",
          summary: "SEO fail",
          latestFindings: [
            {
              issue: "Missing meta description",
              expectedResult: "Meta exists",
              receivedResult: "No meta",
              evidence: ["HTML"],
              recommendedAction: "Add meta",
            },
          ],
        },
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
      inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("exercises conditional logic branches", async () => {
    const { ensureCodeQualityBootstrap } = await import("../../lib/code-quality-bootstrap.js");
    const { runPostEditSanityChecks } = await import("../../lib/post-edit-sanity.js");
    const { synthesizeQaSelectorHotfixEdits } = await import("../../lib/qa-remediation.js");
    const { detectTestCapabilities } = await import("../../lib/workspace-tools.js");

    vi.mocked(ensureCodeQualityBootstrap).mockResolvedValueOnce({
      notes: ["Bootstrap note"],
      warnings: ["Bootstrap warning"],
      changedFiles: [],
    });

    vi.mocked(runPostEditSanityChecks).mockResolvedValueOnce({
      success: false,
      blockingFailureSummaries: ["Critical sanity fail"],
      results: [],
    } as any);

    vi.mocked(synthesizeQaSelectorHotfixEdits).mockResolvedValueOnce({
      edits: [],
      notes: ["Hotfix note"],
      warnings: ["Hotfix warning"],
    });

    vi.mocked(detectTestCapabilities).mockResolvedValueOnce({
      hasPackageJson: true,
      hasE2EDir: true,
      hasE2EScript: true,
      hasE2ESpecFiles: true,
      hasUnitTestScript: false,
      hasUnitTestFiles: false,
      e2eScripts: ["test:e2e"],
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxSeoSpecialist);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    expect(output.changesMade).toContain("Bootstrap note");
    expect(output.risks).toContain("Bootstrap warning");
    expect(output.risks).toContain("Quality gate: Critical sanity fail");
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(false);
  });
  it("covers research abort branch", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "abort_to_human",
      context: null,
      triggerReasons: ["uncertainty"],
      reusedContext: false,
    });

    const task = await createTask({
      title: "Abort test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check abort",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true); // Agent finishes the handoff successfully
    const metaAfter = await loadTaskMeta(task.taskId);
    expect(metaAfter.humanApprovalRequired).toBe(true);
  });

  it("covers deep branches (missing context, recovery notes, warnings)", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    const { applyWorkspaceEdits, getGitChangedFiles } = await import("../../lib/workspace-tools.js");
    const { createProvider } = await import("../../providers/factory.js");

    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "provided", // Using valid status
      context: "Context with notes",
      triggerReasons: [],
      reusedContext: true, // Note branch 1
    } as any);

    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValueOnce([]).mockResolvedValue(["app/layout.tsx"]);

    vi.mocked(applyWorkspaceEdits).mockResolvedValueOnce({
      appliedFiles: ["app/layout.tsx"],
      changedFiles: ["app/layout.tsx"],
      warnings: ["Applied warning"], // Warning branch
      skippedEdits: ["Skip 1"],
    });

    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "summary",
          edits: [{ path: "app/layout.tsx", action: "create", content: "data" }],
          risks: ["Legacy risk"],
          changesMade: ["Legacy change"],
          testsToRun: ["npm run test"],
          impactedFiles: ["app/layout.tsx"],
          technicalRisks: [],
          filesChanged: ["app/layout.tsx"],
          nextAgent: "Synx QA Engineer",
        },
      }),
    } as any);

    // Branch: extraContext.relatedFiles is missing
    const task = await createTask({
      title: "Deep branch test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check branches",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("includes research context tag when available", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    const { getGitChangedFiles } = await import("../../lib/workspace-tools.js");

    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValueOnce([]).mockResolvedValue(["app/layout.tsx"]);

    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "provided",
      context: "Keywords: AI, agents",
      reusedContext: false,
      triggerReasons: []
    } as any);

    const task = await createTask({
      title: "Research test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add meta",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxSeoSpecialist);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-seo-specialist",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx SEO Specialist",
    });

    const expert = new SynxSeoSpecialist();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);
  });
});
