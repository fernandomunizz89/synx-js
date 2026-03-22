import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import { createUiRealtime } from "./realtime.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-realtime-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-realtime-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.sequential("lib/ui/realtime", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("emits mapped UI events from runtime events and metrics changes", async () => {
    const received: string[] = [];
    const realtime = createUiRealtime({ pollMs: 500 });
    const unsubscribe = realtime.subscribe((event) => {
      received.push(event.type);
    });

    try {
      const runtimeEventsPath = path.join(logsDir(), "runtime-events.jsonl");
      const stageMetricsPath = path.join(logsDir(), "stage-metrics.jsonl");

      await appendText(runtimeEventsPath, `${JSON.stringify({ at: "2026-03-22T10:00:00.000Z", event: "engine.started" })}\n`);
      await appendText(runtimeEventsPath, `${JSON.stringify({ at: "2026-03-22T10:00:01.000Z", event: "task.review_required", taskId: "task-1" })}\n`);
      await appendText(runtimeEventsPath, `${JSON.stringify({ at: "2026-03-22T10:00:02.000Z", event: "task.approved", taskId: "task-1" })}\n`);

      await delay(700);
      await appendText(stageMetricsPath, `${JSON.stringify({ taskId: "task-1", stage: "qa", startedAt: "2026-03-22T10:00:00.000Z", endedAt: "2026-03-22T10:00:01.000Z", durationMs: 1000, status: "done" })}\n`);
      await delay(700);

      expect(received).toContain("runtime.updated");
      expect(received).toContain("task.review_required");
      expect(received).toContain("task.decision_recorded");
      expect(received).toContain("metrics.updated");
    } finally {
      unsubscribe();
      realtime.close();
    }
  });
});
