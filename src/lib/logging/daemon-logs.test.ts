import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeLogLine, logDaemon, writeDaemonState } from "./daemon-logs.js";
import { appendText, writeJson } from "../fs.js";
import { logsDir } from "../paths.js";
import { formatSynxStreamLog } from "../synx-ui.js";

vi.mock("../fs.js", () => ({
  appendText: vi.fn(),
  writeJson: vi.fn(),
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

describe("lib/logging/daemon-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeLogLine", () => {
    it("replaces multiple spaces with single space and trims", () => {
      expect(normalizeLogLine("  hello   world  ")).toBe("hello world");
      expect(normalizeLogLine("line\nbreak")).toBe("line break");
    });
  });

  describe("logDaemon", () => {
    it("appends formatted log to daemon.log", async () => {
      await logDaemon("  test  message  ");
      expect(normalizeLogLine).toBeDefined(); 
      expect(formatSynxStreamLog).toHaveBeenCalledWith("test message", "SYNX", "2024-01-01T00:00:00.000Z");
      expect(appendText).toHaveBeenCalledWith(
        expect.stringContaining("daemon.log"),
        expect.stringContaining("[2024-01-01T00:00:00.000Z] [SYNX] test message\n")
      );
    });
  });

  describe("writeDaemonState", () => {
    it("writes state to daemon-state.json", async () => {
      const state = { active: true };
      await writeDaemonState(state);
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining("daemon-state.json"),
        state
      );
    });
  });
});
