import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAgentDefinition, loadAgentDefinitions } from "./agent-registry.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./paths.js", () => ({
  agentsDir: vi.fn(),
  repoRoot: vi.fn(),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("lib/agent-registry", () => {
  let tmpDir = "";
  let agentsDirPath = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-registry-test-"));
    agentsDirPath = path.join(tmpDir, ".ai-agents", "agents");

    const { agentsDir } = await import("./paths.js");
    vi.mocked(agentsDir).mockReturnValue(agentsDirPath);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── loadAgentDefinitions ──────────────────────────────────────────────────

  describe("loadAgentDefinitions()", () => {
    it("returns empty array when agents dir does not exist", async () => {
      // agentsDirPath was never created — should not throw
      const result = await loadAgentDefinitions();
      expect(result).toEqual([]);
    });

    it("returns an empty array when agents dir exists but is empty", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });
      const result = await loadAgentDefinitions();
      expect(result).toEqual([]);
    });

    it("returns parsed definitions from valid JSON files", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      const def = {
        id: "my-agent",
        name: "My Agent",
        prompt: ".ai-agents/prompts/my-agent.md",
        provider: { type: "mock", model: "gpt-4" },
        outputSchema: "generic",
        defaultNextAgent: "Human Review",
      };
      await fs.writeFile(
        path.join(agentsDirPath, "my-agent.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadAgentDefinitions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("my-agent");
      expect(result[0].name).toBe("My Agent");
      expect(result[0].outputSchema).toBe("generic");
    });

    it("loads multiple valid definitions", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      const def1 = {
        id: "agent-one",
        name: "Agent One",
        prompt: ".ai-agents/prompts/agent-one.md",
        provider: { type: "mock", model: "gpt-4" },
        outputSchema: "generic",
      };
      const def2 = {
        id: "agent-two",
        name: "Agent Two",
        prompt: ".ai-agents/prompts/agent-two.md",
        provider: { type: "anthropic", model: "claude-3" },
        outputSchema: "builder",
      };

      await fs.writeFile(path.join(agentsDirPath, "agent-one.json"), JSON.stringify(def1), "utf8");
      await fs.writeFile(path.join(agentsDirPath, "agent-two.json"), JSON.stringify(def2), "utf8");

      const result = await loadAgentDefinitions();
      expect(result).toHaveLength(2);
      const ids = result.map((d) => d.id).sort();
      expect(ids).toEqual(["agent-one", "agent-two"]);
    });

    it("skips invalid JSON files silently and returns valid ones", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      // Valid definition
      const valid = {
        id: "valid-agent",
        name: "Valid Agent",
        prompt: ".ai-agents/prompts/valid-agent.md",
        provider: { type: "mock", model: "gpt-4" },
        outputSchema: "generic",
      };
      await fs.writeFile(path.join(agentsDirPath, "valid-agent.json"), JSON.stringify(valid), "utf8");

      // Invalid JSON (syntax error)
      await fs.writeFile(path.join(agentsDirPath, "broken.json"), "{ not valid json", "utf8");

      // Invalid schema (missing required fields)
      await fs.writeFile(
        path.join(agentsDirPath, "missing-fields.json"),
        JSON.stringify({ id: "incomplete" }),
        "utf8",
      );

      const result = await loadAgentDefinitions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("valid-agent");
    });

    it("ignores non-.json files", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await fs.writeFile(path.join(agentsDirPath, "readme.md"), "# Agents", "utf8");
      await fs.writeFile(path.join(agentsDirPath, "notes.txt"), "some notes", "utf8");

      const result = await loadAgentDefinitions();
      expect(result).toEqual([]);
    });
  });

  // ─── loadAgentDefinition ───────────────────────────────────────────────────

  describe("loadAgentDefinition()", () => {
    it("throws when the agent definition file does not exist", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await expect(loadAgentDefinition("nonexistent")).rejects.toThrow(
        "Agent definition not found: nonexistent",
      );
    });

    it("returns parsed definition for a valid file", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      const def = {
        id: "test-agent",
        name: "Test Agent",
        prompt: ".ai-agents/prompts/test-agent.md",
        provider: { type: "mock", model: "gpt-4" },
        outputSchema: "builder",
        defaultNextAgent: "Synx QA Engineer",
      };
      await fs.writeFile(
        path.join(agentsDirPath, "test-agent.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadAgentDefinition("test-agent");
      expect(result.id).toBe("test-agent");
      expect(result.name).toBe("Test Agent");
      expect(result.outputSchema).toBe("builder");
      expect(result.defaultNextAgent).toBe("Synx QA Engineer");
    });

    it("throws a ZodError when the file has invalid schema", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await fs.writeFile(
        path.join(agentsDirPath, "bad-schema.json"),
        JSON.stringify({ id: "bad-schema" }), // missing required fields
        "utf8",
      );

      await expect(loadAgentDefinition("bad-schema")).rejects.toThrow();
    });
  });

  // ─── agentDefinitionSchema validation ─────────────────────────────────────

  describe("agentDefinitionSchema validation", () => {
    it("rejects definition with missing id", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await fs.writeFile(
        path.join(agentsDirPath, "no-id.json"),
        JSON.stringify({
          name: "No ID Agent",
          prompt: ".ai-agents/prompts/no-id.md",
          provider: { type: "mock", model: "gpt-4" },
          outputSchema: "generic",
        }),
        "utf8",
      );

      await expect(loadAgentDefinition("no-id")).rejects.toThrow();
    });

    it("rejects definition with missing name", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await fs.writeFile(
        path.join(agentsDirPath, "no-name.json"),
        JSON.stringify({
          id: "no-name",
          prompt: ".ai-agents/prompts/no-name.md",
          provider: { type: "mock", model: "gpt-4" },
          outputSchema: "generic",
        }),
        "utf8",
      );

      await expect(loadAgentDefinition("no-name")).rejects.toThrow();
    });

    it("rejects definition with invalid outputSchema", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      await fs.writeFile(
        path.join(agentsDirPath, "bad-schema-enum.json"),
        JSON.stringify({
          id: "bad-schema-enum",
          name: "Bad Schema",
          prompt: ".ai-agents/prompts/bad.md",
          provider: { type: "mock", model: "gpt-4" },
          outputSchema: "invalid-value",
        }),
        "utf8",
      );

      await expect(loadAgentDefinition("bad-schema-enum")).rejects.toThrow();
    });

    it("accepts definition without optional defaultNextAgent", async () => {
      await fs.mkdir(agentsDirPath, { recursive: true });

      const def = {
        id: "no-default",
        name: "No Default Agent",
        prompt: ".ai-agents/prompts/no-default.md",
        provider: { type: "mock", model: "gpt-4" },
        outputSchema: "generic",
        // no defaultNextAgent
      };
      await fs.writeFile(
        path.join(agentsDirPath, "no-default.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadAgentDefinition("no-default");
      expect(result.defaultNextAgent).toBeUndefined();
    });
  });
});
