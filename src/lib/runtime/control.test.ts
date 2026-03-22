import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consumeRuntimeControl, writeRuntimeControl } from "./control.js";

const originalCwd = process.cwd();

interface Fixture {
  root: string;
  repoRoot: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-runtime-control-test-"));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "logs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "synx-runtime-control-test" }, null, 2), "utf8");
  return { root, repoRoot };
}

describe.sequential("lib/runtime/control", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    process.chdir(fixture.repoRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it("writes and consumes runtime control commands", async () => {
    const request = await writeRuntimeControl({
      command: "pause",
      requestedBy: "unit-test",
      reason: "maintenance",
    });
    expect(request.command).toBe("pause");
    expect(request.requestedBy).toBe("unit-test");

    const consumed = await consumeRuntimeControl();
    expect(consumed?.command).toBe("pause");
    expect(consumed?.reason).toBe("maintenance");

    const none = await consumeRuntimeControl();
    expect(none).toBeNull();
  });
});
