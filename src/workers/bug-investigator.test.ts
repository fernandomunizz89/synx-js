import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { BugInvestigatorWorker } from "./bug-investigator.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../lib/constants.js";
import { writeJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          symptomSummary: "Mock symptom",
          knownFacts: ["Mock fact"],
          likelyCauses: ["Mock cause"],
          investigationSteps: ["Step 1"],
          unknowns: ["Unknown flag"],
          suspectFiles: ["src/index.ts"],
          suspectAreas: ["src/"],
          primaryHypothesis: "Mock hypothesis",
          secondaryHypotheses: [],
          riskAssessment: {
            buildRisk: "unknown",
            syntaxRisk: "unknown",
            logicRisk: "unknown",
            integrationRisk: "unknown",
            regressionRisk: "unknown",
          },
          builderChecks: [],
          handoffNotes: [],
          nextAgent: "Synx Back Expert",
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

vi.mock("../lib/project-handoff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/project-handoff.js")>();
  return {
    ...actual,
    collectProjectProfile: vi.fn().mockResolvedValue({
      packageManager: "npm",
      detectedLanguages: ["TypeScript"],
      detectedFrameworks: [],
      scriptSummary: { lint: [], typecheck: [], check: [], test: [], e2e: [], build: [] },
      tooling: { hasTsConfig: true, hasPlaywrightConfig: false, hasEslintConfig: false },
      sourceLayout: {
        hasSrcDir: true,
        hasE2EDir: false,
        keyFiles: [],
        sampleSourceFiles: [],
        sampleTestFiles: [],
      },
      dependencies: [],
      testCapabilities: {
        hasPackageJson: true,
        hasE2EDir: false,
        hasE2EScript: false,
        hasE2ESpecFiles: false,
        hasUnitTestScript: false,
        hasUnitTestFiles: false,
        e2eScripts: [],
      }
    }),
    runBugTriageChecks: vi.fn().mockResolvedValue([{
      command: "mock check",
      status: "passed",
      exitCode: 0,
      durationMs: 100,
      diagnostics: [],
    }]),
    deriveSymbolContracts: vi.fn().mockResolvedValue([]),
    buildBugBrief: vi.fn().mockReturnValue({
      symptomSummary: "Mock symptom",
      primaryHypothesis: "Mock hypothesis",
      suspectFiles: [],
      triageChecks: [],
      blockerPatterns: [],
      builderChecks: [],
    }),
  };
});

const originalCwd = process.cwd();

describe.sequential("workers/bug-investigator", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-bug-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    // create a fake source file so exist checks pass
    await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "src/index.ts"), "export const foo = 1;", "utf-8");

    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a simple bug investigation", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Fix crash on start",
      typeHint: "Bug",
      project: "test-app",
      rawRequest: "The app crashes when I start it with --debug",
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.bugInvestigator);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "bug-investigator",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Bug Investigator",
    });

    const investigator = new BugInvestigatorWorker();
    
    // 2. Act
    const processed = await investigator.tryProcess(task.taskId);

    if (!processed) {
      const meta = await loadTaskMeta(task.taskId);
      console.error("Test failed, task meta:", JSON.stringify(meta, null, 2));
      const events = await fs.readFile(path.join(task.taskPath, "logs", "events.log"), "utf8").catch(() => "no events block");
      console.error("EVENTS LOG:\n", events);
    }

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx Back Expert");
  });

  it("adjusts risk assessment on failing triage with syntax errors", async () => {
    // 1. Arrange
    const { runBugTriageChecks } = await import("../lib/project-handoff.js");
    vi.mocked(runBugTriageChecks).mockResolvedValueOnce([{
      command: "mock fail check",
      status: "failed",
      exitCode: 1,
      durationMs: 200,
      diagnostics: ["SyntaxError: Unexpected token"],
    }]);

    const task = await createTask({
      title: "Syntax error on start",
      typeHint: "Bug",
      project: "test-app",
      rawRequest: "Crashes on startup with SyntaxError",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.bugInvestigator);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "bug-investigator",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Bug Investigator",
    });

    const investigator = new BugInvestigatorWorker();
    
    // 2. Act
    const processed = await investigator.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);

    const donePath = path.join(task.taskPath, "done", DONE_FILE_NAMES.bugInvestigator);
    const envelope = await loadTaskMeta(task.taskId).then(() => fs.readFile(donePath, "utf8").then(JSON.parse));
    
    expect(envelope.output.riskAssessment.buildRisk).toBe("medium");
    expect(envelope.output.riskAssessment.syntaxRisk).toBe("high");
  });
});
