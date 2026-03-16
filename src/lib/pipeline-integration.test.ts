import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES, STALE_LOCK_MINUTES } from "./constants.js";
import { createTask, loadTaskMeta } from "./task.js";
import { clearStaleLocks, recoverWorkingFiles } from "./runtime.js";
import { readJson, writeJson } from "./fs.js";
import { nowIso } from "./utils.js";
import type { NewTaskInput, StageEnvelope } from "./types.js";
import { WorkerBase } from "../workers/base.js";

const originalCwd = process.cwd();

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

class LifecycleWorker extends WorkerBase {
  readonly agent = "Dispatcher" as const;
  readonly requestFileName = STAGE_FILE_NAMES.dispatcher;
  readonly workingFileName = "00-dispatcher.working.json";

  protected async processTask(taskId: string, _request: StageEnvelope): Promise<void> {
    await this.finishStage({
      taskId,
      stage: "dispatcher",
      doneFileName: DONE_FILE_NAMES.dispatcher,
      viewFileName: "01-dispatcher.md",
      viewContent: "# Dispatcher handoff",
      output: {
        type: "Feature",
        goal: "Implement change",
        nextAgent: "Spec Planner",
      },
      nextAgent: "Spec Planner",
      nextStage: "planner",
      nextRequestFileName: STAGE_FILE_NAMES.planner,
      nextInputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
      startedAt: nowIso(),
      provider: "mock",
      model: "mock-v1",
    });
  }
}

describe.sequential("integration/pipeline-critical-scenarios", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-pipeline-integration-"));
    await fs.mkdir(path.join(root, ".ai-agents", "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, ".ai-agents", "runtime", "locks"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "synx-pipeline-it" }, null, 2), "utf8");
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("task lifecycle: request -> worker processing -> done + next handoff", async () => {
    const task = await createTask(baseTaskInput("Pipeline lifecycle"));
    const worker = new LifecycleWorker();

    const processed = await worker.tryProcess(task.taskId);
    expect(processed).toBe(true);

    const done = await readJson(path.join(task.taskPath, "done", DONE_FILE_NAMES.dispatcher));
    expect(done).toMatchObject({
      taskId: task.taskId,
      stage: "dispatcher",
      status: "done",
      agent: "Dispatcher",
    });

    const nextRequest = await readJson(path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.planner));
    expect(nextRequest).toMatchObject({
      taskId: task.taskId,
      stage: "planner",
      status: "request",
      agent: "Spec Planner",
      inputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
    });

    const meta = await loadTaskMeta(task.taskId);
    expect(meta.status).toBe("waiting_agent");
    expect(meta.currentAgent).toBe("Dispatcher");
    expect(meta.nextAgent).toBe("Spec Planner");
    expect(meta.history).toHaveLength(1);
  });

  it("lock recovery: clears stale lock records without touching healthy flow", async () => {
    const staleLockPath = path.join(root, ".ai-agents", "runtime", "locks", "orchestrator.lock");
    await writeJson(staleLockPath, {
      pid: 999999,
      createdAt: new Date(Date.now() - (STALE_LOCK_MINUTES + 1) * 60_000).toISOString(),
    });

    const cleared = await clearStaleLocks();
    expect(cleared).toHaveLength(1);
    await expect(fs.access(staleLockPath)).rejects.toThrow();
  });

  it("working recovery: requeues known working file and quarantines unknown one", async () => {
    const task = await createTask(baseTaskInput("Recover working files"));
    const workingDir = path.join(task.taskPath, "working");
    await fs.writeFile(path.join(workingDir, "04-builder.working.json"), "{\"ok\":true}", "utf8");
    await fs.writeFile(path.join(workingDir, "unknown.working.json"), "{\"ok\":false}", "utf8");

    const recovered = await recoverWorkingFiles();
    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: task.taskId, file: "04-builder.working.json", action: "requeued" }),
      expect.objectContaining({ taskId: task.taskId, file: "unknown.working.json", action: "moved_to_failed" }),
    ]));

    const requeued = await readJson(path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.builder));
    expect(requeued).toMatchObject({ ok: true });
  });
});
