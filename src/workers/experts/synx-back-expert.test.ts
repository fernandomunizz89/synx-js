import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { SynxBackExpert } from "./synx-back-expert.js";
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
        implementationSummary: "Added user service endpoint",
        filesChanged: ["src/users/users.service.ts"],
        impactedFiles: [],
        changesMade: ["Created users.service.ts"],
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
            path: "src/users/users.service.ts",
            action: "create",
            content: "export class UsersService {}",
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
    framework: "nestjs",
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
    // First call: empty — second call: has the file
    getGitChangedFiles: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue(["src/users/users.service.ts"]),
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({ files: [], summary: "mock workspace" }),
    applyWorkspaceEdits: vi.fn().mockResolvedValue({ changedFiles: ["src/users/users.service.ts"], warnings: [], skippedEdits: [] }),
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

describe.sequential("workers/experts/synx-back-expert", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-back-expert-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-back-test" }, null, 2), "utf8");
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a backend feature task and routes to Synx QA Engineer", async () => {
    const task = await createTask({
      title: "Add users service",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Create a NestJS UsersService with Prisma integration",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
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
      abortReason: "Too many attempts",
      triggerReasons: ["Repeated query"],
      context: "Partial info",
    } as any);

    const task = await createTask({
      title: "Research loop test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Force research loop",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(false);
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
      title: "Complex Prisma migration",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Migrate ORM from TypeORM to Prisma",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("processes a QA remediation task", async () => {
    const { DONE_FILE_NAMES } = await import("../../lib/constants.js");
    const { ARTIFACT_FILES } = await import("../../lib/task-artifacts.js");
    const { getGitChangedFiles, applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");

    vi.mocked(getGitChangedFiles).mockReset().mockResolvedValueOnce([]).mockResolvedValue(["src/users/users.service.ts"]);
    vi.mocked(applyWorkspaceEdits).mockReset().mockResolvedValue({
      appliedFiles: ["src/users/users.service.ts"],
      changedFiles: ["src/users/users.service.ts"],
      warnings: [],
      skippedEdits: [],
    });

    const task = await createTask({
      title: "Fix backend findings",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Fix the items found by QA in users service",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Create artifacts
    await fs.mkdir(path.join(task.taskPath, "artifacts"), { recursive: true });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.projectProfile), { profile: "test" });
    await writeJson(path.join(task.taskPath, "artifacts", ARTIFACT_FILES.featureBrief), { brief: "test" });

    // Simulate QA failure
    const qaDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer);
    await writeJson(qaDonePath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      output: {
        verdict: "fail",
        failures: ["Constraint violation in service"],
        qaHandoffContext: {
          attempt: 1,
          maxRetries: 3,
          returnedTo: "Synx Back Expert",
          summary: "DB constraint fail",
          latestFindings: [
            {
              issue: "Duplicate key on email",
              expectedResult: "Unique constraint handled",
              receivedResult: "Query error",
              evidence: ["Prisma catch block"],
              recommendedAction: "Add uniqueness check before insert",
            },
          ],
        },
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
      inputRef: `done/${DONE_FILE_NAMES.synxQaEngineer}`,
    });

    const expert = new SynxBackExpert();
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
      e2eScripts: ["test:integration"],
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxBackExpert);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    expect(output.changesMade).toContain("Bootstrap note");
    expect(output.risks).toContain("Bootstrap warning");
    expect(output.risks).toContain("Quality gate: Critical sanity fail");
    expect(output.testsToRun).toContain("npm run --if-present test:integration");
  });

  it("includes research context tag when available", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "success",
      context: "Use Prisma 5.0",
      reusedContext: false,
      triggerReasons: []
    } as any);

    const task = await createTask({
      title: "Research test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add model",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);
    expect(processed).toBe(true);
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true); // Agent finishes the handoff successfully
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.humanApprovalRequired).toBe(true);
  });

  it("covers deep branches (missing context, recovery notes, warnings)", async () => {
    const { requestResearchContext } = await import("../../lib/orchestrator.js");
    const { applyWorkspaceEdits } = await import("../../lib/workspace-tools.js");
    const { createProvider } = await import("../../providers/factory.js");

    vi.mocked(requestResearchContext).mockResolvedValueOnce({
      status: "provided", // Using valid status
      context: "Context with notes",
      triggerReasons: [],
      reusedContext: true, // Note branch 1
    } as any);

    vi.mocked(applyWorkspaceEdits).mockResolvedValueOnce({
      appliedFiles: ["index.ts"],
      changedFiles: ["index.ts"],
      warnings: ["Applied warning"], // Warning branch
      skippedEdits: ["Skip 1"],
    });

    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "summary",
          edits: [{ path: "index.ts", action: "create", content: "data" }],
          risks: ["Legacy risk"],
          changesMade: ["Legacy change"],
          testsToRun: ["npm run test"],
          impactedFiles: ["index.ts"],
          technicalRisks: [],
          filesChanged: ["index.ts"],
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

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxBackExpert);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const expert = new SynxBackExpert();
    const processed = await expert.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });
});
