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
    project: "review-e2e",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-review-queue-e2e-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-review-queue-e2e" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("ui/review-queue e2e", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("runs review queue flow end-to-end through API", async () => {
    const waitingA = await createTask(baseTaskInput("Needs approval A"));
    const waitingAMeta = await loadTaskMeta(waitingA.taskId);
    waitingAMeta.status = "waiting_human";
    waitingAMeta.humanApprovalRequired = true;
    await saveTaskMeta(waitingA.taskId, waitingAMeta);

    const waitingB = await createTask(baseTaskInput("Needs approval B"));
    const waitingBMeta = await loadTaskMeta(waitingB.taskId);
    waitingBMeta.status = "waiting_human";
    waitingBMeta.humanApprovalRequired = true;
    waitingBMeta.type = "Bug";
    await saveTaskMeta(waitingB.taskId, waitingBMeta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const queueStart = await fetch(`${server.baseUrl}/api/review-queue`);
      expect(queueStart.status).toBe(200);
      const queueStartPayload = await queueStart.json() as { ok: boolean; data: Array<{ taskId: string }> };
      expect(queueStartPayload.ok).toBe(true);
      expect(queueStartPayload.data.map((row) => row.taskId).sort()).toEqual([waitingA.taskId, waitingB.taskId].sort());

      const approveA = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(waitingA.taskId)}/approve`, {
        method: "POST",
      });
      expect(approveA.status).toBe(200);
      const approvedMeta = await loadTaskMeta(waitingA.taskId);
      expect(approvedMeta.status).toBe("done");
      expect(approvedMeta.humanApprovalRequired).toBe(false);

      const reproveB = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(waitingB.taskId)}/reprove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Fix QA gap", rollbackMode: "none" }),
      });
      expect(reproveB.status).toBe(200);
      const reprovedMeta = await loadTaskMeta(waitingB.taskId);
      expect(reprovedMeta.status).toBe("waiting_agent");
      expect(reprovedMeta.humanApprovalRequired).toBe(false);

      const queueEnd = await fetch(`${server.baseUrl}/api/review-queue`);
      expect(queueEnd.status).toBe(200);
      const queueEndPayload = await queueEnd.json() as { ok: boolean; data: Array<{ taskId: string }> };
      expect(queueEndPayload.ok).toBe(true);
      expect(queueEndPayload.data).toHaveLength(0);
    } finally {
      await server.close();
    }
  });
});
