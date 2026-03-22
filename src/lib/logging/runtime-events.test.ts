import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readText } from "../fs.js";
import { logsDir } from "../paths.js";
import { logRuntimeEvent } from "./runtime-events.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-runtime-events-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-runtime-events-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/logging/runtime-events", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("appends runtime events as jsonl", async () => {
    await logRuntimeEvent({
      event: "task.updated",
      taskId: "task-123",
      source: "unit-test",
      payload: { status: "in_progress" },
    });

    const raw = await readText(path.join(logsDir(), "runtime-events.jsonl"));
    const parsed = JSON.parse(raw.trim()) as { event: string; taskId: string; source: string; payload: { status: string } };
    expect(parsed.event).toBe("task.updated");
    expect(parsed.taskId).toBe("task-123");
    expect(parsed.source).toBe("unit-test");
    expect(parsed.payload.status).toBe("in_progress");
  });
});
