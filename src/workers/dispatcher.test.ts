import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { DispatcherWorker } from "./dispatcher.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          type: "Feature",
          goal: "add login",
          context: "needs username",
          knownFacts: [],
          unknowns: [],
          assumptions: [],
          constraints: [],
          requiresHumanInput: false,
          nextAgent: "Spec Planner",
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
      agentProviders: {},
    }),
    loadPromptFile: vi.fn().mockResolvedValue("Mock Prompt {{INPUT_JSON}}"),
    resolveProviderConfigForAgent: vi.fn((cfg: any) => cfg.providers.dispatcher),
  };
});

vi.mock("../lib/project-handoff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/project-handoff.js")>();
  return {
    ...actual,
    collectProjectProfile: vi.fn().mockResolvedValue({
      sourceLayout: {
        keyFiles: [],
        sampleSourceFiles: [],
        sampleTestFiles: [],
      },
      packageManager: "npm",
      detectedLanguages: ["TypeScript"],
      detectedFrameworks: [],
      scriptSummary: { lint: [], typecheck: [], check: [], test: [], e2e: [], build: [] },
      tooling: { hasTsConfig: true, hasPlaywrightConfig: false, hasEslintConfig: false },
    }),
  };
});

const originalCwd = process.cwd();

describe.sequential("workers/dispatcher", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-dispatcher-test-"));
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

  it("processes a feature request and routes to planner", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Add feature",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add an endpoint",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "dispatcher",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Dispatcher",
    });

    const dispatcher = new DispatcherWorker();
    
    // 2. Act
    const processed = await dispatcher.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Spec Planner");
  });

  it("processes a bug request and routes to bug investigator", async () => {
    // 1. Arrange
    const { createProvider } = await import("../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          type: "Bug",
          goal: "fix crash",
          context: "app crashes on login",
          knownFacts: [],
          unknowns: [],
          assumptions: [],
          constraints: [],
          requiresHumanInput: false,
          nextAgent: "Bug Investigator",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Fix crash",
      typeHint: "Bug",
      project: "test-app",
      rawRequest: "Fix crash on login",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "dispatcher",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Dispatcher",
    });

    const dispatcher = new DispatcherWorker();
    
    // 2. Act
    const processed = await dispatcher.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Bug Investigator");
  });
});
