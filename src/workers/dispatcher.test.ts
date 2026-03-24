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
          nextAgent: "Synx Front Expert",
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

  it("processes a feature request and routes to the selected expert", async () => {
    // 1. Arrange
    const { createProvider } = await import("../providers/factory.js");
    vi.mocked(createProvider).mockReturnValue({
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
          nextAgent: "Synx Front Expert",
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
    expect(meta.nextAgent).toBe("Synx Front Expert");
  });

  it("processes a bug request and routes to expert", async () => {
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
          nextAgent: "Synx Back Expert",
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
    expect(meta.nextAgent).toBe("Synx Back Expert");
  });

  // ── Phase 4.1 — Project Memory ─────────────────────────────────────────────

  it("Phase 4.1 — injects project memory into model input when memory file exists", async () => {
    // Pre-populate project memory file
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "memory"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, ".ai-agents", "memory", "project-memory.json"),
      JSON.stringify({
        version: 1,
        patterns: [{ fact: "Always use TypeScript strict mode", source: "manual", addedAt: "" }],
        decisions: [{ fact: "Chose Fastify over Express", source: "manual", addedAt: "" }],
        knownIssues: [],
        updatedAt: "",
      }),
      "utf-8",
    );

    let capturedInput: unknown = null;
    const { createProvider } = await import("../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockImplementation(async (req: { input: unknown }) => {
        capturedInput = req.input;
        return {
          parsed: {
            type: "Feature",
            goal: "test memory",
            context: "memory context",
            knownFacts: [],
            unknowns: [],
            assumptions: [],
            constraints: [],
            requiresHumanInput: false,
            nextAgent: "Synx Front Expert",
          },
          provider: "mock",
          model: "mock",
          parseRetries: 0,
          estimatedTotalTokens: 0,
        };
      }),
    } as any);

    const task = await createTask({
      title: "Memory test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test memory injection",
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

    await new DispatcherWorker().tryProcess(task.taskId);

    // The model input must carry projectMemory
    const input = capturedInput as { projectMemory?: { patterns: unknown[] } };
    expect(input.projectMemory).toBeDefined();
    expect(Array.isArray(input.projectMemory!.patterns)).toBe(true);
    expect(input.projectMemory!.patterns).toHaveLength(1);
  });

  it("Phase 4.1 — proceeds normally when no memory file exists", async () => {
    const task = await createTask({
      title: "No memory test",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Test with no memory",
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

    const processed = await new DispatcherWorker().tryProcess(task.taskId);
    expect(processed).toBe(true);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.nextAgent).toBe("Synx Front Expert");
  });

  // ── Phase 4.3 — Enhanced Dispatcher Chain ──────────────────────────────────

  it("Phase 4.3 — persists suggestedChain to TaskMeta when dispatcher outputs it", async () => {
    const { createProvider } = await import("../providers/factory.js");
    vi.mocked(createProvider).mockReturnValueOnce({
      generateStructured: vi.fn().mockResolvedValue({
        parsed: {
          type: "Feature",
          goal: "add auth",
          context: "full stack auth feature",
          knownFacts: [],
          unknowns: [],
          assumptions: [],
          constraints: [],
          requiresHumanInput: false,
          nextAgent: "Synx Back Expert",
          suggestedChain: ["Synx Back Expert", "Synx Code Reviewer", "Synx QA Engineer"],
        },
        provider: "mock",
        model: "mock",
        parseRetries: 0,
        estimatedTotalTokens: 0,
      }),
    } as any);

    const task = await createTask({
      title: "Add auth",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "Add JWT auth",
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

    await new DispatcherWorker().tryProcess(task.taskId);

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.suggestedChain).toEqual([
      "Synx Back Expert",
      "Synx Code Reviewer",
      "Synx QA Engineer",
    ]);
  });

  it("Phase 4.3 — suggestedChain is absent from TaskMeta when dispatcher omits it", async () => {
    const task = await createTask({
      title: "Simple task",
      typeHint: "Feature",
      project: "test-app",
      rawRequest: "A simple feature",
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

    await new DispatcherWorker().tryProcess(task.taskId);

    const meta = await loadTaskMeta(task.taskId);
    // Default mock doesn't output suggestedChain — should be undefined/empty
    expect(meta.suggestedChain == null || meta.suggestedChain.length === 0).toBe(true);
  });
});
