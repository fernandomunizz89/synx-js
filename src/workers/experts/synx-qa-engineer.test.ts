import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxQAEngineer } from "./synx-qa-engineer.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        mainScenarios: ["User can toggle dark mode"],
        acceptanceChecklist: ["Toggle button exists and responds"],
        testCases: [],
        failures: [],
        verdict: "pass",
        e2ePlan: [],
        changedFiles: ["src/components/Toggle.tsx"],
        filesReviewed: ["src/components/Toggle.tsx"],
        validationMode: "executed_checks",
        technicalRiskSummary: {
          buildRisk: "low",
          syntaxRisk: "low",
          importExportRisk: "low",
          referenceRisk: "low",
          logicRisk: "low",
          regressionRisk: "low",
        },
        recommendedChecks: [],
        manualValidationNeeded: [],
        residualRisks: [],
        executedChecks: [],
        returnContext: [],
        nextAgent: "Human Review",
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      estimatedTotalTokens: 150,
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
    getGitChangedFiles: vi.fn().mockResolvedValue(["src/components/Toggle.tsx"]),
    runE2ESelectorPreflight: vi.fn().mockResolvedValue({ missingSelectors: [] }),
  };
});

vi.mock("../../lib/validation-checks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/validation-checks.js")>();
  return {
    ...actual,
    runProjectChecks: vi.fn().mockResolvedValue([
      {
        command: "npm test",
        status: "passed",
        exitCode: 0,
        timedOut: false,
        durationMs: 120,
        stdoutPreview: "",
        stderrPreview: "",
        diagnostics: [],
      },
    ]),
  };
});

vi.mock("../../lib/orchestrator.js", () => ({
  requestResearchContext: vi.fn().mockResolvedValue({ status: "skip", context: null, triggerReasons: [], reusedContext: false }),
  formatResearchContextTag: vi.fn().mockReturnValue(""),
}));

const originalCwd = process.cwd();

describe("workers/experts/synx-qa-engineer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-qa-engineer-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a QA task and routes to Human Review by default", async () => {
    const task = await createTask({
      title: "Test dark mode toggle",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify the dark mode toggle works on the home page",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
  });

  it("routes QA failure back to Synx Back Expert when it was the previous stage", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          verdict: "fail",
          failures: ["API returns 500 on toggle"],
          nextAgent: "Synx Back Expert",
          mainScenarios: ["Test toggle"],
          acceptanceChecklist: ["Toggle works"],
          returnContext: [{
            issue: "Endpoint /api/toggle is failing",
            expectedResult: "200 OK",
            receivedResult: "500 Internal Server Error",
            evidence: ["Logs"],
            recommendedAction: "Check API logs",
          }],
        },
      }),
    } as any);

    const task = await createTask({
      title: "Test toggle API",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify toggle API",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const metaBefore = await loadTaskMeta(task.taskId);
    metaBefore.history.push({
      stage: "synx-back-expert",
      agent: "Synx Back Expert",
      status: "done",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 100,
    });
    const { saveTaskMeta } = await import("../../lib/task.js");
    await saveTaskMeta(task.taskId, metaBefore);

    const qaDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxBackExpert);
    await writeJson(qaDonePath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      inputRef: `done/${DONE_FILE_NAMES.synxBackExpert}`,
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx Back Expert");
  });

  it("loads existing return history from artifacts", async () => {
    const task = await createTask({
      title: "History test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check history",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const historyPath = path.join(task.taskPath, "artifacts", "qa-return-history.json");
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await writeJson(historyPath, [{ attempt: 1, returnedTo: "Synx Back Expert" }]);

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("handles corrupted history artifact by returning empty array", async () => {
    const task = await createTask({
      title: "Corrupted history test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check corruption",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const historyPath = path.join(task.taskPath, "artifacts", "qa-return-history.json");
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, "invalid json");

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("exercises diagnostic mapping with full check results", async () => {
    const { runProjectChecks } = await import("../../lib/validation-checks.js");
    vi.mocked(runProjectChecks).mockResolvedValueOnce([
      {
        command: "npm run lint",
        status: "failed",
        exitCode: 1,
        stdoutPreview: "Unused variable 'x'",
        stderrPreview: "",
        diagnostics: ["Unused variable 'x'"],
        durationMs: 50,
        timedOut: false,
      },
    ]);

    const task = await createTask({
      title: "Diagnostic test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check diagnostics",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("falls back to Human Review if no expert is found in history", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          verdict: "fail",
          failures: ["Unknown failure"],
          nextAgent: "Synx Back Expert",
          mainScenarios: ["Test fallback"],
          acceptanceChecklist: ["Check history"],
          returnContext: [],
        },
      }),
    } as any);

    const task = await createTask({
      title: "No history fallback test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check fallback",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
  });

  it("triggers diagnostic mapping and data extraction branches", async () => {
    const { runProjectChecks } = await import("../../lib/validation-checks.js");
    vi.mocked(runProjectChecks).mockResolvedValueOnce([
      {
        command: "npm test",
        status: "failed",
        exitCode: 1,
        stdoutPreview: "FAIL src/app.test.ts",
        stderrPreview: "Error: expected 1 to be 2",
        diagnostics: [],
        durationMs: 100,
        timedOut: false,
      },
    ]);

    const task = await createTask({
      title: "Extraction test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Check extraction",
      extraContext: { relatedFiles: ["src/app.ts"], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    expect(done.output.failures).toBeDefined();
  });

  it("handles failure with no history by falling back to Human Review", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          verdict: "fail",
          failures: ["Critial bug"],
          nextAgent: "Synx Back Expert",
          mainScenarios: ["Test fail no history"],
          acceptanceChecklist: ["No history fallback"],
          returnContext: [],
        },
      }),
    } as any);

    const task = await createTask({
      title: "Fail no history",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test fail no history",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
  });
});
