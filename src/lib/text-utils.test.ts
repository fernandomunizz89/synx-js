import { describe, expect, it } from "vitest";
import { normalizeIssueLine, trimText, unique, uniqueNormalized } from "./text-utils.js";

describe("text-utils", () => {
  it("deduplicates and trims with unique", () => {
    const result = unique(["  alpha  ", "alpha", "", "beta", " beta "]);
    expect(result).toEqual(["alpha", "beta"]);
  });

  it("trims and truncates text with trimText", () => {
    expect(trimText("  ok  ", 10)).toBe("ok");
    expect(trimText("abcdefgh", 4)).toBe("abc…");
  });

  it("normalizes issue lines", () => {
    expect(normalizeIssueLine("  Something   failed...  ")).toBe("Something failed");
  });

  it("normalizes and deduplicates case-insensitively with uniqueNormalized", () => {
    const result = uniqueNormalized([
      "Error: missing export.",
      "error:   missing   export..",
      "Another issue.",
    ]);
    expect(result).toEqual(["Error: missing export", "Another issue"]);
  });
});
