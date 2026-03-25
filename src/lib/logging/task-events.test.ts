import { describe, expect, it, vi, beforeEach } from "vitest";
import { logTaskEvent, logTiming } from "./task-events.js";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import { formatSynxStreamLog } from "../synx-ui.js";

vi.mock("../fs.js", () => ({
  appendText: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  logsDir: vi.fn(() => "/tmp/synx-logs"),
}));

vi.mock("../utils.js", () => ({
  nowIso: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

vi.mock("../synx-ui.js", () => ({
  formatSynxStreamLog: vi.fn((m, s, t) => `[${t}] [${s}] ${m}`),
}));

describe("lib/logging/task-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logTaskEvent", () => {
    it("logs formatted event to task-specific events.log", async () => {
      await logTaskEvent("/tmp/task-123", "Started doing something");
      
      expect(formatSynxStreamLog).toHaveBeenCalledWith(
        "Started doing something",
        "TASK:task-123",
        "2024-01-01T00:00:00.000Z"
      );
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/task-123/logs/events.log"),
        expect.stringContaining("[2024-01-01T00:00:00.000Z] [TASK:task-123] Started doing something\n")
      );
    });
  });

  describe("logTiming", () => {
    it("logs timing entry to task path and global stage-metrics.jsonl", async () => {
      const entry = { stage: "S1", durationMs: 500, at: "2024-01-01T00:00:00.000Z" };
      await logTiming("/tmp/task-456", entry as any);

      expect(appendText).toHaveBeenCalledTimes(2);
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/task-456/logs/timings.jsonl"),
        JSON.stringify(entry) + "\n"
      );
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/synx-logs/stage-metrics.jsonl"),
        JSON.stringify(entry) + "\n"
      );
    });
  });
});
