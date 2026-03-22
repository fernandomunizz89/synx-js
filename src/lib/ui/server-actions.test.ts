import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import { writeJson, readJson } from "../fs.js";
import { DONE_FILE_NAMES } from "../constants.js";
import type { NewTaskInput } from "../types.js";
import { startUiServer } from "./server.js";
import { loadTaskCancelRequest } from "../task-cancel.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "ui-actions-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-actions-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-actions-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/ui/server actions", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("executes approve, reprove with rollback, and cancel via API in mutation mode", async () => {
    const approveTask = await createTask(baseTaskInput("Approve from web"));
    const approveMeta = await loadTaskMeta(approveTask.taskId);
    approveMeta.status = "waiting_human";
    approveMeta.humanApprovalRequired = true;
    await saveTaskMeta(approveTask.taskId, approveMeta);

    const reproveTask = await createTask(baseTaskInput("Reprove from web"));
    const reproveMeta = await loadTaskMeta(reproveTask.taskId);
    reproveMeta.status = "waiting_human";
    reproveMeta.humanApprovalRequired = true;
    reproveMeta.type = "Feature";
    await saveTaskMeta(reproveTask.taskId, reproveMeta);
    await writeJson(path.join(reproveTask.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert), {
      output: {
        filesChanged: ["src/rollback-target.ts"],
      },
    });

    const cancelTask = await createTask(baseTaskInput("Cancel from web"));
    const cancelMeta = await loadTaskMeta(cancelTask.taskId);
    cancelMeta.status = "in_progress";
    await saveTaskMeta(cancelTask.taskId, cancelMeta);

    const doneTask = await createTask(baseTaskInput("Done task"));
    const doneMeta = await loadTaskMeta(doneTask.taskId);
    doneMeta.status = "done";
    await saveTaskMeta(doneTask.taskId, doneMeta);

    const server = await startUiServer({
      host: "127.0.0.1",
      port: 0,
      html: "<!doctype html><html><body>ui</body></html>",
      enableMutations: true,
    });

    try {
      const approveResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(approveTask.taskId)}/approve`, {
        method: "POST",
      });
      expect(approveResponse.status).toBe(200);
      const approvedMeta = await loadTaskMeta(approveTask.taskId);
      expect(approvedMeta.status).toBe("done");
      const approvedArtifact = await readJson<{ output?: { decision?: string } }>(
        path.join(approveTask.taskPath, "human", "90-final-review.approved.json"),
      );
      expect(approvedArtifact.output?.decision).toBe("approved");

      const reproveResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(reproveTask.taskId)}/reprove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Need adjustments", rollbackMode: "task" }),
      });
      expect(reproveResponse.status).toBe(200);
      const reprovePayload = await reproveResponse.json() as { ok: boolean; data: { rollbackSummary?: { requested?: number } } };
      expect(reprovePayload.ok).toBe(true);
      expect(reprovePayload.data.rollbackSummary?.requested).toBe(1);
      const reprovedMeta = await loadTaskMeta(reproveTask.taskId);
      expect(reprovedMeta.status).toBe("waiting_agent");

      const cancelResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(cancelTask.taskId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Stop this one" }),
      });
      expect(cancelResponse.status).toBe(200);
      const cancelRequest = await loadTaskCancelRequest(cancelTask.taskId);
      expect(cancelRequest?.reason).toBe("Stop this one");

      const invalidCancelResponse = await fetch(`${server.baseUrl}/api/tasks/${encodeURIComponent(doneTask.taskId)}/cancel`, {
        method: "POST",
      });
      expect(invalidCancelResponse.status).toBe(400);
    } finally {
      await server.close();
    }
  });
});
