import { describe, expect, it, vi } from "vitest";
import { 
  nowIso, 
  todayDate, 
  slugify, 
  randomId, 
  sleep, 
  extractJsonFromText, 
  isTruthy 
} from "./utils.js";

describe("lib/utils", () => {
  describe("nowIso", () => {
    it("returns an ISO string", () => {
      const res = nowIso();
      expect(res).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("todayDate", () => {
    it("returns YYYY-MM-DD", () => {
      const res = todayDate();
      expect(res).toMatch(/^\d{4}-\d{2}-\d{2}$$/);
    });
  });

  describe("slugify", () => {
    it("converts to lowercase and replaces special chars", () => {
      expect(slugify("Hello World!")).toBe("hello-world");
      expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
      expect(slugify("special@#$chars")).toBe("special-chars");
    });

    it("truncates at 60 chars", () => {
      const long = "a".repeat(100);
      expect(slugify(long)).toHaveLength(60);
    });
  });

  describe("randomId", () => {
    it("returns string of requested length", () => {
      expect(randomId(10)).toHaveLength(10);
      expect(randomId()).toHaveLength(6);
    });
  });

  describe("sleep", () => {
    it("resolves after timeout", async () => {
      vi.useFakeTimers();
      const promise = sleep(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe("extractJsonFromText", () => {
    it("parses direct JSON", () => {
      expect(extractJsonFromText('{"a":1}')).toEqual({ a: 1 });
      expect(extractJsonFromText('[1,2]')).toEqual([1, 2]);
    });

    it("extracts from code fences", () => {
      expect(extractJsonFromText('Here is the json: \n```json\n{"ok":true}\n```')).toEqual({ ok: true });
      expect(extractJsonFromText('```\n{"ok":false}\n```')).toEqual({ ok: false });
    });

    it("extracts from partial braces", () => {
      expect(extractJsonFromText('The result is { "status": "all good" } finally.')).toEqual({ status: "all good" });
    });

    it("throws if no JSON found", () => {
      expect(() => extractJsonFromText("no json here")).toThrow("Could not extract JSON");
    });
  });

  describe("isTruthy", () => {
    it("returns true for y, yes, true, 1", () => {
      expect(isTruthy("y")).toBe(true);
      expect(isTruthy("YES")).toBe(true);
      expect(isTruthy("true")).toBe(true);
      expect(isTruthy("1")).toBe(true);
    });

    it("returns false for others", () => {
      expect(isTruthy("n")).toBe(false);
      expect(isTruthy("0")).toBe(false);
      expect(isTruthy("foo")).toBe(false);
    });
  });
});
