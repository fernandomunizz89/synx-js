import { describe, it, expect } from "vitest";
import { 
  normalizePathToken, 
  extractQaFailures, 
  contextMentionsE2e, 
  textSignalsMissingE2eSpecs, 
  hasQaMissingE2eSpecSignal, 
  formatQaFindingsForView, 
  compactQaFindingsForModel, 
  compactQaHistoryForModel, 
  buildQaFeedbackQuery, 
  contextLimitsForIteration, 
  editSignature, 
  hasE2eInfraEdits, 
  hasSourceEdits, 
  extractSymbolContractFileHints 
} from "./bug-fixer-logic.js";

describe("bug-fixer-logic", () => {
  describe("normalizePathToken", () => {
    it("should normalize paths correctly", () => {
      expect(normalizePathToken("  ./src/file.ts  ")).toBe("src/file.ts");
      expect(normalizePathToken("src\\file.ts")).toBe("src/file.ts");
    });
  });

  describe("extractQaFailures", () => {
    it("should extract failures from stage envelope", () => {
      const envelope = { output: { failures: ["fail1", "fail2"] } };
      expect(extractQaFailures(envelope)).toEqual(["fail1", "fail2"]);
    });

    it("should return empty for invalid input", () => {
      expect(extractQaFailures(null)).toEqual([]);
      expect(extractQaFailures({})).toEqual([]);
      expect(extractQaFailures({ output: {} })).toEqual([]);
    });
  });

  describe("E2E signals", () => {
    it("contextMentionsE2e should detect e2e words", () => {
      expect(contextMentionsE2e("running e2e tests")).toBe(true);
      expect(contextMentionsE2e("doing nothing")).toBe(false);
    });

    it("textSignalsMissingE2eSpecs should detect missing spec words", () => {
      expect(textSignalsMissingE2eSpecs("did not find e2e spec files")).toBe(true);
      expect(textSignalsMissingE2eSpecs("all good")).toBe(false);
    });

    it("hasQaMissingE2eSpecSignal should detect missing spec signal in findings", () => {
      const args = {
        qaFailures: [],
        latestFindings: [{ issue: "no spec files were found", expectedResult: "", receivedResult: "", evidence: [], recommendedAction: "" }],
        cumulativeFindings: []
      };
      expect(hasQaMissingE2eSpecSignal(args)).toBe(true);
    });
  });

  describe("formatQaFindingsForView", () => {
    it("should format findings correctly", () => {
      const findings = [{ issue: "I1", expectedResult: "E1", receivedResult: "R1", recommendedAction: "A1" }];
      const result = formatQaFindingsForView(findings);
      expect(result).toContain("1. I1");
      expect(result).toContain("Expected: E1");
      expect(result).toContain("Received: R1");
      expect(result).toContain("Recommended action: A1");
    });

    it("should return [none] for empty findings", () => {
      expect(formatQaFindingsForView([])).toBe("- [none]");
    });
  });

  describe("compactQaFindingsForModel", () => {
    it("should compact findings and limit items", () => {
      const findings = Array(10).fill({ issue: "a".repeat(200), expectedResult: "E", receivedResult: "R", evidence: ["ev"], recommendedAction: "A" });
      const result = compactQaFindingsForModel(findings as any, 2);
      expect(result).toHaveLength(2);
      expect(result[0].issue).toHaveLength(180);
    });
  });

  describe("compactQaHistoryForModel", () => {
    it("should compact history and limit items", () => {
      const history = Array(10).fill({ attempt: 1, summary: "S", returnedTo: "D", findings: [{ issue: "I" }] });
      const result = compactQaHistoryForModel(history as any);
      expect(result).toHaveLength(4);
    });
  });

  describe("buildQaFeedbackQuery", () => {
    it("should build query string correctly", () => {
      const args = {
        title: "Title",
        rawRequest: "Req",
        qaFailures: ["F1"],
        latestFindings: [{ issue: "I1", expectedResult: "E1", receivedResult: "R1", evidence: ["Ev1"], recommendedAction: "A1" }],
        repeatedIssues: ["R1"]
      };
      const result = buildQaFeedbackQuery(args);
      expect(result).toContain("Title");
      expect(result).toContain("QA Failures:");
      expect(result).toContain("Latest QA Expected vs Received:");
      expect(result).toContain("Repeated QA Issues:");
    });
  });

  describe("contextLimitsForIteration", () => {
    it("should return different limits based on attempt", () => {
      expect(contextLimitsForIteration(1).maxContextFiles).toBe(10);
      expect(contextLimitsForIteration(2).maxContextFiles).toBe(8);
    });
  });

  describe("editSignature", () => {
    it("should generate a stable signature for edits", () => {
      const edits = [
        { path: "b.ts", action: "edit", find: "x", replace: "y" },
        { path: "a.ts", action: "edit", find: "1", replace: "2" }
      ];
      const sig = editSignature(edits as any);
      expect(sig).toContain("edit|a.ts|1|2|0");
      expect(sig).toContain("||edit|b.ts|x|y|0");
      // Check sorting
      expect(sig.startsWith("edit|a.ts")).toBe(true);
    });
  });

  describe("hasE2eInfraEdits", () => {
    it("should detect E2E related edits", () => {
      expect(hasE2eInfraEdits([{ path: "src/file.spec.ts" }])).toBe(true);
      expect(hasE2eInfraEdits([{ path: "package.json" }])).toBe(true);
      expect(hasE2eInfraEdits([{ path: "src/app.ts" }])).toBe(false);
    });
  });

  describe("hasSourceEdits", () => {
    it("should detect source related edits", () => {
      expect(hasSourceEdits([{ path: "src/app.ts" }])).toBe(true);
      expect(hasSourceEdits([{ path: "README.md" }])).toBe(false);
    });
  });

  describe("extractSymbolContractFileHints", () => {
    it("should extract hinted paths", () => {
      const value = [{ modulePath: "mod.ts", importerPath: "imp.ts" }];
      expect(extractSymbolContractFileHints(value)).toEqual(["mod.ts", "imp.ts"]);
    });
  });
});
