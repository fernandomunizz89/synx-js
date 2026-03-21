import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workerList } from "./index.js";

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

  // Dream Stack 2026 – Squad Factory
  it("registers the Dream Stack 2026 squad in expected orchestration order", () => {
    expect(workerList.map((worker) => worker.agent)).toEqual([
      "Dispatcher",
      "Synx Front Expert",
      "Synx Mobile Expert",
      "Synx Back Expert",
      "Synx QA Engineer",
      "Synx SEO Specialist",
      "Pipeline Executor",
    ]);
  });

  it("returns false when no inbox request exists for a task", async () => {
    const results = await Promise.all(workerList.map((worker) => worker.tryProcess("missing-task")));
    expect(results.every((result) => result === false)).toBe(true);
  });
});

