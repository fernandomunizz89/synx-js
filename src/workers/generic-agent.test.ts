import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenericAgent } from "./generic-agent.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { writeJson } from "../lib/fs.js";
import type { AgentDefinition } from "../lib/types.js";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../lib/runtime.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({
      parsed: {
        summary: "Generic agent completed successfully",
        result: { key: "value" },
        nextAgent: "Human Review",
      },
      provider: "mock",
      model: "static-mock",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 50,
      estimatedTotalTokens: 150,
      estimatedCostUsd: 0.001,
    }),
  }),
}));

vi.mock("../lib/workspace-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/workspace-tools.js")>();
  return {
    ...actual,
    applyWorkspaceEdits: vi.fn().mockResolvedValue({
      appliedFiles: [],
      changedFiles: [],
      warnings: [],
      skippedEdits: [],
    }),
  };
});

vi.mock("../lib/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/fs.js")>();
  return {
    ...actual,
    readText: vi.fn().mockResolvedValue("Mock system prompt for {{INPUT_JSON}}"),
  };
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeGenericDefinition(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "my-custom-agent",
    name: "My Custom Agent",
    prompt: ".ai-agents/prompts/my-custom-agent.md",
    provider: { type: "mock", model: "static-mock" },
    outputSchema: "generic",
    defaultNextAgent: "Human Review",
    ...overrides,
  };
}

function makeBuilderDefinition(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "my-builder-agent",
    name: "My Builder Agent",
    prompt: ".ai-agents/prompts/my-builder-agent.md",
    provider: { type: "mock", model: "static-mock" },
    outputSchema: "builder",
    defaultNextAgent: "Synx QA Engineer",
    ...overrides,
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("workers/generic-agent", () => {
  let root = "";
  let repoRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "generic-agent-test-"));
    repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "generic-agent-test" }, null, 2),
      "utf8",
    );
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  // ─── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("sets correct agent name from definition", () => {
      const def = makeGenericDefinition();
      const agent = new GenericAgent(def);
      expect(agent.agent).toBe("My Custom Agent");
    });

    it("sets correct requestFileName from definition id", () => {
      const def = makeGenericDefinition();
      const agent = new GenericAgent(def);
      expect(agent.requestFileName).toBe("custom-my-custom-agent.request.json");
    });

    it("sets correct workingFileName from definition id", () => {
      const def = makeGenericDefinition();
      const agent = new GenericAgent(def);
      expect(agent.workingFileName).toBe("custom-my-custom-agent.working.json");
    });

    it("handles definition with hyphenated id correctly", () => {
      const def = makeGenericDefinition({ id: "content-review-agent", name: "Content Review Agent" });
      const agent = new GenericAgent(def);
      expect(agent.agent).toBe("Content Review Agent");
      expect(agent.requestFileName).toBe("custom-content-review-agent.request.json");
      expect(agent.workingFileName).toBe("custom-content-review-agent.working.json");
    });
  });

  // ─── tryProcess ───────────────────────────────────────────────────────────

  describe("tryProcess()", () => {
    it("returns false when inbox file does not exist", async () => {
      const task = await createTask({
        title: "Test task",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Do something",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeGenericDefinition();
      const agent = new GenericAgent(def);
      const result = await agent.tryProcess(task.taskId);

      expect(result).toBe(false);
    });

    it("processes a task with outputSchema 'generic' and routes to nextAgent from output", async () => {
      const { createProvider } = await import("../providers/factory.js");

      vi.mocked(createProvider).mockReturnValueOnce({
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            summary: "Completed generic analysis",
            result: { analyzed: true },
            nextAgent: "Synx QA Engineer",
          },
          provider: "mock",
          model: "static-mock",
          parseRetries: 0,
          validationPassed: true,
          providerAttempts: 1,
          providerBackoffRetries: 0,
          providerBackoffWaitMs: 0,
          estimatedInputTokens: 100,
          estimatedOutputTokens: 50,
          estimatedTotalTokens: 150,
          estimatedCostUsd: 0.001,
        }),
      } as any);

      const task = await createTask({
        title: "Generic agent test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Analyze and summarize",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeGenericDefinition();
      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      const processed = await agent.tryProcess(task.taskId);

      expect(processed).toBe(true);

      const meta = await loadTaskMeta(task.taskId);
      expect(meta.status).toBe("waiting_agent");
      expect(meta.nextAgent).toBe("Synx QA Engineer");
    });

    it("routes to defaultNextAgent when output.nextAgent is absent", async () => {
      const { createProvider } = await import("../providers/factory.js");

      vi.mocked(createProvider).mockReturnValueOnce({
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            summary: "Done, no explicit next agent",
            // nextAgent is absent
          },
          provider: "mock",
          model: "static-mock",
          parseRetries: 0,
          validationPassed: true,
          providerAttempts: 1,
          providerBackoffRetries: 0,
          providerBackoffWaitMs: 0,
          estimatedInputTokens: 80,
          estimatedOutputTokens: 30,
          estimatedTotalTokens: 110,
          estimatedCostUsd: 0.0005,
        }),
      } as any);

      const task = await createTask({
        title: "Default routing test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Do something with default routing",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeGenericDefinition({ defaultNextAgent: "Synx Front Expert" });
      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      const processed = await agent.tryProcess(task.taskId);

      expect(processed).toBe(true);

      const meta = await loadTaskMeta(task.taskId);
      expect(meta.nextAgent).toBe("Synx Front Expert");
    });

    it("routes to 'Human Review' when no nextAgent and no defaultNextAgent", async () => {
      const { createProvider } = await import("../providers/factory.js");

      vi.mocked(createProvider).mockReturnValueOnce({
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            summary: "Done with no routing hints",
          },
          provider: "mock",
          model: "static-mock",
          parseRetries: 0,
          validationPassed: true,
          providerAttempts: 1,
          providerBackoffRetries: 0,
          providerBackoffWaitMs: 0,
          estimatedInputTokens: 50,
          estimatedOutputTokens: 20,
          estimatedTotalTokens: 70,
          estimatedCostUsd: 0.0002,
        }),
      } as any);

      const task = await createTask({
        title: "No routing test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Do something with no routing",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeGenericDefinition({ defaultNextAgent: undefined });
      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      const processed = await agent.tryProcess(task.taskId);

      expect(processed).toBe(true);

      const meta = await loadTaskMeta(task.taskId);
      expect(meta.nextAgent).toBe("Human Review");
    });

    it("processes a task with outputSchema 'builder' and applies workspace edits", async () => {
      const { createProvider } = await import("../providers/factory.js");
      const { applyWorkspaceEdits } = await import("../lib/workspace-tools.js");

      vi.mocked(createProvider).mockReturnValueOnce({
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            implementationSummary: "Created new file",
            filesChanged: ["src/new-file.ts"],
            impactedFiles: [],
            changesMade: ["Created src/new-file.ts"],
            unitTestsAdded: [],
            testsToRun: ["npm test"],
            technicalRisks: [],
            riskAssessment: {
              buildRisk: "low",
              syntaxRisk: "low",
              importExportRisk: "low",
              typingRisk: "low",
              logicRisk: "low",
              integrationRisk: "low",
              regressionRisk: "low",
            },
            reviewFocus: [],
            manualValidationNeeded: [],
            residualRisks: [],
            verificationMode: "static_review",
            risks: [],
            edits: [
              {
                path: "src/new-file.ts",
                action: "create",
                content: "export const newFile = true;",
              },
            ],
            nextAgent: "Synx QA Engineer",
          },
          provider: "mock",
          model: "static-mock",
          parseRetries: 0,
          validationPassed: true,
          providerAttempts: 1,
          providerBackoffRetries: 0,
          providerBackoffWaitMs: 0,
          estimatedInputTokens: 120,
          estimatedOutputTokens: 80,
          estimatedTotalTokens: 200,
          estimatedCostUsd: 0.002,
        }),
      } as any);

      const task = await createTask({
        title: "Builder agent test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Create a new file",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeBuilderDefinition();
      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      const processed = await agent.tryProcess(task.taskId);

      expect(processed).toBe(true);
      expect(applyWorkspaceEdits).toHaveBeenCalledOnce();

      const meta = await loadTaskMeta(task.taskId);
      expect(meta.status).toBe("waiting_agent");
      expect(meta.nextAgent).toBe("Synx QA Engineer");
    });

    it("uses the provider from the definition (not from global config)", async () => {
      const { createProvider } = await import("../providers/factory.js");

      const task = await createTask({
        title: "Provider source test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Verify provider is from definition",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const customProvider = { type: "anthropic" as const, model: "claude-3-haiku-20240307" };
      const def = makeGenericDefinition({ provider: customProvider });

      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      await agent.tryProcess(task.taskId);

      // createProvider must have been called with the definition's provider config
      expect(createProvider).toHaveBeenCalledWith(customProvider);
    });

    it("writes a done file and a view file after processing", async () => {
      const task = await createTask({
        title: "Output file test",
        typeHint: "Feature",
        project: "test-app",
        rawRequest: "Check output files are created",
        extraContext: { relatedFiles: [], logs: [], notes: [] },
      });

      const def = makeGenericDefinition();
      const inboxPath = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "inbox",
        `custom-${def.id}.request.json`,
      );
      await writeJson(inboxPath, {
        taskId: task.taskId,
        stage: `custom-${def.id}`,
        status: "request",
        createdAt: new Date().toISOString(),
        agent: def.name,
      });

      const agent = new GenericAgent(def);
      const processed = await agent.tryProcess(task.taskId);
      expect(processed).toBe(true);

      const doneFile = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "done",
        `custom-${def.id}.done.json`,
      );
      const viewFile = path.join(
        repoRoot,
        ".ai-agents",
        "tasks",
        task.taskId,
        "views",
        `custom-${def.id}.md`,
      );

      const doneExists = await fs.access(doneFile).then(() => true).catch(() => false);
      const viewExists = await fs.access(viewFile).then(() => true).catch(() => false);

      expect(doneExists).toBe(true);
      expect(viewExists).toBe(true);
    });
  });
});
