import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask } from "../task.js";
import { DONE_FILE_NAMES } from "../constants.js";
import { writeJson } from "../fs.js";
import type { NewTaskInput } from "../types.js";
import { applyTaskRollback } from "./task-rollback.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

function baseTaskInput(title: string): NewTaskInput {
  return {
    title,
    typeHint: "Feature",
    project: "rollback-test",
    rawRequest: title,
    extraContext: {
      relatedFiles: [],
      logs: [],
      notes: [],
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-task-rollback-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-rollback-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/services/task-rollback", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("returns warning when task has no implementation file list", async () => {
    const created = await createTask(baseTaskInput("No changes"));
    const summary = await applyTaskRollback(created.taskId);
    expect(summary.requested).toBe(0);
    expect(summary.warnings[0]).toContain("No implementation file list found");
  });

  it("reports skipped files when workspace is not a git repository", async () => {
    const created = await createTask(baseTaskInput("With changes"));
    await writeJson(path.join(created.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert), {
      output: {
        filesChanged: ["src/demo.ts"],
      },
    });

    const summary = await applyTaskRollback(created.taskId);
    expect(summary.requested).toBe(1);
    expect(summary.skipped).toContain("src/demo.ts");
    expect(summary.warnings.some((row) => row.includes("not a git repository"))).toBe(true);
  });
});
