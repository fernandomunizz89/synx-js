import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalCwd = process.cwd();

describe("lib/file-locks", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "synx-file-locks-test-"));
    await fs.mkdir(path.join(tmpDir, ".ai-agents", "runtime"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "synx-file-locks-test" }),
      "utf8",
    );
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("acquires locks for new files", async () => {
    const { acquireFileLocks } = await import("./file-locks.js");

    const result = await acquireFileLocks("task-001", ["src/app.ts", "src/utils.ts"]);
    expect(result.acquired).toEqual(["src/app.ts", "src/utils.ts"]);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects conflict when another task holds a file", async () => {
    const { acquireFileLocks } = await import("./file-locks.js");

    // taskA locks file first
    await acquireFileLocks("task-A", ["src/shared.ts"]);
    // taskB tries to lock the same file
    const result = await acquireFileLocks("task-B", ["src/shared.ts", "src/other.ts"]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].file).toBe("src/shared.ts");
    expect(result.conflicts[0].heldBy).toBe("task-A");
    // src/other.ts has no conflict
    expect(result.acquired).toContain("src/other.ts");
  });

  it("re-acquiring own locks is idempotent", async () => {
    const { acquireFileLocks } = await import("./file-locks.js");

    // taskA locks file
    await acquireFileLocks("task-A", ["src/app.ts"]);
    // taskA acquires the same file again — should succeed with no conflict
    const result = await acquireFileLocks("task-A", ["src/app.ts"]);
    expect(result.acquired).toContain("src/app.ts");
    expect(result.conflicts).toHaveLength(0);
  });

  it("releaseFileLocks removes all locks for taskId", async () => {
    const { acquireFileLocks, releaseFileLocks, listFileLocks } = await import("./file-locks.js");

    await acquireFileLocks("task-X", ["src/a.ts", "src/b.ts"]);
    const released = await releaseFileLocks("task-X");
    expect(released).toContain("src/a.ts");
    expect(released).toContain("src/b.ts");

    const map = await listFileLocks();
    expect(map.locks["src/a.ts"]).toBeUndefined();
    expect(map.locks["src/b.ts"]).toBeUndefined();
    expect(map.byTask["task-X"]).toBeUndefined();
  });

  it("getFileConflicts returns conflicts without mutating the lock map", async () => {
    const { acquireFileLocks, getFileConflicts, listFileLocks } = await import("./file-locks.js");

    await acquireFileLocks("task-owner", ["src/locked.ts"]);
    const before = await listFileLocks();

    const conflicts = await getFileConflicts("task-other", ["src/locked.ts"]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe("src/locked.ts");
    expect(conflicts[0].heldBy).toBe("task-owner");

    // Map should not have changed
    const after = await listFileLocks();
    expect(after.locks).toEqual(before.locks);
    expect(after.byTask).toEqual(before.byTask);
  });

  it("supports all-or-nothing acquisition to avoid partial reservations on conflicts", async () => {
    const { acquireFileLocks, listFileLocks } = await import("./file-locks.js");

    await acquireFileLocks("task-owner", ["src/shared.ts"]);
    const result = await acquireFileLocks("task-other", ["src/shared.ts", "src/free.ts"], {
      allOrNothing: true,
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.acquired).toEqual([]);

    const lockMap = await listFileLocks();
    expect(lockMap.locks["src/free.ts"]).toBeUndefined();
  });

  it("reserveDispatchLocks uses all-or-nothing semantics for ownership scopes", async () => {
    const { listFileLocks, reserveDispatchLocks } = await import("./file-locks.js");

    await reserveDispatchLocks("task-owner", ["src/features/auth"]);
    const result = await reserveDispatchLocks("task-other", ["src/features/auth", "src/features/payments"]);

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.acquired).toEqual([]);

    const lockMap = await listFileLocks();
    expect(lockMap.locks["scope:src/features/payments"]).toBeUndefined();
  });

  it("detects scope conflicts when another task owns the same directory", async () => {
    const { acquireFileLocks } = await import("./file-locks.js");

    await acquireFileLocks("task-A", ["src/features/one.ts"], { includeParentScopes: true });
    const result = await acquireFileLocks("task-B", ["src/features/two.ts"], { includeParentScopes: true });

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts.some((conflict) => conflict.heldBy === "task-A")).toBe(true);
  });
});
