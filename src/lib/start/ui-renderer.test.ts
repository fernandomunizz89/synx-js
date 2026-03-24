import { describe, expect, it, vi } from "vitest";
import { appendEvent, appendConsole } from "./ui-renderer.js";

vi.mock("../synx-ui.js", () => ({
  formatSynxStreamLog: vi.fn((msg) => `MOCK: ${msg}`),
}));

describe("lib/start/ui-renderer", () => {
  describe("appendEvent", () => {
    it("appends formatted message and limits length", () => {
      const logs: string[] = ["a", "b", "c", "d", "e"];
      appendEvent(logs, "new-event");
      expect(logs).toHaveLength(5);
      expect(logs[4]).toBe("MOCK: new-event");
      expect(logs[0]).toBe("b");
    });
  });

  describe("appendConsole", () => {
    it("appends INFO message", () => {
      const logs: string[] = [];
      appendConsole(logs, "hello", "info");
      expect(logs[0]).toBe("INFO: hello");
    });

    it("appends ERROR message for critical level", () => {
      const logs: string[] = [];
      appendConsole(logs, "boom", "critical");
      expect(logs[0]).toBe("ERROR: boom");
    });

    it("limits length to 5", () => {
      const logs: string[] = ["1", "2", "3", "4", "5"];
      appendConsole(logs, "6", "info");
      expect(logs).toHaveLength(5);
      expect(logs[0]).toBe("2");
    });
  });
});
