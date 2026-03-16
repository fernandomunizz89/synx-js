import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { PlannerWorker } from "./planner.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson, readJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          technicalContext: "requires db",
          knownFacts: [],
          unknowns: [],
          assumptions: [],
          requiresHumanInput: false,
          conditionalPlan: ["step 1", "step 2"],
          edgeCases: [],
          risks: [],
          validationCriteria: [],
          nextAgent: "Feature Builder",
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

vi.mock("../lib/project-handoff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/project-handoff.js")>();
  return {
    ...actual,
    collectProjectProfile: vi.fn().mockResolvedValue({
      sourceLayout: { keyFiles: [], sampleSourceFiles: [], sampleTestFiles: [] },
      packageManager: "npm",
      detectedLanguages: ["TypeScript"],
      detectedFrameworks: [],
      scriptSummary: { lint: [], typecheck: [], check: [], test: [], e2e: [], build: [] },
      tooling: { hasTsConfig: true, hasPlaywrightConfig: false, hasEslintConfig: false },
    }),
  };
});

const originalCwd = process.cwd();

describe.sequential("workers/planner", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-planner-test-"));
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

  it("processes a spec plan and routes to feature builder", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Add feature plan",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add an endpoint",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.planner);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "planner",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Spec Planner",
    });

    const planner = new PlannerWorker();
    
    // 2. Act
    const processed = await planner.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Feature Builder");

    // Has artifact
    const artifactPath = path.join(task.taskPath, "artifacts", "project-profile.json");
    const artifact = await readJson(artifactPath);
    expect(artifact).toBeDefined();
  });
});
