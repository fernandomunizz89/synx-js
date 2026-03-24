import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const watchSpy = vi.hoisted(() => vi.fn(() => ({
  close: vi.fn(),
  on: vi.fn().mockReturnThis(),
} as any)));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    watch: watchSpy,
  };
});

import { createUiRealtime } from "./realtime.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-ui-realtime-watch-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-ui-realtime-watch-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/ui/realtime watcher mode", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    watchSpy.mockClear();
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("registers file watchers for logs-based realtime updates", async () => {
    const realtime = createUiRealtime({ pollMs: 60_000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(watchSpy).toHaveBeenCalled();
      const watchedTargets = watchSpy.mock.calls.map((call) => String((call as unknown as unknown[])[0] || ""));
      expect(watchedTargets.some((target) => target.includes(".ai-agents/logs"))).toBe(true);
    } finally {
      realtime.close();
    }
  });
});
