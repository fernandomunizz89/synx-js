import { describe, expect, it, vi, beforeEach } from "vitest";
import { 
  logPollingCycle, 
  logQueueLatency, 
  logProviderThrottle, 
  logProviderParseRetry, 
  logProviderModelResolution 
} from "./provider-metrics.js";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import path from "node:path";

vi.mock("../fs.js", () => ({
  appendText: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  logsDir: vi.fn(() => "/tmp/synx-logs"),
}));

vi.mock("../utils.js", () => ({
  nowIso: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

describe("lib/logging/provider-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logPollingCycle", () => {
    it("logs cycle metrics to polling-metrics.jsonl", async () => {
      const entry = {
        loop: 1,
        pollIntervalMs: 5000,
        maxImmediateCycles: 10,
        taskCount: 5,
        activeTaskCount: 2,
        processedStages: 1,
        processedTasks: 1,
        immediateCycleStreak: 0,
        immediateCyclesTotal: 5,
        sleepsAvoidedTotal: 2,
        sleepsTotal: 10,
        loopDurationMs: 150,
        action: "sleep" as const,
        reason: "wait",
        sleepMs: 5000
      };
      await logPollingCycle(entry);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("polling-metrics.jsonl"),
        expect.stringContaining('"loop":1')
      );
    });
  });

  describe("logQueueLatency", () => {
    it("logs queue latency to queue-latency.jsonl", async () => {
      const entry = {
        taskId: "t1",
        stage: "S1",
        agent: "A1",
        requestCreatedAt: "2023-12-31T23:59:59Z",
        startedAt: "2024-01-01T00:00:01Z",
        queueLatencyMs: 2000
      };
      await logQueueLatency(entry);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("queue-latency.jsonl"),
        expect.stringContaining('"queueLatencyMs":2000')
      );
    });
  });

  describe("logProviderThrottle", () => {
    it("logs throttling events to provider-throttle.jsonl", async () => {
      const entry = {
        agent: "A1",
        provider: "OpenAI",
        model: "gpt-4",
        event: "rate_limit_wait" as const,
        attempt: 2,
        maxAttempts: 3,
        retriesUsed: 1,
        transient: true,
        waitMs: 500
      };
      await logProviderThrottle(entry);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("provider-throttle.jsonl"),
        expect.stringContaining('"event":"rate_limit_wait"')
      );
    });
  });

  describe("logProviderParseRetry", () => {
    it("logs parse retries to provider-parse-retries.jsonl", async () => {
      const entry = {
        agent: "A1",
        provider: "Anthropic",
        model: "claude-3",
        event: "parse_retry_started" as const,
        attempt: 1,
        maxAttempts: 2,
        parseRetriesUsed: 0
      };
      await logProviderParseRetry(entry);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("provider-parse-retries.jsonl"),
        expect.stringContaining('"event":"parse_retry_started"')
      );
    });
  });

  describe("logProviderModelResolution", () => {
    it("logs model resolution to provider-model-resolution.jsonl", async () => {
      const entry = {
        agent: "A1",
        provider: "LM Studio",
        event: "model_resolution_succeeded" as const,
        selectedModel: "local-model"
      };
      await logProviderModelResolution(entry);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("provider-model-resolution.jsonl"),
        expect.stringContaining('"selectedModel":"local-model"')
      );
    });
  });
});
