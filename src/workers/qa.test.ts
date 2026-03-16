import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { QaWorker } from "./qa.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          mainScenarios: ["Mock scenario"],
          acceptanceChecklist: ["Mock checklist"],
          testCases: [],
          failures: [],
          verdict: "pass",
          e2ePlan: [],
          changedFiles: ["src/index.ts"],
          filesReviewed: ["src/index.ts"],
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
          nextAgent: "PR Writer",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    }),
  };
});

vi.mock("../lib/config.js", () => {
  return {
    loadResolvedProjectConfig: vi.fn().mockResolvedValue({
      projectName: "test-app",
      language: "typescript",
      framework: "node",
      humanReviewer: "User",
      tasksDir: ".ai-agents/tasks",
      providers: { planner: { type: "mock", model: "static-mock" }, dispatcher: { type: "mock", model: "static-mock" } },
    }),
    loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
  };
});

vi.mock("../lib/code-quality-bootstrap.js", () => ({
  ensureCodeQualityBootstrap: vi.fn().mockResolvedValue({
    notes: [],
    warnings: [],
    changedFiles: [],
  }),
}));

vi.mock("../lib/qa-cypress-bootstrap.js", () => ({
  ensureQaCypressBootstrap: vi.fn().mockResolvedValue({
    checks: [],
    notes: [],
    warnings: [],
    changedFiles: [],
  }),
}));

vi.mock("../lib/workspace-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/workspace-tools.js")>();
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
    getGitChangedFiles: vi.fn().mockResolvedValue(["src/index.ts"]),
    runCypressSelectorPreflight: vi.fn().mockResolvedValue({ missingSelectors: [] }),
    runProjectChecks: vi.fn().mockResolvedValue([{
      command: "mock e2e check",
      status: "passed",
      exitCode: 0,
      timedOut: false,
      durationMs: 100,
      stdoutPreview: "",
      stderrPreview: "",
      diagnostics: [],
    }]),
  };
});

const originalCwd = process.cwd();

describe.sequential("workers/qa", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-qa-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    
    // create fake files
    await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "src/index.ts"), "export const foo = 1;", "utf-8");

    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a passing QA validation", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Add feature",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add an endpoint",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.qa);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "qa",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "QA Validator",
    });

    const qa = new QaWorker();
    
    // 2. Act
    const processed = await qa.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("PR Writer");
  });

  it("handles a QA failure and routes back to the Feature Builder", async () => {
    // 1. Arrange
    const { runProjectChecks } = await import("../lib/workspace-tools.js");
    vi.mocked(runProjectChecks).mockResolvedValueOnce([{
      command: "mock e2e check",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      durationMs: 250,
      stdoutPreview: "",
      stderrPreview: "",
      diagnostics: ["Error: failed to find element"],
    }]);

    const task = await createTask({
      title: "Add failing feature",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add an endpoint",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.qa);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "qa",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "QA Validator",
    });

    const qa = new QaWorker();
    
    // 2. Act
    const processed = await qa.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Feature Builder");
  });
});
