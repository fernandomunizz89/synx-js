import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPipelineDefinition, loadPipelineDefinitions } from "./pipeline-registry.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./paths.js", () => ({
  pipelinesDir: vi.fn(),
  repoRoot: vi.fn(),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

const originalCwd = process.cwd();

describe.sequential("lib/pipeline-registry", () => {
  let tmpDir = "";
  let pipelinesDirPath = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-registry-test-"));
    pipelinesDirPath = path.join(tmpDir, ".ai-agents", "pipelines");

    const { pipelinesDir } = await import("./paths.js");
    vi.mocked(pipelinesDir).mockReturnValue(pipelinesDirPath);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── loadPipelineDefinitions ───────────────────────────────────────────────

  describe("loadPipelineDefinitions()", () => {
    it("returns empty array when pipelines dir does not exist", async () => {
      // pipelinesDirPath was never created — should not throw
      const result = await loadPipelineDefinitions();
      expect(result).toEqual([]);
    });

    it("returns an empty array when pipelines dir exists but is empty", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });
      const result = await loadPipelineDefinitions();
      expect(result).toEqual([]);
    });

    it("returns parsed definitions from valid JSON files", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "my-pipeline",
        name: "My Pipeline",
        routing: "sequential",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "my-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinitions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("my-pipeline");
      expect(result[0].name).toBe("My Pipeline");
      expect(result[0].routing).toBe("sequential");
      expect(result[0].steps).toHaveLength(1);
    });

    it("skips invalid files silently and returns valid ones", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      // Valid definition
      const valid = {
        id: "valid-pipeline",
        name: "Valid Pipeline",
        routing: "sequential",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "valid-pipeline.json"),
        JSON.stringify(valid),
        "utf8",
      );

      // Invalid JSON (syntax error)
      await fs.writeFile(
        path.join(pipelinesDirPath, "broken.json"),
        "{ not valid json",
        "utf8",
      );

      // Invalid schema (missing required fields)
      await fs.writeFile(
        path.join(pipelinesDirPath, "missing-fields.json"),
        JSON.stringify({ id: "incomplete" }),
        "utf8",
      );

      const result = await loadPipelineDefinitions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("valid-pipeline");
    });

    it("ignores non-.json files", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await fs.writeFile(path.join(pipelinesDirPath, "readme.md"), "# Pipelines", "utf8");
      await fs.writeFile(path.join(pipelinesDirPath, "notes.txt"), "some notes", "utf8");

      const result = await loadPipelineDefinitions();
      expect(result).toEqual([]);
    });
  });

  // ─── loadPipelineDefinition ────────────────────────────────────────────────

  describe("loadPipelineDefinition()", () => {
    it("throws when the pipeline definition file does not exist", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await expect(loadPipelineDefinition("nonexistent")).rejects.toThrow(
        "Pipeline definition not found: nonexistent",
      );
    });

    it("returns parsed definition for a valid file", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "test-pipeline",
        name: "Test Pipeline",
        routing: "dynamic",
        steps: [
          { agent: "Synx Front Expert" },
          { agent: "Synx QA Engineer" },
        ],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "test-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("test-pipeline");
      expect(result.id).toBe("test-pipeline");
      expect(result.name).toBe("Test Pipeline");
      expect(result.routing).toBe("dynamic");
      expect(result.steps).toHaveLength(2);
    });

    it("throws a ZodError when the file has invalid schema", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await fs.writeFile(
        path.join(pipelinesDirPath, "bad-schema.json"),
        JSON.stringify({ id: "bad-schema" }), // missing required fields
        "utf8",
      );

      await expect(loadPipelineDefinition("bad-schema")).rejects.toThrow();
    });
  });

  // ─── pipelineDefinitionSchema validation ───────────────────────────────────

  describe("pipelineDefinitionSchema validation", () => {
    it("rejects definition with missing id", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await fs.writeFile(
        path.join(pipelinesDirPath, "no-id.json"),
        JSON.stringify({
          name: "No ID Pipeline",
          routing: "sequential",
          steps: [{ agent: "Synx Front Expert" }],
        }),
        "utf8",
      );

      // File exists but schema validation fails — throws a ZodError
      await expect(loadPipelineDefinition("no-id")).rejects.toThrow();
    });

    it("rejects definition with missing name", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await fs.writeFile(
        path.join(pipelinesDirPath, "no-name.json"),
        JSON.stringify({
          id: "no-name",
          routing: "sequential",
          steps: [{ agent: "Synx Front Expert" }],
        }),
        "utf8",
      );

      await expect(loadPipelineDefinition("no-name")).rejects.toThrow();
    });

    it("rejects definition with missing steps", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      await fs.writeFile(
        path.join(pipelinesDirPath, "no-steps.json"),
        JSON.stringify({ id: "no-steps", name: "No Steps Pipeline" }),
        "utf8",
      );

      await expect(loadPipelineDefinition("no-steps")).rejects.toThrow();
    });

    it("accepts sequential routing", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "seq-pipeline",
        name: "Sequential Pipeline",
        routing: "sequential",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "seq-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("seq-pipeline");
      expect(result.routing).toBe("sequential");
    });

    it("accepts dynamic routing", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "dyn-pipeline",
        name: "Dynamic Pipeline",
        routing: "dynamic",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "dyn-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("dyn-pipeline");
      expect(result.routing).toBe("dynamic");
    });

    it("accepts conditional routing", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "cond-pipeline",
        name: "Conditional Pipeline",
        routing: "conditional",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "cond-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("cond-pipeline");
      expect(result.routing).toBe("conditional");
    });

    it("defaults routing to sequential when omitted", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "default-routing",
        name: "Default Routing Pipeline",
        steps: [{ agent: "Synx Front Expert" }],
        // no routing field
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "default-routing.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("default-routing");
      expect(result.routing).toBe("sequential");
    });

    it("accepts providerOverride as shorthand string", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "override-pipeline",
        name: "Override Pipeline",
        routing: "sequential",
        steps: [
          { agent: "Synx Front Expert", providerOverride: "anthropic/claude-opus-4-6" },
        ],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "override-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("override-pipeline");
      expect(result.steps[0].providerOverride).toBe("anthropic/claude-opus-4-6");
    });

    it("accepts conditions on steps", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "condition-pipeline",
        name: "Condition Pipeline",
        routing: "conditional",
        steps: [
          {
            agent: "Synx Front Expert",
            condition: "task.type === 'Feature'",
            defaultNextStep: 1,
          },
          { agent: "Synx QA Engineer" },
        ],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "condition-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("condition-pipeline");
      expect(result.steps[0].condition).toBe("task.type === 'Feature'");
      expect(result.steps[0].defaultNextStep).toBe(1);
    });

    it("accepts optional description", async () => {
      await fs.mkdir(pipelinesDirPath, { recursive: true });

      const def = {
        id: "desc-pipeline",
        name: "Described Pipeline",
        description: "A pipeline with a description",
        routing: "sequential",
        steps: [{ agent: "Synx Front Expert" }],
      };
      await fs.writeFile(
        path.join(pipelinesDirPath, "desc-pipeline.json"),
        JSON.stringify(def),
        "utf8",
      );

      const result = await loadPipelineDefinition("desc-pipeline");
      expect(result.description).toBe("A pipeline with a description");
    });
  });
});
