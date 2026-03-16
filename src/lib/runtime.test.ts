import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STAGE_FILE_NAMES, STALE_LOCK_MINUTES } from "./constants.js";
import { listFiles, readJson, writeJson } from "./fs.js";
import {
  acquireLock,
  clearStaleLocks,
  detectInterruptedTasks,
  detectStaleLocks,
  detectWorkingOrphans,
  processIsRunning,
  recoverInterruptedTasks,
  recoverWorkingFiles,
  releaseLock,
} from "./runtime.js";
import { loadTaskMeta, saveTaskMeta, createTask } from "./task.js";
import type { NewTaskInput } from "./types.js";

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-runtime-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-runtime-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("runtime", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("handles process checks and lock lifecycle", async () => {
    expect(processIsRunning(0)).toBe(false);
    expect(processIsRunning(-5)).toBe(false);
    expect(processIsRunning(process.pid)).toBe(true);

    expect(await acquireLock("test.lock")).toBe(true);
    expect(await acquireLock("test.lock")).toBe(false);
    await releaseLock("test.lock");
    expect(await acquireLock("test.lock")).toBe(true);
    await releaseLock("test.lock");
  });

  it("detects and clears stale locks by age/pid heuristics", async () => {
    const stalePath = path.join(fixture.repoRoot, ".ai-agents", "runtime", "locks", "stale.lock");
    const staleCreatedAt = new Date(Date.now() - (STALE_LOCK_MINUTES + 2) * 60_000).toISOString();
    await writeJson(stalePath, {
      pid: 999999,
      createdAt: staleCreatedAt,
    });

    const findings = await detectStaleLocks();
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: "stale.lock",
      }),
    ]));

    const cleared = await clearStaleLocks();
    expect(cleared).toHaveLength(findings.length);
    await expect(fs.access(stalePath)).rejects.toThrow();
  });

  it("detects and recovers orphaned working files", async () => {
    const task = await createTask(baseTaskInput("Recover orphan files"));
    const workingDir = path.join(task.taskPath, "working");
    const inboxDir = path.join(task.taskPath, "inbox");
    const failedDir = path.join(task.taskPath, "failed");

    await fs.writeFile(path.join(workingDir, "04-builder.working.json"), "{\"ok\":true}", "utf8");
    await fs.writeFile(path.join(workingDir, "mystery.working.json"), "{\"ok\":false}", "utf8");
    await fs.unlink(path.join(inboxDir, STAGE_FILE_NAMES.builder)).catch(() => undefined);

    const findings = await detectWorkingOrphans();
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: task.taskId, file: "04-builder.working.json", action: "requeued" }),
      expect.objectContaining({ taskId: task.taskId, file: "mystery.working.json", action: "moved_to_failed" }),
    ]));

    const recovered = await recoverWorkingFiles();
    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: task.taskId, file: "04-builder.working.json", action: "requeued" }),
      expect.objectContaining({ taskId: task.taskId, file: "mystery.working.json", action: "moved_to_failed" }),
    ]));

    const inboxFiles = await listFiles(inboxDir);
    const failedFiles = await listFiles(failedDir);
    expect(inboxFiles).toContain(STAGE_FILE_NAMES.builder);
    expect(failedFiles.some((name) => name.startsWith("mystery.working.json.orphaned-"))).toBe(true);
  });

  it("detects/requeues interrupted tasks and skips unsafe metadata states", async () => {
    const task = await createTask(baseTaskInput("Interrupted task"));
    const inboxDispatcher = path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher);
    await fs.unlink(inboxDispatcher);

    const detected = await detectInterruptedTasks();
    expect(detected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: task.taskId,
        action: "requeued",
        requestFile: STAGE_FILE_NAMES.dispatcher,
      }),
    ]));

    const recovered = await recoverInterruptedTasks();
    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: task.taskId,
        action: "requeued",
        requestFile: STAGE_FILE_NAMES.dispatcher,
      }),
    ]));
    const recreatedRequest = await readJson(path.join(task.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher));
    expect(recreatedRequest).toMatchObject({
      taskId: task.taskId,
      stage: "dispatcher",
      status: "request",
      agent: "Dispatcher",
      inputRef: "input/new-task.json",
    });
    const updatedMeta = await loadTaskMeta(task.taskId);
    expect(updatedMeta.status).toBe("waiting_agent");
    expect(updatedMeta.nextAgent).toBe("Dispatcher");

    const skippedTask = await createTask(baseTaskInput("Skip interrupted"));
    const skippedInbox = path.join(skippedTask.taskPath, "inbox", STAGE_FILE_NAMES.dispatcher);
    await fs.unlink(skippedInbox);
    const skippedMeta = await loadTaskMeta(skippedTask.taskId);
    skippedMeta.status = "waiting_agent";
    skippedMeta.nextAgent = "";
    await saveTaskMeta(skippedTask.taskId, skippedMeta);

    const skippedFindings = await detectInterruptedTasks();
    expect(skippedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: skippedTask.taskId,
        action: "skipped",
      }),
    ]));
  });
});
