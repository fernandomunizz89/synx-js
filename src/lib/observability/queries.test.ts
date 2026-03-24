import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import { writeJson, writeText } from "../fs.js";
import { taskDir, runtimeDir } from "../paths.js";
import { requestTaskCancel } from "../task-cancel.js";
import type { NewTaskInput, TaskMetaHistoryItem } from "../types.js";
import { getOverview, getTaskDetail, listReviewQueue, listTaskSummaries, readRuntimeStatus } from "./queries.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "obs-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

function historyRow(args: {
  stage: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}): TaskMetaHistoryItem {
  return {
    stage: args.stage,
    agent: args.agent,
    startedAt: "2026-03-22T10:00:00.000Z",
    endedAt: "2026-03-22T10:00:01.000Z",
    durationMs: 1000,
    status: "done",
    estimatedInputTokens: args.inputTokens,
    estimatedOutputTokens: args.outputTokens,
    estimatedCostUsd: args.cost,
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-observability-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-observability-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/observability/queries", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("summarizes overview counts and consumption from task metadata", async () => {
    const first = await createTask(baseTaskInput("First task"));
    const second = await createTask(baseTaskInput("Second task"));

    const firstMeta = await loadTaskMeta(first.taskId);
    firstMeta.status = "waiting_human";
    firstMeta.humanApprovalRequired = true;
    firstMeta.history = [
      historyRow({ stage: "dispatcher", agent: "Dispatcher", inputTokens: 100, outputTokens: 25, cost: 0.01 }),
      historyRow({ stage: "synx-front-expert", agent: "Synx Front Expert", inputTokens: 500, outputTokens: 200, cost: 0.08 }),
    ];
    await saveTaskMeta(first.taskId, firstMeta);

    const secondMeta = await loadTaskMeta(second.taskId);
    secondMeta.status = "done";
    secondMeta.history = [
      historyRow({ stage: "dispatcher", agent: "Dispatcher", inputTokens: 40, outputTokens: 10, cost: 0.005 }),
    ];
    await saveTaskMeta(second.taskId, secondMeta);

    const runtimeStatePath = path.join(runtimeDir(), "daemon-state.json");
    await writeJson(runtimeStatePath, {
      pid: process.pid,
      lastHeartbeatAt: "2026-03-22T11:00:00.000Z",
      loop: 42,
      taskCount: 2,
      activeTaskCount: 1,
      workerCount: 7,
    });

    const summaries = await listTaskSummaries();
    expect(summaries).toHaveLength(2);

    const reviewQueue = await listReviewQueue();
    expect(reviewQueue).toHaveLength(1);
    expect(reviewQueue[0]?.taskId).toBe(first.taskId);

    const overview = await getOverview();
    expect(overview.runtime.isAlive).toBe(true);
    expect(overview.counts.total).toBe(2);
    expect(overview.counts.waitingHuman).toBe(1);
    expect(overview.counts.done).toBe(1);
    expect(overview.reviewQueueCount).toBe(1);
    expect(overview.consumption.estimatedInputTokens).toBe(640);
    expect(overview.consumption.estimatedOutputTokens).toBe(235);
    expect(overview.consumption.estimatedTotalTokens).toBe(875);
    expect(overview.consumption.estimatedCostUsd).toBeCloseTo(0.095, 6);
  });

  it("returns task detail with artifacts, events and cancel request", async () => {
    const created = await createTask(baseTaskInput("Detail task"));
    const base = taskDir(created.taskId);

    await writeText(path.join(base, "views", "01-summary.md"), "# Detail");
    await writeText(path.join(base, "artifacts", "result.json"), "{}");
    await writeText(path.join(base, "done", "07-qa.done.json"), "{}");
    await writeText(path.join(base, "human", "90-final-review.request.json"), "{}");
    await writeText(path.join(base, "logs", "events.log"), "event one\nevent two\n");
    await requestTaskCancel({ taskId: created.taskId, reason: "Stop now" });

    const detail = await getTaskDetail(created.taskId);
    expect(detail).not.toBeNull();
    expect(detail?.views).toContain("01-summary.md");
    expect(detail?.artifacts).toContain("result.json");
    expect(detail?.doneArtifacts).toContain("07-qa.done.json");
    expect(detail?.humanArtifacts).toContain("90-final-review.request.json");
    expect(detail?.recentEvents).toEqual(["event one", "event two"]);
    expect(detail?.cancelRequest?.reason).toBe("Stop now");
    expect(detail?.rawRequest).toBe("Detail task");
  });

  it("maps parent/child project relationships in summaries and task detail", async () => {
    const parent = await createTask({
      ...baseTaskInput("Build project MVP"),
      typeHint: "Project",
    });
    const child = await createTask(baseTaskInput("Implement API"), {
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
    });

    const summaries = await listTaskSummaries();
    const parentSummary = summaries.find((item) => item.taskId === parent.taskId);
    const childSummary = summaries.find((item) => item.taskId === child.taskId);

    expect(parentSummary?.sourceKind).toBe("project-intake");
    expect(parentSummary?.childTaskIds).toContain(child.taskId);
    expect(parentSummary?.rootProjectId).toBe(parent.taskId);
    expect(parentSummary?.projectProgress?.totalChildren).toBe(1);

    expect(childSummary?.sourceKind).toBe("project-subtask");
    expect(childSummary?.parentTaskId).toBe(parent.taskId);
    expect(childSummary?.rootProjectId).toBe(parent.taskId);
    expect(childSummary?.ready).toBe(true);
    expect(childSummary?.blockedBy).toEqual([]);

    const parentDetail = await getTaskDetail(parent.taskId);
    expect(parentDetail?.childTasks.map((entry) => entry.taskId)).toContain(child.taskId);
  });

  it("surfaces blocked dependencies in task summaries", async () => {
    const parent = await createTask({
      ...baseTaskInput("Dependency project"),
      typeHint: "Project",
    });
    const firstChild = await createTask(baseTaskInput("First implementation task"), {
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
    });
    await createTask(baseTaskInput("Second implementation task"), {
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
      dependsOn: [firstChild.taskId],
    });

    const summaries = await listTaskSummaries();
    const secondChildSummary = summaries.find((item) => item.title === "Second implementation task");
    expect(secondChildSummary?.dependsOn).toEqual([firstChild.taskId]);
    expect(secondChildSummary?.blockedBy).toEqual([firstChild.taskId]);
    expect(secondChildSummary?.ready).toBe(false);
  });

  it("returns runtime as not alive when daemon state is absent", async () => {
    const runtime = await readRuntimeStatus();
    expect(runtime.isAlive).toBe(false);
  });
});
