import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workers } from "./index.js";

const originalCwd = process.cwd();

describe.sequential("workers/index", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-workers-test-"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "synx-workers-test" }, null, 2), "utf8");
    process.chdir(root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("registers concrete workers in expected orchestration order", () => {
    expect(workers.map((worker) => worker.agent)).toEqual([
      "Dispatcher",
      "Spec Planner",
      "Bug Investigator",
      "Bug Fixer",
      "Feature Builder",
      "Reviewer",
      "QA Validator",
      "PR Writer",
    ]);
  });

  it("returns false when no inbox request exists for a task", async () => {
    const results = await Promise.all(workers.map((worker) => worker.tryProcess("missing-task")));
    expect(results.every((result) => result === false)).toBe(true);
  });
});
