import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routeByCapabilities } from "./capability-routing.js";
import { writeJson } from "./fs.js";
import type { NewTaskInput } from "./types.js";
import type { ProjectProfile } from "./project-detector.js";

const originalCwd = process.cwd();

function buildProjectProfile(overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot: process.cwd(),
    taskTitle: "sample task",
    taskType: "Feature",
    configuredProject: {
      projectName: "sample",
      language: "TypeScript",
      framework: "Node",
    },
    packageManager: "npm",
    scripts: {},
    scriptSummary: { lint: [], typecheck: [], check: [], test: [], e2e: [], build: [] },
    testCapabilities: {
      hasE2EScript: false,
      hasE2ESpecFiles: false,
      hasUnitTestScript: true,
      unitScripts: ["test"],
      e2eScripts: [],
      e2eSpecFiles: [],
    },
    detectedLanguages: ["TypeScript"],
    detectedFrameworks: ["Node"],
    dependencies: [],
    tooling: {
      hasTsConfig: true,
      hasPlaywrightConfig: false,
      hasEslintConfig: true,
    },
    sourceLayout: {
      hasSrcDir: true,
      hasE2EDir: false,
      sampleSourceFiles: [],
      sampleTestFiles: [],
      keyFiles: ["package.json"],
    },
    ...overrides,
  };
}

describe.sequential("lib/capability-routing", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-capability-routing-test-"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "cap-routing-test" }, null, 2), "utf8");
    await fs.mkdir(path.join(root, ".ai-agents"), { recursive: true });
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("selects a custom specialist when its capability profile and quality signals are stronger", async () => {
    await fs.mkdir(path.join(root, ".ai-agents", "agents"), { recursive: true });
    await writeJson(path.join(root, ".ai-agents", "agents", "backend-specialist.json"), {
      id: "backend-specialist",
      name: "Backend Specialist",
      prompt: ".ai-agents/prompts/backend-specialist.md",
      provider: { type: "mock", model: "static-mock" },
      outputSchema: "builder",
      capabilities: {
        domain: ["backend", "api", "endpoint"],
        frameworks: ["Node"],
        languages: ["TypeScript"],
        taskTypes: ["Feature", "Bug", "Refactor"],
        riskProfile: "medium",
        preferredVerificationModes: ["integration_tests"],
      },
    });

    await fs.mkdir(path.join(root, ".ai-agents", "learnings"), { recursive: true });
    const learningFile = path.join(root, ".ai-agents", "learnings", "backend-specialist.jsonl");
    await fs.writeFile(
      learningFile,
      [
        JSON.stringify({
          timestamp: new Date().toISOString(),
          taskId: "task-1",
          agentId: "Backend Specialist",
          summary: "Implemented API endpoint",
          outcome: "approved",
        }),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          taskId: "task-2",
          agentId: "Backend Specialist",
          summary: "Refined route validation",
          outcome: "approved",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const task: NewTaskInput = {
      title: "Create API endpoint",
      typeHint: "Feature",
      project: "sample",
      rawRequest: "Implement a backend endpoint for auth token refresh",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    };

    const decision = await routeByCapabilities({
      task,
      projectProfile: buildProjectProfile(),
      modelSuggestedAgent: "Unknown Agent",
    });

    expect(decision.selected.agentName).toBe("Backend Specialist");
    expect(decision.selected.requestFileName).toBe("custom-backend-specialist.request.json");
    expect(decision.selected.source).toBe("custom");
  });

  it("keeps dispatcher model intent as a routing hint when capabilities are close", async () => {
    const task: NewTaskInput = {
      title: "UI polish",
      typeHint: "Feature",
      project: "sample",
      rawRequest: "Improve the dashboard layout and button interactions",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    };

    const decision = await routeByCapabilities({
      task,
      projectProfile: buildProjectProfile({ detectedFrameworks: ["React"] }),
      modelSuggestedAgent: "Synx Front Expert",
    });

    expect(decision.selected.agentName).toBe("Synx Front Expert");
    expect(decision.selected.requestFileName).toBe("04-synx-front-expert.request.json");
  });
});
