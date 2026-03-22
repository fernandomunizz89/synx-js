import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import type { NewTaskInput } from "../types.js";
import { startUiServer } from "./server.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "ui-api-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-server-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-server-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/ui/server", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("serves read-only observability routes and blocks mutations in phase 1 mode", async () => {
    const created = await createTask(baseTaskInput("Server route test"));
    const meta = await loadTaskMeta(created.taskId);
    meta.status = "waiting_human";
    meta.humanApprovalRequired = true;
    await saveTaskMeta(created.taskId, meta);
    await fs.mkdir(path.join(created.taskPath, "done"), { recursive: true });
    await fs.writeFile(path.join(created.taskPath, "done", "sample.json"), '{\"ok\":true}\\n', "utf8");

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: false,
    });

    try {
      const rootResponse = await fetch(`${server.baseUrl}/`);
      expect(rootResponse.status).toBe(200);
      expect(await rootResponse.text()).toContain("ui");

      const reactAssetResponse = await fetch(`${server.baseUrl}/ui-assets/task-assistant.react.js`);
      expect([200, 404]).toContain(reactAssetResponse.status);

      const overviewResponse = await fetch(`${server.baseUrl}/api/overview`);
      expect(overviewResponse.status).toBe(200);
      const overview = await overviewResponse.json() as { ok: boolean; data: { counts: { total: number } } };
      expect(overview.ok).toBe(true);
      expect(overview.data.counts.total).toBe(1);

      const reviewQueueResponse = await fetch(`${server.baseUrl}/api/review-queue`);
      expect(reviewQueueResponse.status).toBe(200);
      const reviewQueue = await reviewQueueResponse.json() as { ok: boolean; data: Array<{ taskId: string }> };
      expect(reviewQueue.ok).toBe(true);
      expect(reviewQueue.data[0]?.taskId).toBe(created.taskId);

      const taskDetailResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(created.taskId)}`);
      expect(taskDetailResponse.status).toBe(200);
      const taskDetail = await taskDetailResponse.json() as { ok: boolean; data: { taskId: string } };
      expect(taskDetail.ok).toBe(true);
      expect(taskDetail.data.taskId).toBe(created.taskId);

      const artifactResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(created.taskId)}/artifact?scope=done&name=sample.json`);
      expect(artifactResponse.status).toBe(200);
      const artifactPayload = await artifactResponse.json() as { ok: boolean; data: { name: string; content: string } };
      expect(artifactPayload.ok).toBe(true);
      expect(artifactPayload.data.name).toBe("sample.json");
      expect(artifactPayload.data.content).toContain("\"ok\":true");

      const tasksMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/tasks`);
      expect(tasksMetricsResponse.status).toBe(200);
      const tasksMetrics = await tasksMetricsResponse.json() as { ok: boolean; data: unknown[] };
      expect(tasksMetrics.ok).toBe(true);
      expect(Array.isArray(tasksMetrics.data)).toBe(true);

      const agentsMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/agents`);
      expect(agentsMetricsResponse.status).toBe(200);
      const agentsMetrics = await agentsMetricsResponse.json() as { ok: boolean; data: unknown[] };
      expect(agentsMetrics.ok).toBe(true);
      expect(Array.isArray(agentsMetrics.data)).toBe(true);

      const projectsMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/projects`);
      expect(projectsMetricsResponse.status).toBe(200);
      const projectsMetrics = await projectsMetricsResponse.json() as { ok: boolean; data: unknown[] };
      expect(projectsMetrics.ok).toBe(true);
      expect(Array.isArray(projectsMetrics.data)).toBe(true);

      const timelineMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/timeline`);
      expect(timelineMetricsResponse.status).toBe(200);
      const timelineMetrics = await timelineMetricsResponse.json() as { ok: boolean; data: unknown[] };
      expect(timelineMetrics.ok).toBe(true);
      expect(Array.isArray(timelineMetrics.data)).toBe(true);

      const advancedMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/advanced`);
      expect(advancedMetricsResponse.status).toBe(200);
      const advancedMetrics = await advancedMetricsResponse.json() as { ok: boolean; data: { tasks?: unknown[]; agents?: unknown[]; projects?: unknown[] } };
      expect(advancedMetrics.ok).toBe(true);
      expect(Array.isArray(advancedMetrics.data.tasks)).toBe(true);
      expect(Array.isArray(advancedMetrics.data.agents)).toBe(true);
      expect(Array.isArray(advancedMetrics.data.projects)).toBe(true);

      const operationalMetricsResponse = await fetch(`${server.baseUrl}/api/metrics/operational?days=7`);
      expect(operationalMetricsResponse.status).toBe(200);
      const operationalMetrics = await operationalMetricsResponse.json() as {
        ok: boolean;
        data: {
          trend?: unknown[];
          agentBreakdown?: unknown[];
          flowMetrics?: { cycleTimeAvgMs?: number };
          reliability?: { reviewSlaAvgMs?: number };
        };
      };
      expect(operationalMetrics.ok).toBe(true);
      expect(Array.isArray(operationalMetrics.data.trend)).toBe(true);
      expect(Array.isArray(operationalMetrics.data.agentBreakdown)).toBe(true);
      expect(typeof operationalMetrics.data.flowMetrics?.cycleTimeAvgMs).toBe("number");
      expect(typeof operationalMetrics.data.reliability?.reviewSlaAvgMs).toBe("number");

      const streamController = new AbortController();
      const streamResponse = await fetch(`${server.baseUrl}/api/stream`, {
        signal: streamController.signal,
      });
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
      const reader = streamResponse.body?.getReader();
      const firstChunk = reader ? await reader.read() : { value: undefined };
      const decoded = firstChunk.value ? new TextDecoder().decode(firstChunk.value) : "";
      expect(decoded).toContain("event: runtime.updated");
      streamController.abort();

      const approveResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(created.taskId)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(approveResponse.status).toBe(405);
    } finally {
      await server.close();
    }
  });
});
