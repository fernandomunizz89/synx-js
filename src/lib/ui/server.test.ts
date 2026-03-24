import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import type { NewTaskInput } from "../types.js";
import { startUiServer } from "./server.js";
import { writeJson } from "../fs.js";
import { globalConfigPath } from "../paths.js";

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

  it("Phase 3 — POST /api/tasks creates individual task and GET /api/tasks/:id/files lists artifacts", async () => {
    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      // POST /api/tasks — create individual task (pass project explicitly to skip config loading)
      const createRes = await fetch(`${server.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Fix login button focus ring",
          rawRequest: "The login button has no visible focus ring, failing WCAG 2.1 AA.",
          typeHint: "Bug",
          e2ePolicy: "skip",
          project: "phase3-test",
        }),
      });
      expect(createRes.status).toBe(200);
      const created = await createRes.json() as { ok: boolean; data: { taskId: string } };
      expect(created.ok).toBe(true);
      expect(typeof created.data.taskId).toBe("string");

      // Verify meta was written correctly
      const meta = await loadTaskMeta(created.data.taskId);
      expect(meta.title).toBe("Fix login button focus ring");
      expect(meta.type).toBe("Bug");

      // GET /api/tasks/:id/files — lists done/views/artifacts dirs
      const doneDir = path.join(fixture.repoRoot, ".ai-agents", "tasks", created.data.taskId, "done");
      await fs.mkdir(doneDir, { recursive: true });
      await writeJson(path.join(doneDir, "00-dispatcher.done.json"), { ok: true });

      const filesRes = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(created.data.taskId)}/files`);
      expect(filesRes.status).toBe(200);
      const filesPayload = await filesRes.json() as { ok: boolean; data: { done: string[]; views: string[]; artifacts: string[] } };
      expect(filesPayload.ok).toBe(true);
      expect(filesPayload.data.done).toContain("00-dispatcher.done.json");
      expect(Array.isArray(filesPayload.data.views)).toBe(true);
      expect(Array.isArray(filesPayload.data.artifacts)).toBe(true);

      // POST /api/tasks — missing title returns 400
      const badRes = await fetch(`${server.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawRequest: "no title here" }),
      });
      expect(badRes.status).toBe(400);

      // GET /api/config — returns global/local config (may be null if no config files)
      const cfgRes = await fetch(`${server.baseUrl}/api/config`);
      expect(cfgRes.status).toBe(200);
      const cfgPayload = await cfgRes.json() as { ok: boolean; data: { global: unknown; local: unknown } };
      expect(cfgPayload.ok).toBe(true);
      expect("global" in cfgPayload.data).toBe(true);
      expect("local" in cfgPayload.data).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("Phase 3 — POST /api/tasks blocked in read-only mode", async () => {
    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<html><body>ui</body></html>",
      enableMutations: false,
    });
    try {
      const res = await fetch(`${server.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "test", rawRequest: "test" }),
      });
      expect(res.status).toBe(405);
    } finally {
      await server.close();
    }
  });

  it("POST /api/project creates a project-intake parent task with project metadata", async () => {
    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const res = await fetch(`${server.baseUrl}/api/project`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Build an MVP with auth, billing, and dashboard" }),
      });
      expect(res.status).toBe(200);
      const payload = await res.json() as { ok: boolean; data: { taskId: string } };
      expect(payload.ok).toBe(true);

      const meta = await loadTaskMeta(payload.data.taskId);
      expect(meta.type).toBe("Project");
      expect(meta.sourceKind).toBe("project-intake");
      expect(meta.rootProjectId).toBe(payload.data.taskId);
      expect(meta.parentTaskId).toBeUndefined();
      expect(meta.nextAgent).toBe("Project Orchestrator");
    } finally {
      await server.close();
    }
  });

  it("POST /api/provider-health returns provider health data", async () => {
    // loadGlobalConfig() reads from ~/.ai-agents/config.json (not the fixture dir).
    // Back up the real file, write a valid test fixture, and restore afterward.
    const realGlobalPath = globalConfigPath();
    let priorGlobalConfig: string | null = null;
    try { priorGlobalConfig = await fs.readFile(realGlobalPath, "utf8"); } catch { /* didn't exist on this machine */ }
    await fs.mkdir(path.dirname(realGlobalPath), { recursive: true });
    await writeJson(realGlobalPath, {
      providers: { dispatcher: { type: "mock", model: "mock-dispatcher-v1" } },
      defaults: { humanReviewer: "test" },
    });

    const configPath = path.join(fixture.repoRoot, ".ai-agents", "config");
    await fs.mkdir(configPath, { recursive: true });
    await writeJson(path.join(configPath, "project.json"), {
      projectName: "test-project",
      language: "TypeScript",
      framework: "Node.js",
      humanReviewer: "test",
      tasksDir: ".ai-agents/tasks",
    });

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<html><body>ui</body></html>",
      enableMutations: false,
    });

    try {
      const res = await fetch(`${server.baseUrl}/api/provider-health`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const payload = await res.json() as { ok: boolean; data: { dispatcher?: { reachable: boolean; latencyMs?: number; message: string } } };
      expect(payload.ok).toBe(true);
      expect(payload.data.dispatcher).toBeDefined();
      expect(payload.data.dispatcher?.reachable).toBe(true);
      expect(typeof payload.data.dispatcher?.latencyMs).toBe("number");
    } finally {
      await server.close();
      // Restore the real global config to the state it was in before this test
      if (priorGlobalConfig !== null) {
        await fs.writeFile(realGlobalPath, priorGlobalConfig, "utf8");
      } else {
        await fs.unlink(realGlobalPath).catch(() => {});
      }
    }
  });
});
