import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import { recordLearning } from "../learnings.js";
import type { NewTaskInput, TaskMetaHistoryItem } from "../types.js";
import {
  getAdvancedAnalyticsReport,
  getAgentConsumptionRanking,
  getMetricsTimeline,
  getProjectConsumptionRanking,
  getTaskConsumptionRanking,
} from "./analytics.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string, project: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project,
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
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  endedAt: string;
}): TaskMetaHistoryItem {
  const endedMs = Date.parse(args.endedAt);
  const startedAt = new Date(endedMs - args.durationMs).toISOString();
  return {
    stage: args.stage,
    agent: args.agent,
    startedAt,
    endedAt: args.endedAt,
    durationMs: args.durationMs,
    status: "done",
    estimatedInputTokens: args.inputTokens,
    estimatedOutputTokens: args.outputTokens,
    estimatedCostUsd: args.cost,
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-observability-analytics-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-observability-analytics-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/observability/analytics", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("builds ranking by task, agent, project and timeline", async () => {
    const expensive = await createTask(baseTaskInput("Expensive task", "project-red"));
    const affordable = await createTask(baseTaskInput("Affordable task", "project-blue"));

    const expensiveMeta = await loadTaskMeta(expensive.taskId);
    expensiveMeta.status = "waiting_human";
    expensiveMeta.humanApprovalRequired = true;
    expensiveMeta.history = [
      historyRow({
        stage: "synx-front-expert",
        agent: "Synx Front Expert",
        durationMs: 5000,
        inputTokens: 900,
        outputTokens: 300,
        cost: 0.22,
        endedAt: "2026-03-21T10:10:00.000Z",
      }),
      historyRow({
        stage: "synx-qa-engineer",
        agent: "Synx QA Engineer",
        durationMs: 2500,
        inputTokens: 300,
        outputTokens: 100,
        cost: 0.08,
        endedAt: "2026-03-21T10:20:00.000Z",
      }),
      historyRow({
        stage: "synx-qa-engineer",
        agent: "Synx QA Engineer",
        durationMs: 2100,
        inputTokens: 120,
        outputTokens: 50,
        cost: 0.03,
        endedAt: "2026-03-21T10:30:00.000Z",
      }),
    ];
    await saveTaskMeta(expensive.taskId, expensiveMeta);

    const affordableMeta = await loadTaskMeta(affordable.taskId);
    affordableMeta.status = "done";
    affordableMeta.history = [
      historyRow({
        stage: "synx-back-expert",
        agent: "Synx Back Expert",
        durationMs: 1700,
        inputTokens: 120,
        outputTokens: 60,
        cost: 0.015,
        endedAt: "2026-03-22T09:00:00.000Z",
      }),
    ];
    await saveTaskMeta(affordable.taskId, affordableMeta);

    await recordLearning({
      timestamp: "2026-03-22T09:10:00.000Z",
      taskId: expensive.taskId,
      agentId: "Synx QA Engineer",
      summary: "Fixed review issues",
      outcome: "approved",
    });
    await recordLearning({
      timestamp: "2026-03-22T09:11:00.000Z",
      taskId: expensive.taskId,
      agentId: "Synx QA Engineer",
      summary: "Missed acceptance criteria",
      outcome: "reproved",
      reproveReason: "Missing tests",
    });

    const taskRanking = await getTaskConsumptionRanking();
    expect(taskRanking[0]?.taskId).toBe(expensive.taskId);
    expect(taskRanking[0]?.qaLoopCount).toBe(1);

    const agentRanking = await getAgentConsumptionRanking();
    const qaAgent = agentRanking.find((row) => row.agent === "Synx QA Engineer");
    expect(qaAgent).toBeDefined();
    expect(qaAgent?.approvedCount).toBe(1);
    expect(qaAgent?.reprovedCount).toBe(1);
    expect(qaAgent?.approvalRate).toBe(0.5);

    const projectRanking = await getProjectConsumptionRanking();
    expect(projectRanking[0]?.project).toBe("project-red");
    expect(projectRanking.some((row) => row.project === "project-blue")).toBe(true);

    const timeline = await getMetricsTimeline(30);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline.some((row) => row.date === "2026-03-21")).toBe(true);

    const report = await getAdvancedAnalyticsReport({ limit: 10, days: 30 });
    expect(report.tasks.length).toBeGreaterThan(0);
    expect(report.agents.length).toBeGreaterThan(0);
    expect(report.projects.length).toBeGreaterThan(0);
    expect(report.timeline.length).toBeGreaterThan(0);
    expect(report.qaLoops.tasksWithQa).toBeGreaterThan(0);
  });
});
