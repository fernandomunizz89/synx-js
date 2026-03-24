import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCollaborationMetricsReport, parseMetricsTimestamp } from "./collaboration-metrics.js";
import { promises as fs } from "node:fs";
import { exists, readJson } from "./fs.js";
import { loadAgentAudit, loadJsonlByPath, loadTaskMetaMap } from "./metrics-loader.js";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
  readJson: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  logsDir: vi.fn(() => "/mock/logs"),
  tasksDir: vi.fn(() => "/mock/tasks"),
}));

vi.mock("./metrics-loader.js", () => ({
    loadAgentAudit: vi.fn(),
    loadJsonlByPath: vi.fn(),
    loadTaskMetaMap: vi.fn(),
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
        const date = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
        expect(parseMetricsTimestamp("20240101-120000")).toBe(date.getTime());
    });
    it("parses ISO", () => {
        const date = new Date();
        expect(parseMetricsTimestamp(date.toISOString())).toBe(date.getTime());
    });
    it("returns null for empty/undefined", () => {
        expect(parseMetricsTimestamp("")).toBe(null);
        expect(parseMetricsTimestamp(undefined)).toBe(null);
    });
  });

  describe("buildCollaborationMetricsReport", () => {
    it("builds a report with diverse data to cover branches", async () => {
      vi.mocked(loadJsonlByPath).mockImplementation(async (path) => {
          if (path.endsWith("stage-metrics.jsonl")) {
              return {
                  rows: [
                      { taskId: "t1", stage: "synx-back-expert", startedAt: "2024-01-01T10:00:00Z", endedAt: "2024-01-01T10:05:00Z", durationMs: 300000, estimatedCostUsd: 0.01 },
                      { taskId: "t1", stage: "qa", startedAt: "2024-01-01T10:05:00Z", endedAt: "2024-01-01T10:06:00Z", durationMs: 60000 }
                  ],
                  lineCount: 2, byteCount: 200
              } as any;
          }
          return { rows: [], lineCount: 0, byteCount: 0 } as any;
      });

      vi.mocked(loadAgentAudit).mockResolvedValue({
          rows: [
              { taskId: "t1", event: "handoff_queued", stage: "qa", nextAgent: "feature builder", at: "2024-01-01T10:06:00Z" },
              { taskId: "t1", event: "stage_failed", stage: "synx-back-expert", error: "429 Rate limit", at: "2024-01-01T10:04:00Z" },
              { taskId: "t1", event: "stage_note", note: "investigation_summary", outputSummary: { blockingFailures: 1 }, at: "2024-01-01T10:01:00Z" }
          ],
          lineCount: 3, byteCount: 300
      });

      vi.mocked(loadTaskMetaMap).mockResolvedValue(new Map([
          ["t1", { taskId: "t1", status: "done" } as any]
      ]));

      const report = await buildCollaborationMetricsReport({});

      expect(report.taskMetrics.totalTasks).toBe(1);
      expect(report.taskMetrics.qaReturnRate).toBe(1);
      expect(report.failuresByCategory).toContainEqual({ category: "provider_rate_limit", count: 1 });
      expect(report.collaboration.logsUseful).toBeGreaterThan(0);
      expect(report.bottlenecks.implementerLikelyBottleneck).toBe(true);
    });

    it("handles tasks with no stages but with audits", async () => {
        vi.mocked(loadJsonlByPath).mockResolvedValue({ rows: [], lineCount: 0, byteCount: 0 } as any);
        vi.mocked(loadAgentAudit).mockResolvedValue({
            rows: [{ taskId: "t2", event: "stage_failed", error: "crash" }],
            lineCount: 1, byteCount: 100
        });
        vi.mocked(loadTaskMetaMap).mockResolvedValue(new Map());

        const report = await buildCollaborationMetricsReport({});
        expect(report.taskMetrics.totalTasks).toBe(1);
        expect(report.taskMetrics.failedTasks).toBe(1);
    });
  });
});

