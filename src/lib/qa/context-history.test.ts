import { describe, expect, it } from "vitest";
import {
  normalizeQaReturnHistoryEntries,
  compactQaReturnHistoryEntries,
  buildQaCumulativeFindings,
  buildFallbackQaReturnContextItems,
  extractQaHandoffContext,
} from "./context-history.js";

describe("lib/qa/context-history", () => {
  describe("normalizeQaReturnHistoryEntries", () => {
    it("returns empty array for non-array input", () => {
      expect(normalizeQaReturnHistoryEntries(null)).toEqual([]);
      expect(normalizeQaReturnHistoryEntries({})).toEqual([]);
    });

    it("normalizes and sorts valid history entries", () => {
      const input = [
        {
          attempt: 2,
          returnedTo: "Synx Front Expert",
          summary: "Fix A",
          returnedAt: "2024-01-01T12:00:00Z",
          failures: ["fail 1"],
          findings: [{ issue: "I1", expectedResult: "E1", receivedResult: "R1" }],
        },
        {
          attempt: 1,
          returnedTo: "Human Review",
          summary: "Fix B",
          returnedAt: "2024-01-01T11:00:00Z",
          failures: ["fail 2"],
          findings: [],
        },
      ];

      const result = normalizeQaReturnHistoryEntries(input);
      expect(result).toHaveLength(2);
      expect(result[0].attempt).toBe(1);
      expect(result[1].attempt).toBe(2);
      expect(result[1].returnedTo).toBe("Synx Front Expert");
    });

    it("skips invalid entries", () => {
      const input = [
        { attempt: 0, returnedTo: "Human Review" }, // invalid attempt
        { attempt: 1, returnedTo: "Invalid Agent" }, // invalid agent
        { attempt: 1, returnedTo: "Human Review" }, // valid
      ];
      expect(normalizeQaReturnHistoryEntries(input)).toHaveLength(1);
    });
  });

  describe("compactQaReturnHistoryEntries", () => {
    it("limits the number of entries and findings", () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        attempt: i + 1,
        returnedTo: "Human Review" as const,
        summary: "Summary " + i,
        returnedAt: "at",
        failures: ["f1", "f2", "f3", "f4", "f5", "f6", "f7"],
        findings: Array.from({ length: 10 }, (_, j) => ({
          issue: "Issue " + j,
          expectedResult: "E",
          receivedResult: "R",
          evidence: [],
          recommendedAction: "A",
        })),
      }));

      const compacted = compactQaReturnHistoryEntries(entries, { maxEntries: 3, maxFindingsPerEntry: 2 });
      expect(compacted).toHaveLength(3);
      expect(compacted[0].attempt).toBe(8);
      expect(compacted[2].attempt).toBe(10);
      expect(compacted[0].failures).toHaveLength(2);
      expect(compacted[0].findings).toHaveLength(2);
    });
  });

  describe("buildQaCumulativeFindings", () => {
    it("merges findings across attempts and sorts by occurrences", () => {
      const history = [
        {
          attempt: 1,
          returnedAt: "",
          returnedTo: "Human Review" as const,
          summary: "",
          failures: [],
          findings: [
            { issue: "Issue A", expectedResult: "EA", receivedResult: "RA1", evidence: ["ev1"], recommendedAction: "rec1" },
            { issue: "Issue B", expectedResult: "EB", receivedResult: "RB1", evidence: ["ev2"], recommendedAction: "rec2" },
          ],
        },
        {
          attempt: 2,
          returnedAt: "",
          returnedTo: "Human Review" as const,
          summary: "",
          failures: [],
          findings: [
            { issue: "Issue A", expectedResult: "EA", receivedResult: "RA2", evidence: ["ev3"], recommendedAction: "rec1-updated" },
          ],
        },
      ];

      const cumulative = buildQaCumulativeFindings(history);
      expect(cumulative).toHaveLength(2);
      expect(cumulative[0].issue).toBe("Issue A");
      expect(cumulative[0].occurrences).toBe(2);
      expect(cumulative[0].firstSeenAttempt).toBe(1);
      expect(cumulative[0].lastSeenAttempt).toBe(2);
      expect(cumulative[0].evidence).toContain("ev1");
      expect(cumulative[0].evidence).toContain("ev3");
      expect(cumulative[0].recommendedAction).toBe("rec1-updated");

      expect(cumulative[1].issue).toBe("Issue B");
      expect(cumulative[1].occurrences).toBe(1);
    });
  });

  describe("buildFallbackQaReturnContextItems", () => {
    it("identifies failed checks", () => {
      const failures = ["Check failed: npm run test (exit 1)"];
      const executedChecks = [{ command: "npm run test", status: "failed", exitCode: 1 }];
      const items = buildFallbackQaReturnContextItems({ failures, executedChecks, changedFiles: [] });

      expect(items).toHaveLength(1);
      expect(items[0].issue).toBe("Failed check: npm run test");
      expect(items[0].receivedResult).toBe("npm run test failed with exit code 1.");
    });

    it("identifies missing code changes", () => {
      const failures = ["No code changes detected in git diff"];
      const items = buildFallbackQaReturnContextItems({ failures, executedChecks: [], changedFiles: [] });
      expect(items).toHaveLength(1);
      expect(items[0].issue).toBe("No code changes detected");
    });

    it("avoids duplicates from existing findings", () => {
      const failures = ["Check failed: vitest (exit 1)"];
      const existing = [{ issue: "vitest failed", expectedResult: "E", receivedResult: "R", evidence: [], recommendedAction: "" }];
      const items = buildFallbackQaReturnContextItems({ failures, executedChecks: [], existing, changedFiles: [] });
      expect(items).toHaveLength(0);
    });
  });

  describe("extractQaHandoffContext", () => {
    it("returns null for invalid stage output", () => {
      expect(extractQaHandoffContext({})).toBeNull();
      expect(extractQaHandoffContext({ output: {} })).toBeNull();
    });

    it("extracts valid context from stage output", () => {
      const stage = {
        output: {
          qaHandoffContext: {
            attempt: 1,
            maxRetries: 3,
            returnedTo: "Human Review",
            summary: "Test summary",
            latestFindings: [],
            history: [],
          },
        },
      };
      const context = extractQaHandoffContext(stage);
      expect(context).not.toBeNull();
      expect(context?.attempt).toBe(1);
      expect(context?.returnedTo).toBe("Human Review");
    });
  });
});
