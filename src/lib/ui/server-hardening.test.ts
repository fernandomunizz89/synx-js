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
    project: "ui-hardening-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-hardening-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-hardening-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/ui/server hardening", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("returns stable API errors for invalid payloads and unknown task ids", async () => {
    const waitingTask = await createTask(baseTaskInput("Waiting task for invalid JSON"));
    const waitingMeta = await loadTaskMeta(waitingTask.taskId);
    waitingMeta.status = "waiting_human";
    waitingMeta.humanApprovalRequired = true;
    await saveTaskMeta(waitingTask.taskId, waitingMeta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const unknownApprove = await fetch(`${server.baseUrl}/api/tasks/task-missing/approve`, {
        method: "POST",
      });
      expect(unknownApprove.status).toBe(404);
      const unknownApprovePayload = await unknownApprove.json() as { ok: boolean; error?: string };
      expect(unknownApprovePayload.ok).toBe(false);
      expect(unknownApprovePayload.error).toContain("not found");

      const invalidJsonReprove = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(waitingTask.taskId)}/reprove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(invalidJsonReprove.status).toBe(400);
      const invalidJsonPayload = await invalidJsonReprove.json() as { ok: boolean; error?: string };
      expect(invalidJsonPayload.ok).toBe(false);
      expect(invalidJsonPayload.error).toBe("Invalid JSON body.");

      const unknownRoute = await fetch(`${server.baseUrl}/api/unknown-route`);
      expect(unknownRoute.status).toBe(404);
      const unknownRoutePayload = await unknownRoute.json() as { ok: boolean; error?: string };
      expect(unknownRoutePayload.ok).toBe(false);
      expect(unknownRoutePayload.error).toBe("Not found");
    } finally {
      await server.close();
    }
  });
});
