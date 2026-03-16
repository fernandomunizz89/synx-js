import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  appendText,
  ensureDir,
  exists,
  listDirectories,
  listFiles,
  moveFile,
  readJson,
  readJsonValidated,
  readText,
  statSafe,
  writeJson,
  writeText,
} from "./fs.js";

describe("fs helpers", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-fs-test-"));
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("creates dirs, writes/reads text and append content", async () => {
    const dir = path.join(root, "nested", "dir");
    const filePath = path.join(dir, "notes.txt");

    await ensureDir(dir);
    expect(await exists(dir)).toBe(true);

    await writeText(filePath, "hello");
    await appendText(filePath, "\nworld");
    expect(await readText(filePath)).toBe("hello\nworld");
  });

  it("writes/reads json and validates with schema", async () => {
    const jsonPath = path.join(root, "data", "meta.json");
    await ensureDir(path.dirname(jsonPath));
    await writeJson(jsonPath, { ok: true, count: 3 });

    const raw = await readJson<{ ok: boolean; count: number }>(jsonPath);
    expect(raw).toEqual({ ok: true, count: 3 });

    const schema = z.object({ ok: z.boolean(), count: z.number().int() });
    const validated = await readJsonValidated(jsonPath, schema);
    expect(validated).toEqual({ ok: true, count: 3 });
  });

  it("throws readable error for invalid validated json shape", async () => {
    const jsonPath = path.join(root, "invalid.json");
    await fs.writeFile(jsonPath, JSON.stringify({ ok: "yes" }), "utf8");

    const schema = z.object({ ok: z.boolean() });
    await expect(readJsonValidated(jsonPath, schema)).rejects.toThrow("Invalid JSON structure");
  });

  it("lists directories/files and moves files", async () => {
    const fromDir = path.join(root, "from");
    const toDir = path.join(root, "to");
    await ensureDir(fromDir);
    await ensureDir(toDir);

    await fs.writeFile(path.join(fromDir, "b.txt"), "b", "utf8");
    await fs.writeFile(path.join(fromDir, "a.txt"), "a", "utf8");
    await ensureDir(path.join(root, "z-dir"));
    await ensureDir(path.join(root, "a-dir"));

    expect(await listFiles(fromDir)).toEqual(["a.txt", "b.txt"]);
    expect(await listDirectories(root)).toEqual(["a-dir", "from", "to", "z-dir"]);

    await moveFile(path.join(fromDir, "a.txt"), path.join(toDir, "moved.txt"));
    expect(await exists(path.join(toDir, "moved.txt"))).toBe(true);
    expect(await exists(path.join(fromDir, "a.txt"))).toBe(false);
  });

  it("returns stat info for existing file and null for missing", async () => {
    const filePath = path.join(root, "exists.txt");
    await fs.writeFile(filePath, "ok", "utf8");

    const okStat = await statSafe(filePath);
    const missingStat = await statSafe(path.join(root, "missing.txt"));

    expect(okStat?.isFile()).toBe(true);
    expect(missingStat).toBeNull();
  });
});
