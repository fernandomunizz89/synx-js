import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { BuilderWorker } from "./builder.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          implementationSummary: "Added mock log feature",
          filesChanged: ["src/index.ts"],
          changesMade: ["mock update"],
          testsToRun: [],
          risks: [],
          edits: [
            {
              path: "src/index.ts",
              action: "create",
              content: "export const log = true;",
            }
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
      providers: { planner: { type: "mock", model: "static-mock" }, dispatcher: { type: "mock", model: "static-mock" } },
    }),
    loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
  };
});

vi.mock("../lib/post-edit-sanity.js", () => {
  return {
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
  };
});

const originalCwd = process.cwd();

describe.sequential("workers/builder", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-builder-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "synx-builder-test" }, null, 2),
      "utf8"
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("processes a simple feature task", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Add basic logging",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add a simple boolean flag to enable logging",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Mock project configuration to use a mock provider
    // Skip manual config mocking since it's vi.mock'd
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.builder);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "builder",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Feature Builder",
    });

    const builder = new BuilderWorker();
    
    // 2. Act
    const processed = await builder.tryProcess(task.taskId);

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
    expect(meta.nextAgent).toBe("Reviewer");

    const srcContent = await fs.readFile(path.join(repoRoot, "src/index.ts"), "utf8");
    expect(srcContent).toBe("export const log = true;");
  });

  it("handles QA failures and missing E2E infrastructure", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Add basic logging",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add a simple boolean flag to enable logging",
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
        qaPreferences: {
          e2ePolicy: "required",
          e2eFramework: "playwright",
          objective: "log should be accessible",
        },
      },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.builder);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "builder",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Feature Builder",
      inputRef: `inbox/${STAGE_FILE_NAMES.qa}`,
    });

    const qaHandoffPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.qa);
    await writeJson(qaHandoffPath, {
      taskId: task.taskId,
      stage: "qa",
      status: "done",
      createdAt: new Date().toISOString(),
      agent: "QA Validator",
      output: {
        failures: ["No E2E tests configured"],
        qaHandoffContext: {
          attempt: 1,
          maxRetries: 3,
          returnedTo: "Feature Builder",
          summary: "E2E infra missing",
          latestFindings: [],
          cumulativeFindings: [],
          history: [],
        }
      }
    });

    const builder = new BuilderWorker();
    
    // 2. Act
    const processed = await builder.tryProcess(task.taskId);

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
    expect(meta.nextAgent).toBe("Reviewer");
  });
});
