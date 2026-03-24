import { describe, expect, it, vi, beforeEach } from "vitest";
import { pipelineCommand } from "./pipeline.js";
import * as pipelineRegistry from "../lib/pipeline-registry.js";
import * as fs from "../lib/fs.js";
import * as task from "../lib/task.js";

vi.mock("../lib/pipeline-registry.js", () => ({
  loadPipelineDefinition: vi.fn(),
  loadPipelineDefinitions: vi.fn(),
}));

vi.mock("../lib/fs.js", () => ({
  writeJson: vi.fn(),
}));

vi.mock("../lib/task.js", () => ({
  ensureTaskStructure: vi.fn(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/services/task-services.js", () => ({
    resolveProjectName: vi.fn().mockResolvedValue({ project: "test-app" }),
}));

describe("commands/pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("list", () => {
    it("reports no pipelines defined yet if error occurs", async () => {
      vi.mocked(pipelineRegistry.loadPipelineDefinitions).mockRejectedValue(new Error("Fail"));

      await pipelineCommand.parseAsync(["node", "pipeline", "list"]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No pipelines defined yet."));
    });

    it("lists definitions", async () => {
      vi.mocked(pipelineRegistry.loadPipelineDefinitions).mockResolvedValue([
        { id: "p1", name: "P1", routing: "r1", steps: [] }
      ] as any);

      await pipelineCommand.parseAsync(["node", "pipeline", "list"]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("P1"));
    });
  });

  describe("show", () => {
    it("reports error if pipeline not found", async () => {
      vi.mocked(pipelineRegistry.loadPipelineDefinition).mockRejectedValue(new Error("Not found"));
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

      await expect(pipelineCommand.parseAsync(["node", "pipeline", "show", "p1"])).rejects.toThrow("exit");

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Error: Not found"));
    });

    it("shows details", async () => {
      vi.mocked(pipelineRegistry.loadPipelineDefinition).mockResolvedValue({
        id: "p1", name: "P1", routing: "r1", steps: [
            { agent: "A1", providerOverride: "o1", condition: "c1", defaultNextStep: 2 }
        ]
      } as any);

      await pipelineCommand.parseAsync(["node", "pipeline", "show", "p1"]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("P1"));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Step 1: A1"));
    });
  });

  describe("run", () => {
    it("creates a pipeline task", async () => {
      vi.mocked(pipelineRegistry.loadPipelineDefinition).mockResolvedValue({
        id: "p1", name: "P1", routing: "r1", steps: []
      } as any);

      await pipelineCommand.parseAsync(["node", "pipeline", "run", "p1", "Do something"]);

      expect(task.ensureTaskStructure).toHaveBeenCalled();
      expect(fs.writeJson).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Pipeline task created."));
    });
  });
});
