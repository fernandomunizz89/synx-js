import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allTaskIds, createTask, finalizeForHumanReview, latestTaskId, loadTaskMeta, writeView } from "./task.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "./constants.js";
import { readJson, writeJson } from "./fs.js";
import type { NewTaskInput, StageEnvelope } from "./types.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "demo-project",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-task-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-task-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("task", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("creates task structure, metadata and first dispatcher request for non-project tasks", async () => {
    const created = await createTask(baseTaskInput("Increase title font size"));
    const meta = await loadTaskMeta(created.taskId);
    const dispatcherRequest = await readJson(path.join(created.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher));

    expect(created.taskId).toMatch(/^task-\d{4}-\d{2}-\d{2}-[a-z0-9]{4}-increase-title-font-size$/);
    expect(meta.status).toBe("new");
    expect(meta.currentStage).toBe("submitted");
    expect(meta.nextAgent).toBe("Dispatcher");
    expect(meta.sourceKind).toBe("standalone");
    expect(meta.rootProjectId).toBe(created.taskId);
    expect(meta.parentTaskId).toBeUndefined();
    expect(meta.dependsOn).toEqual([]);
    expect(meta.blockedBy).toEqual([]);
    expect(meta.priority).toBe(3);
    expect(meta.parallelizable).toBe(true);
    expect(meta.mergeStrategy).toBe("auto-rebase");
    expect(meta.ownershipBoundaries).toEqual([]);
    expect(dispatcherRequest).toMatchObject({
      taskId: created.taskId,
      stage: "dispatcher",
      status: "request",
      agent: "Dispatcher",
      inputRef: "input/new-task.json",
    });

    for (const dir of ["input", "inbox", "working", "done", "failed", "human", "artifacts", "logs", "views"]) {
      const dirPath = path.join(created.taskPath, dir);
      expect((await fs.stat(dirPath)).isDirectory()).toBe(true);
    }
  });

  it("routes project tasks to project orchestrator as the first stage", async () => {
    const created = await createTask({
      ...baseTaskInput("Build MVP from brief"),
      typeHint: "Project",
    });
    const meta = await loadTaskMeta(created.taskId);
    const orchestratorRequest = await readJson(path.join(created.taskPath, "inbox", STAGE_FILE_NAMES.projectOrchestrator));

    expect(meta.nextAgent).toBe("Project Orchestrator");
    expect(meta.sourceKind).toBe("project-intake");
    expect(meta.rootProjectId).toBe(created.taskId);
    expect(meta.parentTaskId).toBeUndefined();
    expect(orchestratorRequest).toMatchObject({
      taskId: created.taskId,
      stage: "project-orchestrator",
      status: "request",
      agent: "Project Orchestrator",
      inputRef: "input/new-task.json",
    });
  });

  it("stores explicit parent/root relationship metadata for project subtasks", async () => {
    const parent = await createTask({
      ...baseTaskInput("Parent project"),
      typeHint: "Project",
    });
    const child = await createTask(baseTaskInput("Implement module"), {
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
      dependsOn: [parent.taskId],
      priority: 5,
      milestone: "MVP",
      parallelizable: false,
      mergeStrategy: "manual-review",
      ownershipBoundaries: ["src/modules/payments", "src/modules/payments/api.ts"],
    });

    const childMeta = await loadTaskMeta(child.taskId);
    expect(childMeta.sourceKind).toBe("project-subtask");
    expect(childMeta.parentTaskId).toBe(parent.taskId);
    expect(childMeta.rootProjectId).toBe(parent.taskId);
    expect(childMeta.dependsOn).toEqual([parent.taskId]);
    expect(childMeta.blockedBy).toEqual([parent.taskId]);
    expect(childMeta.priority).toBe(5);
    expect(childMeta.milestone).toBe("MVP");
    expect(childMeta.parallelizable).toBe(false);
    expect(childMeta.mergeStrategy).toBe("manual-review");
    expect(childMeta.ownershipBoundaries).toEqual(["src/modules/payments", "src/modules/payments/api.ts"]);
  });

  it("normalizes legacy/system agent names when loading task metadata", async () => {
    const { taskId, taskPath } = await createTask(baseTaskInput("Legacy normalize"));
    const metaPath = path.join(taskPath, "meta.json");
    const currentMeta = await readJson<Record<string, unknown>>(metaPath);

    await writeJson(metaPath, {
      ...currentMeta,
      currentAgent: "System",
      nextAgent: "[none]",
      history: [{
        stage: "review",
        agent: "System",
        startedAt: "2026-03-16T00:00:00.000Z",
        endedAt: "2026-03-16T00:00:01.000Z",
        durationMs: 1000,
        status: "done",
      }],
    });

    const normalized = await loadTaskMeta(taskId);
    expect(normalized.currentAgent).toBe("");
    expect(normalized.nextAgent).toBe("");
    expect(normalized.history[0]?.agent).toBe("Human Review");
  });

  it("lists task ids, resolves latest task and writes views/human-review requests", async () => {
    const first = await createTask(baseTaskInput("First task"));
    const second = await createTask(baseTaskInput("Second task"));
    const sentinel = "task-9999-12-31-zzzz-latest";
    await fs.mkdir(path.join(fixture.repoRoot, ".ai-agents", "tasks", sentinel), { recursive: true });

    const ids = await allTaskIds();
    expect(ids).toContain(first.taskId);
    expect(ids).toContain(second.taskId);
    expect(await latestTaskId()).toBe(sentinel);

    await writeView(second.taskId, "99-test-view.md", "# hello");
    const viewContent = await fs.readFile(path.join(second.taskPath, "views", "99-test-view.md"), "utf8");
    expect(viewContent).toBe("# hello");

    await writeJson(path.join(second.taskPath, "done", DONE_FILE_NAMES.synxQaEngineer), { ok: true });
    
    await finalizeForHumanReview(second.taskId);

    const req = await readJson<StageEnvelope>(path.join(second.taskPath, "human", "90-final-review.request.json"));
    expect(req).toMatchObject({
      taskId: second.taskId,
      stage: "human-review",
      status: "request",
    });
  });
});
