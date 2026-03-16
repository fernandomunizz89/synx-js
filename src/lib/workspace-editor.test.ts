import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWorkspaceEdits, resolveWorkspacePath } from "./workspace-editor.js";

describe("workspace-editor (hybrid)", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "synx-workspace-editor-"));
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("resolves valid paths and blocks traversal/protected paths", () => {
    const resolved = resolveWorkspacePath(workspaceRoot, "src/example.ts");
    expect(resolved.relativePath).toBe("src/example.ts");
    expect(resolved.absolutePath).toBe(path.join(workspaceRoot, "src", "example.ts"));

    expect(() => resolveWorkspacePath(workspaceRoot, "../outside.ts")).toThrow("Path escapes workspace root");
    expect(() => resolveWorkspacePath(workspaceRoot, ".ai-agents/config.json")).toThrow("Path is protected");
  });

  it("applies create, replace_snippet and delete edits", async () => {
    const targetPath = path.join(workspaceRoot, "src", "timer.ts");
    await fs.writeFile(targetPath, "export const timer = 10;\n", "utf8");

    const result = await applyWorkspaceEdits({
      workspaceRoot,
      edits: [
        {
          path: "src/new-file.ts",
          action: "create",
          content: "export const created = true;\n",
        },
        {
          path: "src/timer.ts",
          action: "replace_snippet",
          find: "10",
          replace: "25",
        },
        {
          path: "src/remove-me.ts",
          action: "create",
          content: "delete me\n",
        },
        {
          path: "src/remove-me.ts",
          action: "delete",
        },
      ],
    });

    const timerContent = await fs.readFile(targetPath, "utf8");
    const createdContent = await fs.readFile(path.join(workspaceRoot, "src", "new-file.ts"), "utf8");
    expect(timerContent).toContain("25");
    expect(createdContent).toContain("created = true");
    expect(result.appliedFiles).toEqual(expect.arrayContaining(["src/new-file.ts", "src/timer.ts", "src/remove-me.ts"]));
    expect(result.changedFiles).toEqual(expect.arrayContaining(["src/new-file.ts", "src/timer.ts", "src/remove-me.ts"]));
  });

  it("supports dry-run and reports skipped edits", async () => {
    const targetPath = path.join(workspaceRoot, "src", "dry-run.ts");
    await fs.writeFile(targetPath, "const value = 1;\n", "utf8");

    const result = await applyWorkspaceEdits({
      workspaceRoot,
      dryRun: true,
      edits: [
        {
          path: "src/dry-run.ts",
          action: "replace_snippet",
          find: "value = 1",
          replace: "value = 2",
        },
        {
          path: "src/dry-run.ts",
          action: "replace_snippet",
          find: "does-not-exist",
          replace: "noop",
        },
      ],
    });

    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toContain("value = 1");
    expect(result.warnings).toContain("Dry-run mode is enabled. Workspace edits are simulated and no files are written.");
    expect(result.skippedEdits).toEqual(expect.arrayContaining([
      "src/dry-run.ts (replace_snippet skipped: target snippet not found)",
    ]));
  });
});
