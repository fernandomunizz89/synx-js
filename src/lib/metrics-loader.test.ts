import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { loadJsonlByPath, loadAgentAudit, loadTaskMetaMap } from "./metrics-loader.js";

vi.mock("./paths.js", () => ({
  logsDir: () => path.join(process.cwd(), ".ai-agents/logs"),
  tasksDir: () => path.join(process.cwd(), ".ai-agents/tasks"),
}));

const originalCwd = process.cwd();

describe("lib/metrics-loader", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-metrics-test-"));
    process.chdir(root);
    await fs.mkdir(".ai-agents/logs/agent-audit", { recursive: true });
    await fs.mkdir(".ai-agents/tasks", { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (root) await fs.rm(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("loadJsonlByPath", () => {
    it("loads and parses JSONL file within time window", async () => {
      const filePath = "test.jsonl";
      const now = Date.now();
      const content = [
        JSON.stringify({ at: new Date(now - 1000).toISOString(), val: 1 }),
        JSON.stringify({ at: new Date(now - 5000).toISOString(), val: 2 }), // Out of window
        "",
        "invalid json", // Should be ignored
        JSON.stringify({ at: new Date(now - 200).toISOString(), val: 3 }),
      ].join("\n");

      await fs.writeFile(filePath, content);

      const result = await loadJsonlByPath<{ at: string; val: number }>(
        filePath,
        { sinceMs: now - 3000, untilMs: now },
        (row) => new Date(row.at).getTime()
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].val).toBe(1);
      expect(result.rows[1].val).toBe(3);
      expect(result.lineCount).toBe(2);
    });

    it("returns empty result if file does not exist", async () => {
      const result = await loadJsonlByPath("nonexistent.jsonl", { sinceMs: 0, untilMs: Date.now() }, () => 0);
      expect(result.rows).toEqual([]);
      expect(result.lineCount).toBe(0);
    });
  });

  describe("loadAgentAudit", () => {
    it("loads audit entries from multiple files", async () => {
      const now = Date.now();
      await fs.writeFile(
        ".ai-agents/logs/agent-audit/file1.jsonl",
        JSON.stringify({ at: new Date(now - 100).toISOString(), event: "test" })
      );
      await fs.writeFile(
        ".ai-agents/logs/agent-audit/file2.jsonl",
        JSON.stringify({ at: new Date(now - 200).toISOString(), event: "test2" })
      );

      const result = await loadAgentAudit({ sinceMs: now - 1000, untilMs: now });
      expect(result.rows).toHaveLength(2);
      expect(result.lineCount).toBe(2);
    });
  });

  describe("loadTaskMetaMap", () => {
    it("loads task metadata from across task directories", async () => {
      await fs.mkdir(".ai-agents/tasks/task-1", { recursive: true });
      await fs.mkdir(".ai-agents/tasks/task-2", { recursive: true });
      
      await fs.writeFile(
        ".ai-agents/tasks/task-1/meta.json",
        JSON.stringify({ taskId: "task-1", title: "Task 1" })
      );
      await fs.writeFile(
        ".ai-agents/tasks/task-2/meta.json",
        JSON.stringify({ taskId: "task-2", title: "Task 2" })
      );

      const map = await loadTaskMetaMap();
      expect(map.size).toBe(2);
      expect(map.get("task-1")?.title).toBe("Task 1");
      expect(map.get("task-2")?.title).toBe("Task 2");
    });

    it("skips invalid or missing meta.json files", async () => {
      await fs.mkdir(".ai-agents/tasks/task-1", { recursive: true });
      await fs.writeFile(".ai-agents/tasks/task-1/meta.json", "invalid json");
      
      const map = await loadTaskMetaMap();
      expect(map.size).toBe(0);
    });
  });
});
