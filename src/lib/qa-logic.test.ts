import { describe, it, expect } from "vitest";
import { 
  normalizeRiskLevel, 
  raiseRisk, 
  uniqueNormalized, 
  formatTestCasesForView, 
  formatReturnContextForView, 
  formatReturnHistoryForView, 
  trimText 
} from "./qa-logic.js";

describe("qa-logic", () => {
  describe("normalizeRiskLevel", () => {
    it("should normalize valid risk levels", () => {
      expect(normalizeRiskLevel("low")).toBe("low");
      expect(normalizeRiskLevel("MEDIUM")).toBe("medium");
      expect(normalizeRiskLevel("  high  ")).toBe("high");
    });

    it("should return 'none' for invalid risk levels", () => {
      expect(normalizeRiskLevel("extreme")).toBe("none");
      expect(normalizeRiskLevel("")).toBe("none");
      expect(normalizeRiskLevel(null as any)).toBe("none");
    });
  });

  describe("raiseRisk", () => {
    it("should raise risk if target is higher", () => {
      expect(raiseRisk("none", "low")).toBe("low");
      expect(raiseRisk("low", "high")).toBe("high");
    });

    it("should not lower risk if target is lower", () => {
      expect(raiseRisk("high", "low")).toBe("high");
      expect(raiseRisk("medium", "none")).toBe("medium");
    });

    it("should keep risk same if equal", () => {
      expect(raiseRisk("medium", "medium")).toBe("medium");
    });
  });

  describe("uniqueNormalized", () => {
    it("should remove duplicates and trim strings", () => {
      expect(uniqueNormalized([" a ", "b", "a ", " c"])).toEqual(["a", "b", "c"]);
    });

    it("should filter out empty strings", () => {
      expect(uniqueNormalized(["a", "", " ", "b"])).toEqual(["a", "b"]);
    });
  });

  describe("formatTestCasesForView", () => {
    it("should format test cases correctly", () => {
      const testCases = [
        { id: "TC1", title: "Test 1", scenario: "Scen 1", expected: "Exp 1", status: "passed" as const },
        { id: "TC2", title: "Test 2", scenario: "Scen 2", expected: "Exp 2", status: "failed" as const }
      ];
      const result = formatTestCasesForView(testCases);
      expect(result).toContain("- [x] **TC1**: Test 1");
      expect(result).toContain("- [ ] **TC2**: Test 2");
      expect(result).toContain("Scenario: Scen 1");
    });

    it("should return [none] for empty list", () => {
      expect(formatTestCasesForView([])).toBe("- [none]");
    });
  });

  describe("formatReturnContextForView", () => {
    it("should format findings correctly", () => {
      const findings = [
        { 
          issue: "Issue 1", 
          expectedResult: "Exp 1", 
          receivedResult: "Rec 1", 
          evidence: ["Ev 1"], 
          recommendedAction: "Act 1",
          occurrences: 1
        }
      ];
      const result = formatReturnContextForView(findings as any);
      expect(result).toContain("1. Issue 1");
      expect(result).toContain("Expected: Exp 1");
      expect(result).toContain("Received: Rec 1");
      expect(result).toContain("Evidence: Ev 1");
      expect(result).toContain("Recommended action: Act 1");
    });

    it("should handle empty evidence and action", () => {
        const findings = [
          { 
            issue: "Issue 1", 
            expectedResult: "Exp 1", 
            receivedResult: "Rec 1", 
            evidence: [], 
            recommendedAction: "",
            occurrences: 1
          }
        ];
        const result = formatReturnContextForView(findings as any);
        expect(result).toContain("Evidence: [none]");
        expect(result).toContain("Recommended action: [none]");
      });

    it("should return [none] for empty list", () => {
      expect(formatReturnContextForView([])).toBe("- [none]");
    });
  });

  describe("formatReturnHistoryForView", () => {
    it("should format history correctly", () => {
      const history = [
        { attempt: 1, returnedTo: "Dev", findings: [{}], summary: "Sum 1" }
      ];
      const result = formatReturnHistoryForView(history as any);
      expect(result).toBe("- Attempt 1 -> Dev | findings=1 | Sum 1");
    });

    it("should handle missing summary", () => {
        const history = [
          { attempt: 1, returnedTo: "Dev", findings: [], summary: "" }
        ];
        const result = formatReturnHistoryForView(history as any);
        expect(result).toContain("[no summary]");
      });

    it("should return [none] for empty list", () => {
      expect(formatReturnHistoryForView([])).toBe("- [none]");
    });
  });

  describe("trimText", () => {
    it("should trim long text", () => {
      expect(trimText("hello world", 5)).toBe("hell…");
    });

    it("should not trim short text", () => {
      expect(trimText("hi", 5)).toBe("hi");
    });
  });
});
