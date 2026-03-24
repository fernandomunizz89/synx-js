import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectOrchestrator } from "./project-orchestrator.js";
import { createTask, loadTaskMeta } from "../lib/task.js";
import { readJson } from "../lib/fs.js";

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}));

// ProjectOrchestrator no longer calls generateStructured — provider is not used.
// We still mock the factory so the import resolves cleanly.
vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn().mockReturnValue({
    generateStructured: mocks.generateStructured,
  }),
}));

vi.mock("../lib/config.js", () => ({
  loadResolvedProjectConfig: vi.fn().mockResolvedValue({
    projectName: "test-app",
    language: "typescript",
    framework: "node",
    humanReviewer: "User",
    tasksDir: ".ai-agents/tasks",
    providers: { dispatcher: { type: "mock", model: "static-mock" } },
    agentProviders: {},
  }),
  resolveProviderConfigForAgent: vi.fn((config: any) => config.providers.dispatcher),
}));

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-project-orchestrator-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-project-orchestrator-test" }, null, 2),
    "utf8",
  );
  return { root, repoRoot };
}

describe.sequential("workers/project-orchestrator (intake-only)", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("picks up project-type task, writes done file, and queues product strategist — without calling LLM", async () => {
    const parent = await createTask({
      title: "Build complete MVP",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Build complete MVP with auth and dashboard",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const worker = new ProjectOrchestrator();
    const processed = await worker.tryProcess(parent.taskId);
    expect(processed).toBe(true);

    // No LLM call should happen during intake
    expect(mocks.generateStructured).not.toHaveBeenCalled();

    // Done file written
    const doneFile = path.join(parent.taskPath, "done", "00-project-orchestrator.done.json");
    const done = await readJson<{ output?: { stage?: string; title?: string } }>(doneFile);
    expect(done.output?.stage).toBe("intake");
    expect(done.output?.title).toBe("Build complete MVP");

    // Next inbox file queued for Synx Product Strategist
    const nextInbox = path.join(
      parent.taskPath, "inbox", "01-synx-product-strategist.request.json",
    );
    const nextEnvelope = await readJson<{ stage?: string; agent?: string }>(nextInbox);
    expect(nextEnvelope.stage).toBe("synx-product-strategist");
    expect(nextEnvelope.agent).toBe("Synx Product Strategist");

    // Task meta reflects in_progress (waiting for planning squad)
    const parentMeta = await loadTaskMeta(parent.taskId);
    expect(parentMeta.status).toBe("waiting_agent");
    expect(parentMeta.nextAgent).toBe("Synx Product Strategist");
  });

  it("view file summarises the planning chain", async () => {
    const parent = await createTask({
      title: "My Feature",
      typeHint: "Project",
      project: "platform",
      rawRequest: "Some request",
      extraContext: { relatedFiles: [], logs: [], notes: [] },
    });

    const worker = new ProjectOrchestrator();
    await worker.tryProcess(parent.taskId);

    const viewFile = path.join(parent.taskPath, "views", "00-project-orchestrator.view.md");
    const viewContent = await fs.readFile(viewFile, "utf8");
    expect(viewContent).toContain("Project Intake: My Feature");
    expect(viewContent).toContain("Synx Product Strategist");
    expect(viewContent).toContain("Synx Delivery Planner");
    expect(viewContent).toContain("Project Orchestrator (decompose)");
  });
});
