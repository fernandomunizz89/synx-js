import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask } from "../task.js";
import { DONE_FILE_NAMES } from "../constants.js";
import { writeJson, exists } from "../fs.js";
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

  it("reports skipped tracked files when workspace is not a git repository", async () => {
    const created = await createTask(baseTaskInput("With changes"));
    await writeJson(path.join(created.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert), {
      output: {
        filesChanged: ["src/demo.ts"],
      },
    });

    // In a non-git repo, all files are treated as untracked.
    // Since src/demo.ts does not exist, it won't be in untrackedRemoved nor skipped.
    const summary = await applyTaskRollback(created.taskId);
    expect(summary.requested).toBe(1);
    expect(summary.warnings.some((row) => row.includes("not a git repository"))).toBe(true);
  });

  it("skips unsafe rollback paths outside workspace root", async () => {
    const created = await createTask(baseTaskInput("Unsafe changes"));
    await writeJson(path.join(created.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert), {
      output: {
        filesChanged: ["../outside.ts", "/etc/passwd"],
      },
    });

    const summary = await applyTaskRollback(created.taskId);
    expect(summary.warnings.some((w) => w.includes("unsafe rollback path"))).toBe(true);
  });

  it("removes untracked files even if git is not present", async () => {
    const created = await createTask(baseTaskInput("Untracked changes"));
    const untrackedFile = path.join(fixture.repoRoot, "src/new-file.ts");
    await fs.mkdir(path.dirname(untrackedFile), { recursive: true });
    await fs.writeFile(untrackedFile, "content", "utf8");

    await writeJson(path.join(created.taskPath, "done", DONE_FILE_NAMES.synxFrontExpert), {
      output: {
        filesChanged: ["src/new-file.ts"],
      },
    });

    // Even if not a git repo, untracked files are removed if they exist.
    const summary = await applyTaskRollback(created.taskId);
    expect(summary.untrackedRemoved).toContain("src/new-file.ts");
    expect(await exists(untrackedFile)).toBe(false);
  });
});
