import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks — hoisted, same instance throughout ────────────────────────────────

vi.mock("../lib/agent-registry.js", () => ({
  loadAgentDefinitions: vi.fn(),
  loadAgentDefinition: vi.fn(),
}));

vi.mock("../lib/interactive.js", () => ({
  promptRequiredText: vi.fn(),
  promptTextWithDefault: vi.fn().mockResolvedValue(""),
  selectOption: vi.fn(),
  confirmAction: vi.fn().mockResolvedValue(false),
  canPromptInteractively: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/paths.js", () => ({
  agentsDir: vi.fn(),
  promptsDir: vi.fn(),
}));

vi.mock("../lib/fs.js", () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  writeJson: vi.fn().mockResolvedValue(undefined),
  writeText: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import once — consistent mock references ─────────────────────────────────

import { type Command } from "commander";
import { agentCommand } from "./agent.js";
import { loadAgentDefinitions, loadAgentDefinition } from "../lib/agent-registry.js";
import { promptRequiredText, promptTextWithDefault, selectOption } from "../lib/interactive.js";
import { agentsDir, promptsDir } from "../lib/paths.js";
import { ensureDir, exists, writeJson, writeText } from "../lib/fs.js";

agentCommand.exitOverride();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reset Commander option values between tests (Commander doesn't clear them between parseAsync calls) */
function resetCommandOptions(cmd: Command): void {
  (cmd as unknown as { _optionValues: Record<string, unknown> })._optionValues = {};
  (cmd as unknown as { _optionValueSources: Record<string, unknown> })._optionValueSources = {};
  for (const sub of cmd.commands) resetCommandOptions(sub);
}

function makeAgentDef(overrides = {}) {
  return {
    id: "my-analyst",
    name: "My Analyst",
    prompt: ".ai-agents/prompts/my-analyst.md",
    provider: { type: "anthropic" as const, model: "claude-sonnet-4-6", apiKeyEnv: "AI_AGENTS_ANTHROPIC_API_KEY" },
    outputSchema: "generic" as const,
    defaultNextAgent: "Synx Back Expert",
    ...overrides,
  };
}

async function runAgent(args: string[]): Promise<void> {
  try {
    await agentCommand.parseAsync(["", "", ...args]);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "commander.helpDisplayed" || code === "commander.version") return;
    }
    throw err;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("commands/agent", () => {
  let root = "";
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-agent-cmd-test-"));
    resetCommandOptions(agentCommand);
    vi.mocked(agentsDir).mockReset().mockReturnValue(path.join(root, "agents"));
    vi.mocked(promptsDir).mockReset().mockReturnValue(path.join(root, "prompts"));
    vi.mocked(exists).mockReset().mockResolvedValue(false);
    vi.mocked(writeJson).mockReset().mockResolvedValue(undefined);
    vi.mocked(writeText).mockReset().mockResolvedValue(undefined);
    vi.mocked(ensureDir).mockReset().mockResolvedValue(undefined);
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  // ─── agent list ─────────────────────────────────────────────────────────────

  describe("agent list", () => {
    it("prints message when no agents exist", async () => {
      vi.mocked(loadAgentDefinitions).mockResolvedValue([]);

      await runAgent(["list"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toMatch(/no custom agents/i);
    });

    it("prints agent id, name, provider and outputSchema", async () => {
      vi.mocked(loadAgentDefinitions).mockResolvedValue([makeAgentDef()]);

      await runAgent(["list"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("my-analyst");
      expect(output).toContain("My Analyst");
      expect(output).toContain("anthropic");
      expect(output).toContain("claude-sonnet-4-6");
      expect(output).toContain("generic");
    });

    it("shows defaultNextAgent when set", async () => {
      vi.mocked(loadAgentDefinitions).mockResolvedValue([
        makeAgentDef({ defaultNextAgent: "Synx QA Engineer" }),
      ]);

      await runAgent(["list"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Synx QA Engineer");
    });

    it("lists all agents when multiple are registered", async () => {
      vi.mocked(loadAgentDefinitions).mockResolvedValue([
        makeAgentDef({ id: "agent-a", name: "Agent A" }),
        makeAgentDef({ id: "agent-b", name: "Agent B" }),
      ]);

      await runAgent(["list"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("agent-a");
      expect(output).toContain("agent-b");
    });
  });

  // ─── agent show ─────────────────────────────────────────────────────────────

  describe("agent show", () => {
    it("prints full details including provider fields", async () => {
      vi.mocked(loadAgentDefinition).mockResolvedValue(makeAgentDef());

      await runAgent(["show", "my-analyst"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("my-analyst");
      expect(output).toContain("My Analyst");
      expect(output).toContain("anthropic");
      expect(output).toContain("claude-sonnet-4-6");
      expect(output).toContain("AI_AGENTS_ANTHROPIC_API_KEY");
    });

    it("exits with error when agent not found", async () => {
      vi.mocked(loadAgentDefinition).mockRejectedValue(
        new Error("Agent definition not found: missing-agent")
      );
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      await expect(runAgent(["show", "missing-agent"])).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ─── agent create ────────────────────────────────────────────────────────────

  describe("agent create", () => {
    it("creates agent JSON and prompt file with --flags (non-interactive)", async () => {
      await runAgent([
        "create",
        "--id", "cli-agent",
        "--name", "CLI Agent",
        "--provider", "anthropic",
        "--model", "claude-opus-4-6",
        "--output-schema", "builder",
        "--default-next-agent", "Synx QA Engineer",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining("cli-agent.json"),
        expect.objectContaining({
          id: "cli-agent",
          name: "CLI Agent",
          outputSchema: "builder",
          defaultNextAgent: "Synx QA Engineer",
          provider: expect.objectContaining({ type: "anthropic", model: "claude-opus-4-6" }),
        })
      );
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("cli-agent.md"),
        expect.stringContaining("CLI Agent")
      );
    });

    it("sets apiKeyEnv for anthropic", async () => {
      await runAgent([
        "create", "--id", "a1", "--name", "A1",
        "--provider", "anthropic", "--model", "claude-sonnet-4-6",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: expect.objectContaining({ apiKeyEnv: "AI_AGENTS_ANTHROPIC_API_KEY" }),
        })
      );
    });

    it("sets apiKeyEnv and baseUrl for openai-compatible", async () => {
      await runAgent([
        "create", "--id", "o1", "--name", "O1",
        "--provider", "openai-compatible", "--model", "gpt-4o",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "openai-compatible",
            apiKeyEnv: "AI_AGENTS_OPENAI_API_KEY",
            baseUrl: "https://api.openai.com/v1",
          }),
        })
      );
    });

    it("sets apiKeyEnv for google", async () => {
      await runAgent([
        "create", "--id", "g1", "--name", "G1",
        "--provider", "google", "--model", "gemini-2.0-flash",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: expect.objectContaining({ apiKeyEnv: "AI_AGENTS_GOOGLE_API_KEY" }),
        })
      );
    });

    it("sets autoDiscoverModel and baseUrl for lmstudio", async () => {
      await runAgent([
        "create", "--id", "l1", "--name", "L1",
        "--provider", "lmstudio", "--model", "auto",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "lmstudio",
            autoDiscoverModel: true,
            baseUrl: "http://localhost:1234/v1",
          }),
        })
      );
    });

    it("normalizes id to lowercase kebab-case", async () => {
      await runAgent([
        "create", "--id", "My Cool Agent",
        "--name", "My Cool Agent",
        "--provider", "mock", "--model", "static",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining("my-cool-agent.json"),
        expect.objectContaining({ id: "my-cool-agent" })
      );
    });

    it("skips prompt file with --no-prompt-file", async () => {
      vi.mocked(writeText).mockClear();

      await runAgent([
        "create", "--id", "noprompt", "--name", "NoPrompt",
        "--provider", "mock", "--model", "static",
        "--no-prompt-file",
      ]);

      expect(writeJson).toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });

    it("omits defaultNextAgent from JSON when not provided", async () => {
      vi.mocked(writeJson).mockClear();

      await runAgent([
        "create", "--id", "no-next", "--name", "No Next",
        "--provider", "mock", "--model", "static",
      ]);

      const call = vi.mocked(writeJson).mock.calls.find((c) =>
        String(c[0]).includes("no-next.json")
      );
      expect(call).toBeDefined();
      expect((call![1] as Record<string, unknown>).defaultNextAgent).toBeUndefined();
    });

    it("starter prompt contains agent name and output format section", async () => {
      vi.mocked(writeText).mockClear();

      await runAgent([
        "create", "--id", "prompt-test", "--name", "Prompt Test Agent",
        "--provider", "mock", "--model", "static",
        "--output-schema", "generic",
      ]);

      const promptCall = vi.mocked(writeText).mock.calls.find((c) =>
        String(c[0]).includes("prompt-test.md")
      );
      expect(promptCall).toBeDefined();
      const content = String(promptCall![1]);
      expect(content).toContain("Prompt Test Agent");
      expect(content).toContain("summary");
    });

    it("builder starter prompt contains edits field description", async () => {
      vi.mocked(writeText).mockClear();

      await runAgent([
        "create", "--id", "builder-test", "--name", "Builder Test",
        "--provider", "mock", "--model", "static",
        "--output-schema", "builder",
      ]);

      const promptCall = vi.mocked(writeText).mock.calls.find((c) =>
        String(c[0]).includes("builder-test.md")
      );
      expect(promptCall).toBeDefined();
      const content = String(promptCall![1]);
      expect(content).toContain("edits");
      expect(content).toContain("implementationSummary");
    });

    it("writes capability metadata when capability flags are provided", async () => {
      await runAgent([
        "create",
        "--id", "cap-agent",
        "--name", "Capability Agent",
        "--provider", "mock",
        "--model", "static",
        "--domains", "backend,api",
        "--frameworks", "Node,Express",
        "--languages", "TypeScript,JavaScript",
        "--task-types", "Feature,Bug",
        "--risk-profile", "high",
        "--verification-modes", "integration_tests,security_checks",
      ]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          capabilities: {
            domain: ["backend", "api"],
            frameworks: ["Node", "Express"],
            languages: ["TypeScript", "JavaScript"],
            taskTypes: ["Feature", "Bug"],
            riskProfile: "high",
            preferredVerificationModes: ["integration_tests", "security_checks"],
          },
        }),
      );
    });

    it("handles interactive openai-compatible overrides", async () => {
      vi.mocked(selectOption)
        .mockResolvedValueOnce("generic") // Output schema
        .mockResolvedValueOnce("openai-compatible"); // Provider
      vi.mocked(promptTextWithDefault)
        .mockResolvedValueOnce("Custom Name") // Display name
        .mockResolvedValueOnce("gpt-custom") // Model
        .mockResolvedValueOnce("https://custom.api/v1") // Base URL
        .mockResolvedValueOnce("CUSTOM_API_KEY"); // API key env

      await runAgent(["create", "--id", "custom-openai"]);

      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining("custom-openai.json"),
        expect.objectContaining({
          provider: expect.objectContaining({
            baseUrl: "https://custom.api/v1",
            apiKeyEnv: "CUSTOM_API_KEY",
          }),
        })
      );
    });

    it("aborts when agent exists and user chooses not to overwrite", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      const { confirmAction } = await import("../lib/interactive.js");
      vi.mocked(confirmAction).mockResolvedValueOnce(false);

      await runAgent(["create", "--id", "existing-agent"]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Aborted"));
      expect(writeJson).not.toHaveBeenCalled();
    });

    it("skips prompt creation if it already exists", async () => {
      vi.mocked(exists)
        .mockResolvedValueOnce(false) // Agent JSON does not exist
        .mockResolvedValueOnce(true); // Prompt file EXISTS

      await runAgent(["create", "--id", "existing-prompt", "--name", "Test"]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Prompt already exists, skipped"));
      expect(writeText).not.toHaveBeenCalled();
    });

    it("throws error for invalid task types", async () => {
      await expect(runAgent(["create", "--id", "v1", "--task-types", "InvalidType"])).rejects.toThrow(/invalid --task-types/i);
    });

    it("throws error for invalid risk profile", async () => {
      await expect(runAgent(["create", "--id", "v2", "--risk-profile", "extreme"])).rejects.toThrow(/invalid --risk-profile/i);
    });

    it("throws error for invalid verification modes", async () => {
      await expect(runAgent(["create", "--id", "v3", "--verification-modes", "none"])).rejects.toThrow(/invalid --verification-modes/i);
    });
  });
});
