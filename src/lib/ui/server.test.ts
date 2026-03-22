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
