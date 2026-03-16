import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { BugFixerWorker } from "./bug-fixer.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson, readJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "fixed bug",
          filesChanged: ["src/index.ts"],
          changesMade: ["fixed typo"],
          unitTestsAdded: [],
          testsToRun: [],
          risks: [],
          edits: [
            {
              path: "src/index.ts",
              action: "replace",
              content: "export const foo = 2;",
            },
          ],
          nextAgent: "Reviewer",
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
      providers: { planner: { type: "mock", model: "static-mock" } },
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
    buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({
      files: [{ path: "src/index.ts", content: "export const foo = 1;" }],
    }),
  };
});

vi.mock("../lib/post-edit-sanity.js", () => ({
  runPostEditSanityChecks: vi.fn().mockResolvedValue({
    checks: [],
    blockingFailureSummaries: [],
    outOfScopeFailureSummaries: [],
    metrics: {
      plannedChecks: 0,
      executedChecks: 0,
      cheapChecksExecuted: 0,
      heavyChecksExecuted: 0,
      heavyChecksSkipped: 0,
      fullBuildChecksExecuted: 0,
      earlyInScopeFailures: 0,
    },
  }),
}));

const originalCwd = process.cwd();

describe.sequential("workers/bug-fixer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-bug-fixer-test-"));
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

  it("processes a bug fix and routes to reviewer", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Fix issue",
      typeHint: "Bug",
      project: "test-app",
      rawRequest: "Fix crash",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.bugFixer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "bug-fixer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Bug Fixer",
    });

    const fixer = new BugFixerWorker();
    
    // 2. Act
    const processed = await fixer.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Reviewer");
    
    const fileContent = await fs.readFile(path.join(repoRoot, "src/index.ts"), "utf-8");
    expect(fileContent).toBe("export const foo = 2;");
  });
});
