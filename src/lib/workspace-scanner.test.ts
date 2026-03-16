import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWorkspaceContextSnapshot,
  extractKeywords,
  extensionPriority,
  isBlockedPath,
  normalizeInputPath,
  sanitizeForContext,
  scoreText,
  sortByScore,
  walkFiles,
  walkFilesCache,
} from "./workspace-scanner.js";

const DISABLE_CACHE_ENV = "AI_AGENTS_DISABLE_WORKSPACE_SCAN_CACHE";
const CACHE_TTL_ENV = "AI_AGENTS_WORKSPACE_SCAN_CACHE_TTL_MS";
const originalDisableCache = process.env[DISABLE_CACHE_ENV];
const originalCacheTtl = process.env[CACHE_TTL_ENV];

function restoreEnv(): void {
  if (typeof originalDisableCache === "string") process.env[DISABLE_CACHE_ENV] = originalDisableCache;
  else delete process.env[DISABLE_CACHE_ENV];
  if (typeof originalCacheTtl === "string") process.env[CACHE_TTL_ENV] = originalCacheTtl;
  else delete process.env[CACHE_TTL_ENV];
}

describe.sequential("workspace-scanner", () => {
  let root = "";

  beforeEach(async () => {
    walkFilesCache.clear();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-scanner-test-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, ".git"), { recursive: true });
    await fs.mkdir(path.join(root, "node_modules"), { recursive: true });

    await fs.writeFile(path.join(root, "src", "main.ts"), "export const app = 'timer feature';\n", "utf8");
    await fs.writeFile(path.join(root, "src", "styles.css"), ".timer { color: red; }\n", "utf8");
    await fs.writeFile(path.join(root, "package.json"), "{\"name\":\"demo\"}\n", "utf8");
    await fs.writeFile(path.join(root, ".git", "HEAD"), "ref: main\n", "utf8");
    await fs.writeFile(path.join(root, "node_modules", "dep.js"), "module.exports={}\n", "utf8");
  });

  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("normalizes and blocks protected paths", () => {
    expect(normalizeInputPath("./src\\main.ts")).toBe("src/main.ts");
    expect(isBlockedPath(".ai-agents/data.json")).toBe(true);
    expect(isBlockedPath(".git/config")).toBe(true);
    expect(isBlockedPath("src/main.ts")).toBe(false);
  });

  it("extracts keywords and scores text", () => {
    const keywords = extractKeywords("Need to fix timer feature and update timer styles");
    expect(keywords).toContain("timer");
    expect(keywords).toContain("styles");
    expect(scoreText("timer feature", ["timer"])).toBe(1);
    expect(scoreText("no match", ["timer"])).toBe(0);
  });

  it("supports extension priority and score-based sorting", () => {
    expect(extensionPriority("src/file.css")).toBe(5);
    expect(extensionPriority("src/file.ts")).toBe(3);

    const ordered = sortByScore(
      ["src/main.ts", "src/styles.css", "README.md"],
      ["timer"],
      new Set(["src/main.ts"]),
    );
    expect(ordered[0]).toBe("src/main.ts");
  });

  it("sanitizes and truncates context content", () => {
    const content = "a".repeat(40) + "\0" + "b".repeat(40);
    const sanitized = sanitizeForContext(content, 20);
    expect(sanitized).toContain("/* ... truncated ... */");
    expect(sanitized).not.toContain("\0");
  });

  it("walks files honoring ignore dirs and cache", async () => {
    process.env[CACHE_TTL_ENV] = "10000";
    delete process.env[DISABLE_CACHE_ENV];

    const first = await walkFiles(root, { maxScanFiles: 200, maxFileSizeBytes: 200_000 });
    expect(first).toEqual(expect.arrayContaining(["src/main.ts", "src/styles.css", "package.json"]));
    expect(first.some((file) => file.includes(".git"))).toBe(false);
    expect(first.some((file) => file.includes("node_modules"))).toBe(false);

    // Cache should keep previous scan result even after adding a file.
    await fs.writeFile(path.join(root, "src", "newly-added.ts"), "export const x = 1;\n", "utf8");
    const second = await walkFiles(root, { maxScanFiles: 200, maxFileSizeBytes: 200_000 });
    expect(second).toEqual(first);

    process.env[DISABLE_CACHE_ENV] = "1";
    const third = await walkFiles(root, { maxScanFiles: 200, maxFileSizeBytes: 200_000 });
    expect(third).toEqual(expect.arrayContaining(["src/newly-added.ts"]));
  });

  it("builds workspace snapshot with ranked files and limits", async () => {
    const snapshot = await buildWorkspaceContextSnapshot({
      workspaceRoot: root,
      query: "timer feature styling",
      relatedFiles: ["src/main.ts"],
      limits: {
        maxContextFiles: 2,
        maxFileContextChars: 40,
        maxTotalContextChars: 120,
      },
    });

    expect(snapshot.root).toBe(path.resolve(root));
    expect(snapshot.files.length).toBeLessThanOrEqual(2);
    expect(snapshot.files[0]?.path).toBe("src/main.ts");
    expect(snapshot.files.every((entry) => typeof entry.score === "number")).toBe(true);
  });
});
