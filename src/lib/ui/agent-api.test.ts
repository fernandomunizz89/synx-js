import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import type { NewTaskInput } from "../types.js";
import { startUiServer } from "./server.js";

const originalCwd = process.cwd();
const originalAgentToken = process.env.SYNX_AGENT_TOKEN;

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "agent-api-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-agent-api-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-agent-api-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("ui/agent-api", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
    delete process.env.SYNX_AGENT_TOKEN;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalAgentToken) process.env.SYNX_AGENT_TOKEN = originalAgentToken;
    else delete process.env.SYNX_AGENT_TOKEN;
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("serves core read routes for agent and nemo APIs", async () => {
    const parent = await createTask({
      ...baseTaskInput("Parent project"),
      typeHint: "Project",
    }, {
      sourceKind: "project-intake",
    });
    const parentMeta = await loadTaskMeta(parent.taskId);
    parentMeta.sourceKind = "project-intake";
    parentMeta.type = "Project";
    parentMeta.rootProjectId = parent.taskId;
    await saveTaskMeta(parent.taskId, parentMeta);

    const child = await createTask(baseTaskInput("Child subtask"), {
      sourceKind: "project-subtask",
      parentTaskId: parent.taskId,
      rootProjectId: parent.taskId,
      dependsOn: [],
      blockedBy: [],
      priority: 3,
      parallelizable: true,
      ownershipBoundaries: ["src/features/auth"],
      mergeStrategy: "auto-rebase",
    });
    const childMeta = await loadTaskMeta(child.taskId);
    childMeta.status = "waiting_human";
    childMeta.humanApprovalRequired = true;
    await saveTaskMeta(child.taskId, childMeta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const statusRes = await fetch(`${server.baseUrl}/api/v1/agent/status`);
      expect(statusRes.status).toBe(200);
      const statusPayload = await statusRes.json() as { ok: boolean; observation?: { message?: string } };
      expect(statusPayload.ok).toBe(true);
      expect(statusPayload.observation?.message).toBe("System status.");

      const toolsRes = await fetch(`${server.baseUrl}/api/v1/agent/tools`);
      expect(toolsRes.status).toBe(200);
      const toolsPayload = await toolsRes.json() as { ok: boolean; data: unknown[] };
      expect(toolsPayload.ok).toBe(true);
      expect(toolsPayload.data).toHaveLength(7);

      const openApiRes = await fetch(`${server.baseUrl}/api/v1/agent/openapi.json`);
      expect(openApiRes.status).toBe(200);
      const openApiPayload = await openApiRes.json() as { paths?: Record<string, unknown> };
      expect(openApiPayload.paths).toBeDefined();

      const listRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks`);
      expect(listRes.status).toBe(200);
      const listPayload = await listRes.json() as { ok: boolean; data: Array<{ taskId: string }> };
      expect(listPayload.ok).toBe(true);
      expect(listPayload.data.some((task) => task.taskId === child.taskId)).toBe(true);

      const pendingReviewRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks/pending-review`);
      expect(pendingReviewRes.status).toBe(200);
      const pendingReviewPayload = await pendingReviewRes.json() as { ok: boolean; data: Array<{ taskId: string }> };
      expect(pendingReviewPayload.ok).toBe(true);
      expect(pendingReviewPayload.data.some((task) => task.taskId === child.taskId)).toBe(true);

      const taskRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(child.taskId)}`);
      expect(taskRes.status).toBe(200);
      const taskPayload = await taskRes.json() as { ok: boolean; observation?: { taskId?: string } };
      expect(taskPayload.ok).toBe(true);
      expect(taskPayload.observation?.taskId).toBe(child.taskId);

      const graphRes = await fetch(`${server.baseUrl}/api/v1/agent/projects/${encodeURIComponent(parent.taskId)}/graph`);
      expect(graphRes.status).toBe(200);
      const graphPayload = await graphRes.json() as {
        ok: boolean;
        data?: { nodes?: Array<{ taskId: string }>; edges?: unknown[] };
      };
      expect(graphPayload.ok).toBe(true);
      expect(Array.isArray(graphPayload.data?.nodes)).toBe(true);
      expect(graphPayload.data?.nodes?.some((node) => node.taskId === child.taskId)).toBe(true);
      expect(Array.isArray(graphPayload.data?.edges)).toBe(true);

      const webhookContractRes = await fetch(`${server.baseUrl}/api/v1/agent/contracts/webhooks`);
      expect(webhookContractRes.status).toBe(200);
      const webhookContractPayload = await webhookContractRes.json() as { ok: boolean; data?: { events?: string[] } };
      expect(webhookContractPayload.ok).toBe(true);
      expect(Array.isArray(webhookContractPayload.data?.events)).toBe(true);

      const eventsContractRes = await fetch(`${server.baseUrl}/api/v1/agent/contracts/events`);
      expect(eventsContractRes.status).toBe(200);
      const eventsContractPayload = await eventsContractRes.json() as { ok: boolean; data?: { streamFile?: string } };
      expect(eventsContractPayload.ok).toBe(true);
      expect(eventsContractPayload.data?.streamFile).toContain("runtime-events.jsonl");

      const recentEventsRes = await fetch(`${server.baseUrl}/api/v1/agent/events/recent?limit=5`);
      expect(recentEventsRes.status).toBe(200);
      const recentEventsPayload = await recentEventsRes.json() as { ok: boolean; data?: { events?: unknown[] } };
      expect(recentEventsPayload.ok).toBe(true);
      expect(Array.isArray(recentEventsPayload.data?.events)).toBe(true);

      const nemoActionsRes = await fetch(`${server.baseUrl}/api/v1/nemo/actions`);
      expect(nemoActionsRes.status).toBe(200);
      const nemoActionsPayload = await nemoActionsRes.json() as { ok: boolean; data: unknown[] };
      expect(nemoActionsPayload.ok).toBe(true);
      expect(nemoActionsPayload.data).toHaveLength(7);

      const colangRes = await fetch(`${server.baseUrl}/api/v1/nemo/actions/colang-sample`);
      expect(colangRes.status).toBe(200);
      expect(colangRes.headers.get("content-type")).toContain("text/plain");
      expect(await colangRes.text()).toContain("define action synx_create_task");

      const backwardsCompatRes = await fetch(`${server.baseUrl}/api/health`);
      expect(backwardsCompatRes.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("enforces mutation guard in read-only mode", async () => {
    const waiting = await createTask(baseTaskInput("Needs review"));
    const waitingMeta = await loadTaskMeta(waiting.taskId);
    waitingMeta.status = "waiting_human";
    waitingMeta.humanApprovalRequired = true;
    await saveTaskMeta(waiting.taskId, waitingMeta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: false,
    });

    try {
      const createRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x", rawRequest: "y" }),
      });
      expect(createRes.status).toBe(405);

      const approveRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(waiting.taskId)}/approve`, {
        method: "POST",
      });
      expect(approveRes.status).toBe(405);

      const reproveRes = await fetch(`${server.baseUrl}/api/v1/agent/tasks/${encodeURIComponent(waiting.taskId)}/reprove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Needs updates" }),
      });
      expect(reproveRes.status).toBe(405);
    } finally {
      await server.close();
    }
  });

  it("returns zod issues for invalid task creation payload", async () => {
    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const res = await fetch(`${server.baseUrl}/api/v1/agent/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "", rawRequest: "valid request" }),
      });
      expect(res.status).toBe(400);
      const payload = await res.json() as { ok: boolean; issues?: unknown[] };
      expect(payload.ok).toBe(false);
      expect(Array.isArray(payload.issues)).toBe(true);
      expect(payload.issues?.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("enforces bearer auth when SYNX_AGENT_TOKEN is configured", async () => {
    process.env.SYNX_AGENT_TOKEN = "test-token";
    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const unauthorized = await fetch(`${server.baseUrl}/api/v1/agent/status`, {
        headers: { authorization: "Bearer wrong-token" },
      });
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(`${server.baseUrl}/api/v1/agent/status`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(authorized.status).toBe(200);
      const payload = await authorized.json() as { ok: boolean };
      expect(payload.ok).toBe(true);
    } finally {
      await server.close();
    }
  });
});
