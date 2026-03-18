import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { SynxQAEngineer } from "./synx-qa-engineer.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

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

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-qa-engineer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-qa-engineer-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "synx-qa-test", scripts: { test: "vitest run" } }, null, 2),
      "utf8",
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("passes QA validation and routes to Human Review", async () => {
    const task = await createTask({
      title: "Dark mode toggle",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify dark mode toggle works correctly",
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
    expect(meta.nextAgent).toBe("Human Review");
  });

  it("routes QA failure back to Synx Front Expert when it was the previous stage", async () => {
    // Override provider to return a failing QA verdict
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          mainScenarios: ["Toggle should change theme"],
          acceptanceChecklist: [],
          testCases: [],
          failures: ["Toggle button not found in DOM"],
          verdict: "fail",
          e2ePlan: [],
          changedFiles: ["src/components/Toggle.tsx"],
          filesReviewed: ["src/components/Toggle.tsx"],
          validationMode: "executed_checks",
          technicalRiskSummary: {
            buildRisk: "low",
            syntaxRisk: "low",
            importExportRisk: "low",
            referenceRisk: "low",
            logicRisk: "medium",
            regressionRisk: "low",
          },
          recommendedChecks: [],
          manualValidationNeeded: [],
          residualRisks: [],
          executedChecks: [],
          returnContext: [
            {
              issue: "Toggle button not found",
              expectedResult: "Button visible with aria-label",
              receivedResult: "Button not rendered",
              evidence: ["E2E selector failed"],
              recommendedAction: "Fix Toggle component rendering",
            },
          ],
          nextAgent: "Synx Front Expert",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 200,
      }),
    } as any);

    const task = await createTask({
      title: "Dark mode toggle fails QA",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify dark mode toggle",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate that Synx Front Expert was the previous stage
    const frontDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert);
    await writeJson(frontDonePath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
      output: {
        implementationSummary: "Added toggle",
        filesChanged: ["src/components/Toggle.tsx"],
        edits: [],
        nextAgent: "Synx QA Engineer",
      },
    });

    // Inject a history entry so `previousExpert` resolves to "Synx Front Expert"
    const metaPath = path.join(task.taskPath, "meta.json");
    const rawMeta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    rawMeta.history = [
      {
        agent: "Synx Front Expert",
        stage: "synx-front-expert",
        status: "done",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 100,
        finishedAt: new Date().toISOString(),
      },
    ];
    await fs.writeFile(metaPath, JSON.stringify(rawMeta, null, 2), "utf8");

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      inputRef: `done/${DONE_FILE_NAMES.synxFrontExpert}`,
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx Front Expert");
  });

  it("routes QA failure back to Synx Back Expert when it was the previous stage", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          mainScenarios: [],
          acceptanceChecklist: [],
          testCases: [],
          failures: ["UsersService.findAll throws 500"],
          verdict: "fail",
          e2ePlan: [],
          changedFiles: ["src/users/users.service.ts"],
          filesReviewed: ["src/users/users.service.ts"],
          validationMode: "executed_checks",
          technicalRiskSummary: {
            buildRisk: "low",
            syntaxRisk: "low",
            importExportRisk: "low",
            referenceRisk: "low",
            logicRisk: "high",
            regressionRisk: "medium",
          },
          recommendedChecks: [],
          manualValidationNeeded: [],
          residualRisks: [],
          executedChecks: [],
          returnContext: [
            {
              issue: "UsersService.findAll throws 500",
              expectedResult: "Returns array of users",
              receivedResult: "Internal server error",
              evidence: ["Vitest output: TypeError"],
              recommendedAction: "Fix Prisma query in findAll",
            },
          ],
          nextAgent: "Synx Back Expert",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 200,
      }),
    } as any);

    const task = await createTask({
      title: "Users service fails QA",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify users service",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const backDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxBackExpert);
    await writeJson(backDonePath, {
      taskId: task.taskId,
      stage: "synx-back-expert",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx Back Expert",
      output: { implementationSummary: "Added users service", filesChanged: [], edits: [], nextAgent: "Synx QA Engineer" },
    });

    // Inject a history entry so `previousExpert` resolves to "Synx Back Expert"
    // (the QA worker scans taskMeta.history, which createTask doesn't populate)
    const metaPath = path.join(task.taskPath, "meta.json");
    const rawMeta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    rawMeta.history = [
      {
        agent: "Synx Back Expert",
        stage: "synx-back-expert",
        status: "done",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 100,                
        finishedAt: new Date().toISOString(),
      },
    ];
    await fs.writeFile(metaPath, JSON.stringify(rawMeta, null, 2), "utf8");

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
      title: "History check",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify history persistence",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const historyDir = path.join(task.taskPath, "artifacts");
    await fs.mkdir(historyDir, { recursive: true });
    await writeJson(path.join(historyDir, "synx-qa-return-context-history.json"), {
      taskId: task.taskId,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          attempt: 1,
          returnedAt: new Date().toISOString(),
          returnedTo: "Synx Front Expert",
          summary: "Old issue",
          failures: [],
          findings: [],
        },
      ],
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

  it("handles corrupted history artifact by returning empty array", async () => {
    const task = await createTask({
      title: "Corrupted history check",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify history resilience",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const historyDir = path.join(task.taskPath, "artifacts");
    await fs.mkdir(historyDir, { recursive: true });
    // Write invalid JSON to trigger the catch block in loadSynxQaReturnHistory
    await fs.writeFile(path.join(historyDir, "synx-qa-return-context-history.json"), "invalid { json", "utf8");

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
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          mainScenarios: [],
          acceptanceChecklist: [],
          verdict: "pass",
          failures: [],
          nextAgent: "Human Review",
          returnContext: [],
        },
      }),
    } as any);

    const task = await createTask({
      title: "Full diagnostics test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify all fields",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const expertDonePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert);
    await writeJson(expertDonePath, {
      taskId: task.taskId,
      stage: "synx-front-expert",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "Synx Front Expert",
      output: {
        executedChecks: [
          {
            command: "npm test",
            status: "passed",
            exitCode: 0,
            timedOut: false,
            durationMs: 100,
            stdoutPreview: "pass",
            stderrPreview: "",
            diagnostics: ["Error at line 1"],
            qaConfigNotes: ["Running with --coverage"],
            artifacts: ["coverage.lcov"],
          },
        ],
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxQaEngineer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-qa-engineer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx QA Engineer",
      inputRef: `done/${DONE_FILE_NAMES.synxFrontExpert}`,
    });

    const qa = new SynxQAEngineer();
    const processed = await qa.tryProcess(task.taskId);

    expect(processed).toBe(true);
  });

  it("falls back to Human Review if no expert is found in history", async () => {
    const task = await createTask({
      title: "No expert in history",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify fallback",
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
    // Should be waiting human because verdict pass + humanApprovalRequired is true by default in WorkerBase if nextAgent is null/fallback
    expect(meta.status).toBe("waiting_human");
  });

  it("exercises fallback to Synx Front Expert for cumulative findings when expert is unknown", async () => {
    // We already have "handles corrupted history" which triggers empty history.
    // This test specifically targets the line where it maps to "Synx Front Expert" if isExpertAgent is false.
    const task = await createTask({
      title: "Unknown expert fallback",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify builder fallback",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Injected history with unknown agent
    const meta = await loadTaskMeta(task.taskId);
    meta.history = [
      {
        agent: "Synx Front Expert",
        stage: "synx-front-expert",
        status: "done",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 100,
      }
    ];
    await writeJson(path.join(task.taskPath, "meta.json"), meta);

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

  it("triggers diagnostic mapping and data extraction branches", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    const { runProjectChecks } = await import("../../lib/validation-checks.js");

    const mockChecks = [
      {
        command: "npm test",
        status: "passed",
        exitCode: 0,
        timedOut: false,
        durationMs: 120,
        stdoutPreview: "Tests passed",
        stderrPreview: "",
        diagnostics: ["Line 1: ok", "Line 2: ok"],
        artifacts: ["junit.xml"],
        qaConfigNotes: ["Coverage enabled"]
      } as any,
    ];

    vi.mocked(runProjectChecks).mockResolvedValueOnce(mockChecks);

    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          verdict: "pass",
          mainScenarios: ["Test scenario"],
          acceptanceChecklist: ["Check 1"],
          testCases: [],
          failures: [],
          e2ePlan: [],
          changedFiles: [],
          filesReviewed: [],
          validationMode: "executed_checks",
          technicalRiskSummary: {
            buildRisk: "low",
            syntaxRisk: "low",
            importExportRisk: "low",
            referenceRisk: "low",
            logicRisk: "low",
            regressionRisk: "low",
          },
          executedChecks: mockChecks, // LLM returning the mapped checks
          nextAgent: "Human Review",
        },
      }),
    } as any);

    const task = await createTask({
      title: "Diagnostic branch test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify diagnostics",
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

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer);
    const done = await fs.readFile(donePath, "utf8").then(JSON.parse);
    const output = done.output;

    // Verify mapping occurred
    const check = output.executedChecks[0];
    expect(check.diagnostics).toEqual(["Line 1: ok", "Line 2: ok"]);
    expect(check.artifacts).toEqual(["junit.xml"]);
    expect(check.qaConfigNotes).toEqual(["Coverage enabled"]);
  });

  it("handles failure with no history by falling back to Human Review", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          verdict: "fail",
          failures: ["Critical bug"],
          nextAgent: "Human Review",
          mainScenarios: [],
          acceptanceChecklist: [],
          testCases: [],
          e2ePlan: [],
          changedFiles: [],
          filesReviewed: [],
          validationMode: "static_review",
          technicalRiskSummary: { buildRisk: "low", syntaxRisk: "low", importExportRisk: "low", referenceRisk: "low", logicRisk: "low", regressionRisk: "low" },
        },
      }),
    } as any);

    const task = await createTask({
      title: "Fail no history",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Verify",
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
    expect(meta.nextAgent).toBe("Human Review");
    expect(meta.humanApprovalRequired).toBe(true);
  });
});


