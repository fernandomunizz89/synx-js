import { afterEach, beforeEach, describe, expect, vi, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SynxCodeReviewer } from "./synx-code-reviewer.js";
import { createTask, loadTaskMeta } from "../../lib/task.js";
import { STAGE_FILE_NAMES, DONE_FILE_NAMES } from "../../lib/constants.js";
import { writeJson } from "../../lib/fs.js";
import { createTestActionContext } from "./expert-test-utils.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        reviewPassed: true,
        issues: [],
        summary: "Code looks good. No issues found.",
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

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/experts/synx-code-reviewer", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    const ctx = await createTestActionContext("synx-code-reviewer-test-");
    root = ctx.root;
    repoRoot = ctx.repoRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("reviewPassed:true advances to Synx QA Engineer", async () => {
    const task = await createTask({
      title: "Add dark mode toggle",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add a dark mode toggle",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxCodeReviewer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-code-reviewer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Code Reviewer",
    });

    const reviewer = new SynxCodeReviewer();
    const processed = await reviewer.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.nextAgent).toBe("Synx QA Engineer");
  });

  it("critical issue found routes back to the previous expert", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          reviewPassed: false,
          issues: [
            {
              file: "src/components/Toggle.tsx",
              severity: "critical",
              message: "SQL injection vulnerability in raw query",
              suggestion: "Use parameterized queries",
            },
          ],
          summary: "Critical security issue found.",
          blockedReason: "SQL injection vulnerability must be fixed before proceeding.",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Add feature",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add some feature",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate a previous Synx Front Expert stage in history
    const meta = await loadTaskMeta(task.taskId);
    meta.history.push({
      stage: "synx-front-expert",
      agent: "Synx Front Expert",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1000,
      status: "done",
    });
    const { saveTaskMeta } = await import("../../lib/task.js");
    await saveTaskMeta(task.taskId, meta);

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxCodeReviewer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-code-reviewer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Code Reviewer",
    });

    const reviewer = new SynxCodeReviewer();
    const processed = await reviewer.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const updatedMeta = await loadTaskMeta(task.taskId);
    expect(updatedMeta.nextAgent).toBe("Synx Front Expert");
  });

  it("medium issues only passes through with warnings and advances to QA", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          reviewPassed: true,
          issues: [
            {
              file: "src/components/Toggle.tsx",
              severity: "medium",
              message: "Consider extracting magic number to a constant",
              suggestion: "const TIMEOUT_MS = 3000;",
            },
          ],
          summary: "Minor improvements suggested.",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Add feature with medium issue",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add feature",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxCodeReviewer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-code-reviewer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Code Reviewer",
    });

    const reviewer = new SynxCodeReviewer();
    const processed = await reviewer.tryProcess(task.taskId);

    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.nextAgent).toBe("Synx QA Engineer");
  });

  it("max re-route limit reached advances despite critical issues", async () => {
    const { createProvider } = await import("../../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          reviewPassed: false,
          issues: [
            {
              file: "src/api/users.ts",
              severity: "high",
              message: "Missing input validation",
              suggestion: "Add Zod schema validation",
            },
          ],
          summary: "High severity issue found.",
          blockedReason: "Input validation missing.",
        },
        provider: "mock",
        model: "static-mock",
        parseRetries: 0,
        estimatedTotalTokens: 100,
      }),
    } as any);

    const task = await createTask({
      title: "Reroute limit test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Reroute limit",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // Simulate that re-route count is already at MAX (2)
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxCodeReviewer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-code-reviewer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Code Reviewer",
      output: { codeReviewRerouteCount: 2 },
    });

    const reviewer = new SynxCodeReviewer();
    const processed = await reviewer.tryProcess(task.taskId);

    expect(processed).toBe(true);

    // Should advance to QA despite high issue because reroute limit reached
    const meta = await loadTaskMeta(task.taskId);
    expect(meta.nextAgent).toBe("Synx QA Engineer");
  });

  it("handles missing previous expert done file gracefully", async () => {
    const task = await createTask({
      title: "Feature with no prior expert done file",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Some feature",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    // No previous expert done file is created
    const inboxPath = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.synxCodeReviewer);
    await writeJson(inboxPath, {
      taskId: task.taskId,
      stage: "synx-code-reviewer",
      status: "request",
      createdAt: new Date().toISOString(),
      agent: "Synx Code Reviewer",
    });

    const reviewer = new SynxCodeReviewer();
    // Should not throw even though no done file exists for previous expert
    const processed = await reviewer.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.nextAgent).toBe("Synx QA Engineer");
  });
});
