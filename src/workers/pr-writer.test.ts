import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import { PrWriterWorker } from "./pr-writer.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { writeJson, readJson } from "../lib/fs.js";

vi.mock("../providers/factory.js", () => {
  return {
    createProvider: vi.fn().mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          summary: "Fixed bug",
          whatWasDone: ["Fixed login path"],
          testPlan: ["Run E2E"],
          rolloutNotes: [],
          nextAgent: "Human Review",
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

vi.mock("../lib/pr-tools.js", () => ({
  applyPrChanges: vi.fn().mockResolvedValue({
    branchName: "ai-agents/fix-bug",
    diff: "diff --git a/src/index.ts b/src/index.ts",
    prUrl: "https://github.com/mock/repo/pull/1",
  }),
}));

vi.mock("../lib/workspace-tools.js", () => ({
  buildWorkspaceContextSnapshot: vi.fn().mockResolvedValue({
    files: [{ path: "src/index.ts", content: "export const foo = 1;" }],
  }),
}));

const originalCwd = process.cwd();

describe.sequential("workers/pr", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-pr-test-"));
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

  it("processes a PR and completes the task", async () => {
    // 1. Arrange
    const task = await createTask({
      title: "Fix issue",
      typeHint: "Bug",
      project: "test-app",
      rawRequest: "Fix crash",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.pr);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "pr",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "PR Writer",
    });

    const pr = new PrWriterWorker();
    
    // 2. Act
    const processed = await pr.tryProcess(task.taskId);

    // 3. Assert
    expect(processed).toBe(true);
    
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_human");
    expect(meta.nextAgent).toBe("");
  });
});
