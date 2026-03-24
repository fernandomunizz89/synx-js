import { describe, expect, it } from "vitest";
import {
  toMs,
  inWindow,
  normalizeStage,
  percentile,
  avg,
  asNumber,
  classifyFailure,
  isUsefulLog,
  parseMetricsTimestamp,
} from "./metrics-helpers.js";

describe("lib/metrics-helpers", () => {
  describe("toMs", () => {
    it("converts ISO string to ms", () => {
      const date = "2024-01-01T00:00:00Z";
      expect(toMs(date)).toBe(Date.parse(date));
    });

    it("returns null for undefined or invalid string", () => {
      expect(toMs(undefined)).toBeNull();
      expect(toMs("invalid")).toBeNull();
    });
  });

  describe("inWindow", () => {
    it("returns true if ms is within window", () => {
      const window = { sinceMs: 100, untilMs: 200 };
      expect(inWindow(150, window)).toBe(true);
      expect(inWindow(100, window)).toBe(true);
      expect(inWindow(200, window)).toBe(true);
    });

    it("returns false if ms is outside window", () => {
      const window = { sinceMs: 100, untilMs: 200 };
      expect(inWindow(50, window)).toBe(false);
      expect(inWindow(250, window)).toBe(false);
    });

    it("returns false if ms is null", () => {
      expect(inWindow(null, {})).toBe(false);
    });

    it("handles open windows", () => {
      expect(inWindow(150, { sinceMs: 100 })).toBe(true);
      expect(inWindow(50, { sinceMs: 100 })).toBe(false);
      expect(inWindow(150, { untilMs: 200 })).toBe(true);
      expect(inWindow(250, { untilMs: 200 })).toBe(false);
    });
  });

  describe("normalizeStage", () => {
    it("normalizes common stage names", () => {
      expect(normalizeStage("  Dispatcher  ")).toBe("dispatcher");
      expect(normalizeStage("QA")).toBe("qa");
      expect(normalizeStage("  01-Research  ")).toBe("research");
      expect(normalizeStage("02_Implementation")).toBe("implementation");
    });

    it("handles empty names", () => {
      expect(normalizeStage("")).toBe("");
      expect(normalizeStage("   ")).toBe("");
    });
  });

  describe("percentile", () => {
    it("calculates percentile correctly", () => {
      const values = [10, 20, 30, 40, 50];
      expect(percentile(values, 0)).toBe(10);
      expect(percentile(values, 0.5)).toBe(30);
      expect(percentile(values, 0.95)).toBe(50);
      expect(percentile(values, 1)).toBe(50);
    });

    it("returns 0 for empty array", () => {
      expect(percentile([], 0.5)).toBe(0);
    });
  });

  describe("avg", () => {
    it("calculates average and rounds to nearest integer", () => {
      expect(avg([10, 20, 30])).toBe(20);
      expect(avg([10, 20])).toBe(15);
      expect(avg([1, 2])).toBe(2); // 1.5 rounded to 2
    });

    it("returns 0 for empty array", () => {
      expect(avg([])).toBe(0);
    });
  });

  describe("asNumber", () => {
    it("returns number if finite, else 0", () => {
      expect(asNumber(10)).toBe(10);
      expect(asNumber("10")).toBe(0);
      expect(asNumber(NaN)).toBe(0);
      expect(asNumber(Infinity)).toBe(0);
    });
  });

  describe("classifyFailure", () => {
    it("classifies failures by keywords", () => {
      expect(classifyFailure("Rate limit exceeded 429")).toBe("provider_rate_limit");
      expect(classifyFailure("Timed out waiting for response")).toBe("provider_timeout");
      expect(classifyFailure("Fetch failed econnrefused")).toBe("provider_unreachable");
      expect(classifyFailure("Could not extract JSON")).toBe("provider_json_format");
      expect(classifyFailure("Quality gate blocked")).toBe("quality_gate");
      expect(classifyFailure("eslint error")).toBe("lint");
      expect(classifyFailure("TypeScript error")).toBe("typecheck");
      expect(classifyFailure("e2e check failed")).toBe("e2e");
      expect(classifyFailure("unit tests failed")).toBe("tests");
      expect(classifyFailure("something else")).toBe("other");
    });

    it("returns unknown for empty message", () => {
      expect(classifyFailure("")).toBe("unknown");
    });
  });

  describe("isUsefulLog", () => {
    it("returns true for stage_failed", () => {
      expect(isUsefulLog({ event: "stage_failed" })).toBe(true);
    });

    it("returns true for specific stage_note types", () => {
      expect(isUsefulLog({ event: "stage_note", note: "investigation_summary" })).toBe(true);
      expect(isUsefulLog({ event: "stage_note", outputSummary: { blockingFailures: 1 } })).toBe(true);
      expect(isUsefulLog({ event: "stage_note", outputSummary: { failuresCount: 5 } })).toBe(true);
    });

    it("returns false for generic logs", () => {
      expect(isUsefulLog({ event: "stage_started" })).toBe(false);
      expect(isUsefulLog({ event: "stage_note", note: "some note" })).toBe(false);
    });
  });

  describe("parseMetricsTimestamp", () => {
    it("parses numeric strings (ms)", () => {
      const now = Date.now();
      expect(parseMetricsTimestamp(now.toString())).toBe(now);
    });

    it("parses numeric strings (seconds)", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(parseMetricsTimestamp(nowSeconds.toString())).toBe(nowSeconds * 1000);
    });

    it("parses custom format YYYYMMDD-HHMMSS", () => {
      // 20240101-120000 => 2024-01-01T12:00:00Z
      const expected = Date.UTC(2024, 0, 1, 12, 0, 0);
      expect(parseMetricsTimestamp("20240101-120000")).toBe(expected);
    });

    it("parses ISO strings", () => {
      const iso = "2024-01-01T00:00:00Z";
      expect(parseMetricsTimestamp(iso)).toBe(Date.parse(iso));
    });

    it("returns null for empty or invalid input", () => {
      expect(parseMetricsTimestamp(undefined)).toBeNull();
      expect(parseMetricsTimestamp("")).toBeNull();
      expect(parseMetricsTimestamp("invalid")).toBeNull();
    });
  });
});
