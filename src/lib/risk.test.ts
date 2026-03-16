import { describe, expect, it } from "vitest";
import { normalizeRiskLevel, raiseRisk } from "./risk.js";

describe("risk", () => {
  it("normalizes known levels and falls back to unknown", () => {
    expect(normalizeRiskLevel("HIGH")).toBe("high");
    expect(normalizeRiskLevel(" medium ")).toBe("medium");
    expect(normalizeRiskLevel(undefined)).toBe("unknown");
    expect(normalizeRiskLevel("invalid-level")).toBe("unknown");
  });

  it("raises risk only when candidate is higher", () => {
    expect(raiseRisk("low", "high")).toBe("high");
    expect(raiseRisk("medium", "low")).toBe("medium");
    expect(raiseRisk("unknown", "low")).toBe("low");
  });
});
