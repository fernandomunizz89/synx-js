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
    project: "ui-contract-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-contract-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-contract-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

async function expectSuccessEnvelope(response: Response): Promise<void> {
  expect(response.status).toBe(200);
  const payload = await response.json() as { ok?: boolean; data?: unknown };
  expect(payload.ok).toBe(true);
  expect("data" in payload).toBe(true);
}

describe.sequential("lib/ui/server contract", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("returns stable envelopes on core read routes and mutation errors", async () => {
    const task = await createTask(baseTaskInput("Contract task"));
    const meta = await loadTaskMeta(task.taskId);
    meta.status = "waiting_human";
    meta.humanApprovalRequired = true;
    await saveTaskMeta(task.taskId, meta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: false,
    });

    try {
      for (const route of [
        "/api/health",
        "/api/overview",
        "/api/tasks",
        `/api/tasks/${encodeURIComponent(task.taskId)}`,
        "/api/review-queue",
        "/api/metrics/overview",
        "/api/metrics/tasks",
        "/api/metrics/agents",
        "/api/metrics/projects",
        "/api/metrics/timeline",
        "/api/metrics/advanced",
      ]) {
        await expectSuccessEnvelope(await fetch(`${server.baseUrl}${route}`));
      }

      const missingTask = await fetch(`${server.baseUrl}/api/tasks/task-missing`);
      expect(missingTask.status).toBe(404);
      const missingTaskPayload = await missingTask.json() as { ok?: boolean; error?: unknown };
      expect(missingTaskPayload.ok).toBe(false);
      expect(typeof missingTaskPayload.error).toBe("string");

      const readOnlyApprove = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(task.taskId)}/approve`, {
        method: "POST",
      });
      expect(readOnlyApprove.status).toBe(405);
      const readOnlyPayload = await readOnlyApprove.json() as { ok?: boolean; error?: unknown };
      expect(readOnlyPayload.ok).toBe(false);
      expect(typeof readOnlyPayload.error).toBe("string");

      const readOnlyStatusCommand = await fetch(`${server.baseUrl}/api/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: "status", mode: "command" }),
      });
      expect(readOnlyStatusCommand.status).toBe(200);
      const statusPayload = await readOnlyStatusCommand.json() as { ok?: boolean; data?: { parsedKind?: string } };
      expect(statusPayload.ok).toBe(true);
      expect(statusPayload.data?.parsedKind).toBe("status");

      const readOnlyMutatingCommand = await fetch(`${server.baseUrl}/api/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: "new \"Read-only mutation\" --type Feature", mode: "command" }),
      });
      expect(readOnlyMutatingCommand.status).toBe(405);
      const mutatingPayload = await readOnlyMutatingCommand.json() as { ok?: boolean; error?: unknown };
      expect(mutatingPayload.ok).toBe(false);
      expect(typeof mutatingPayload.error).toBe("string");
    } finally {
      await server.close();
    }
  });
});
