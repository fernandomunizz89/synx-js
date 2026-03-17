import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCollaborationMetricsReport, parseMetricsTimestamp } from "./collaboration-metrics.js";
import { promises as fs } from "node:fs";
import { exists, listFiles, listDirectories, readJson } from "./fs.js";
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
  listFiles: vi.fn(),
  listDirectories: vi.fn(),
  readJson: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  logsDir: vi.fn(() => "/mock/logs"),
  tasksDir: vi.fn(() => "/mock/tasks"),
}));

describe("collaboration-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseMetricsTimestamp", () => {
    it("parses 13-digit ms", () => {
      expect(parseMetricsTimestamp("1620000000000")).toBe(1620000000000);
    });
    it("parses 10-digit seconds", () => {
        expect(parseMetricsTimestamp("1620000000")).toBe(1620000000000);
    });
    it("parses YYYYMMDD-HHMMSS", () => {
        // 20240101-120000
        const date = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
        expect(parseMetricsTimestamp("20240101-120000")).toBe(date.getTime());
    });
    it("parses ISO", () => {
        const date = new Date();
        expect(parseMetricsTimestamp(date.toISOString())).toBe(date.getTime());
    });
  });

  describe("buildCollaborationMetricsReport", () => {
    it("builds a report with empty data", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      vi.mocked(listDirectories).mockResolvedValue([]);
      
      const report = await buildCollaborationMetricsReport({});
      expect(report.taskMetrics.totalTasks).toBe(0);
      expect(report.operationalCost.logLines).toBe(0);
    });

    it("builds a report with basic data", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(listDirectories).mockResolvedValue(["task-1"]);
      vi.mocked(listFiles).mockResolvedValue([]);
      vi.mocked(readJson).mockResolvedValue({ status: "done" });
      
      // Mock stage-metrics.jsonl
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
          if (filePath.toString().endsWith("stage-metrics.jsonl")) {
              return JSON.stringify({
                  taskId: "task-1",
                  stage: "builder",
                  startedAt: "2024-01-01T12:00:00Z",
                  endedAt: "2024-01-01T12:10:00Z",
                  durationMs: 600000
              });
          }
          return "";
      });

      const report = await buildCollaborationMetricsReport({});
      expect(report.taskMetrics.totalTasks).toBe(1);
      expect(report.taskMetrics.successfulTasks).toBe(1);
      expect(report.stageSummary).toHaveLength(1);
      expect(report.stageSummary[0].stage).toBe("builder");
    });
  });
});
