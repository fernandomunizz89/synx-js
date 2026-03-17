import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadTimingEntries, summarizeMetrics } from "./metrics.js";
import { promises as fs } from "node:fs";
import { exists } from "./fs.js";
import path from "node:path";
import { logsDir } from "./paths.js";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  logsDir: vi.fn(() => "/mock/logs"),
}));

describe("metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadTimingEntries", () => {
    it("returns empty array if file does not exist", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const entries = await loadTimingEntries();
      expect(entries).toEqual([]);
    });

    it("parses jsonl entries correctly", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      const data = JSON.stringify({ stage: "A", durationMs: 100 }) + "\n" + JSON.stringify({ stage: "B", durationMs: 200 });
      vi.mocked(fs.readFile).mockResolvedValue(data);
      
      const entries = await loadTimingEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].stage).toBe("A");
    });
  });

  describe("summarizeMetrics", () => {
    it("summarizes and sorts metrics", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      const entries = [
        { stage: "A", durationMs: 100 },
        { stage: "A", durationMs: 300 },
        { stage: "B", durationMs: 500 },
      ];
      vi.mocked(fs.readFile).mockResolvedValue(entries.map(e => JSON.stringify(e)).join("\n"));

      const summary = await summarizeMetrics();
      expect(summary).toHaveLength(2);
      
      const stageA = summary.find(s => s.stage === "A");
      expect(stageA?.count).toBe(2);
      expect(stageA?.totalMs).toBe(400);
      expect(stageA?.avgMs).toBe(200);
      expect(stageA?.minMs).toBe(100);
      expect(stageA?.maxMs).toBe(300);

      // B has higher avgMs (500 > 200), so it should be first
      expect(summary[0].stage).toBe("B");
    });
  });
});
