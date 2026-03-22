import { describe, expect, it, vi, beforeEach } from "vitest";
import { metricsCommand } from "./metrics.js";
import * as collaborationMetrics from "../lib/collaboration-metrics.js";

vi.mock("../lib/collaboration-metrics.js", () => ({
  buildCollaborationMetricsReport: vi.fn(),
  parseMetricsTimestamp: vi.fn(),
}));

describe("commands/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const mockReport = {
    stageSummary: [
      { stage: "synx-back-expert", count: 1, avgMs: 100, minMs: 100, maxMs: 100, totalMs: 100 }
    ],
    taskMetrics: {
      totalTasks: 1,
      terminalTasks: 1,
      successfulTasks: 1,
      failedTasks: 0,
      inProgressTasks: 0,
      successRate: 1,
      avgTotalMs: 200,
      p95TotalMs: 200,
      avgRetriesPerTask: 0,
      avgHandoffsPerTask: 1,
      avgLoopsPerTask: 0,
      qaReturnRate: 0,
      timeToFirstDiagnosisAvgMs: 50,
      timeToFirstDiagnosisP95Ms: 50,
      avgQueueLatencyMs: 10,
      queueLatencyP95Ms: 10,
      fullBuildChecksPerTask: 1,
      estimatedInputTokensTotal: 1000,
      estimatedOutputTokensTotal: 500,
      estimatedTotalTokens: 1500,
      avgEstimatedTokensPerTask: 1500,
      estimatedCostUsdTotal: 0.01,
      avgEstimatedCostUsdPerTask: 0.01
    },
    window: { sinceMs: 0, untilMs: 1000000000000 },
    collaboration: {
        logsUseful: 10,
        logsInformative: 5,
        usefulLogRatio: 0.66,
        loopsByType: { qaReturnsTotal: 0, qualityRepairRetriesTotal: 0 }
    },
    bottlenecks: {
        topStage: "synx-back-expert",
        topStageAvgMs: 100,
        implementerShare: 0.5,
        implementerAvgMsPerTask: 100,
        implementerLikelyBottleneck: true
    },
    operationalCost: {
        retryWaitMs: 0,
        pollingSleepMs: 0,
        pollingLoops: 0,
        pollingProcessedStages: 0,
        throttleEvents: 0,
        logLines: 100,
        logBytes: 10000
    },
    failuresByCategory: []
  };

  it("reports no timing data found yet", async () => {
    vi.mocked(collaborationMetrics.buildCollaborationMetricsReport).mockResolvedValue({
      stageSummary: [],
    } as any);

    await metricsCommand.parseAsync(["node", "metrics"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No timing data found yet."));
  });

  it("prints a summary report to stdout", async () => {
    vi.mocked(collaborationMetrics.buildCollaborationMetricsReport).mockResolvedValue(mockReport as any);

    await metricsCommand.parseAsync(["node", "metrics"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Stage timing summary"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("synx-back-expert"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Success rate (terminal): 100.0%"));
  });

  it("outputs JSON when --json flag is used", async () => {
    vi.mocked(collaborationMetrics.buildCollaborationMetricsReport).mockResolvedValue(mockReport as any);

    await metricsCommand.parseAsync(["node", "metrics", "--json"]);

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockReport, null, 2));
  });

  it("filters by since/until timestamps", async () => {
    vi.mocked(collaborationMetrics.parseMetricsTimestamp).mockReturnValue(123456789);
    vi.mocked(collaborationMetrics.buildCollaborationMetricsReport).mockResolvedValue(mockReport as any);

    await metricsCommand.parseAsync(["node", "metrics", "--since", "20240101-120000"]);

    expect(collaborationMetrics.parseMetricsTimestamp).toHaveBeenCalledWith("20240101-120000");
    expect(collaborationMetrics.buildCollaborationMetricsReport).toHaveBeenCalledWith(expect.objectContaining({
      sinceMs: 123456789
    }));
  });

  it("throws error for invalid timestamps", async () => {
    vi.mocked(collaborationMetrics.parseMetricsTimestamp).mockReturnValue(null);

    await expect(metricsCommand.parseAsync(["node", "metrics", "--since", "invalid"])).rejects.toThrow("Invalid --since timestamp: invalid");
  });
});
