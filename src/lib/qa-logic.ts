import { 
  type QaHandoffContext as BaseQaHandoffContext, 
  type QaReturnContextItem, 
  type QaReturnHistoryEntry,
  type QaCumulativeFinding,
  compactQaReturnHistoryEntries as baseCompactQaReturnHistoryEntries,
  buildQaCumulativeFindings as baseBuildQaCumulativeFindings,
  normalizeQaReturnHistoryEntries as baseNormalizeQaReturnHistoryEntries,
  compactQaReturnContextItems as baseCompactQaReturnContextItems,
  buildFallbackQaReturnContextItems as baseBuildFallbackQaReturnContextItems
} from "./qa-context.js";

export { 
  type QaReturnContextItem, 
  type QaReturnHistoryEntry,
  type QaCumulativeFinding,
  type BaseQaHandoffContext as QaHandoffContext
};

export {
    baseCompactQaReturnHistoryEntries as compactQaReturnHistoryEntries,
    baseBuildQaCumulativeFindings as buildQaCumulativeFindings,
    baseNormalizeQaReturnHistoryEntries as normalizeQaReturnHistoryEntries,
    baseCompactQaReturnContextItems as compactQaReturnContextItems,
    baseBuildFallbackQaReturnContextItems as buildFallbackQaReturnContextItems
};

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface TechnicalRiskSummary {
  buildRisk: RiskLevel;
  syntaxRisk: RiskLevel;
  importExportRisk: RiskLevel;
  referenceRisk: RiskLevel;
  logicRisk: RiskLevel;
  regressionRisk: RiskLevel;
}

export interface QaTestCase {
  id: string;
  title: string;
  scenario: string;
  expected: string;
  status: "pending" | "passed" | "failed" | "skipped";
}

export function normalizeRiskLevel(level: string): RiskLevel {
  const normalized = String(level || "").trim().toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) return normalized as RiskLevel;
  return "none";
}

export function raiseRisk(current: RiskLevel, target: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["none", "low", "medium", "high"];
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  return targetIndex > currentIndex ? target : current;
}

export function uniqueNormalized(items: string[]): string[] {
  return Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
}

export function formatTestCasesForView(testCases: QaTestCase[]): string {
  if (!testCases.length) return "- [none]";
  return testCases
    .map((tc) => {
        const marker = tc.status === "passed" ? "x" : " ";
        return `- [${marker}] **${tc.id}**: ${tc.title}\n  - Scenario: ${tc.scenario}\n  - Expected: ${tc.expected}`;
    })
    .join("\n");
}

export function formatReturnContextForView(findings: QaReturnContextItem[]): string {
  if (!findings.length) return "- [none]";
  return findings
    .map((f, index) => {
      const evidence = f.evidence.length ? f.evidence.join(" | ") : "[none]";
      const action = f.recommendedAction || "[none]";
      return `${index + 1}. ${f.issue}\n   Expected: ${f.expectedResult}\n   Received: ${f.receivedResult}\n   Evidence: ${evidence}\n   Recommended action: ${action}`;
    })
    .join("\n");
}

export function formatReturnHistoryForView(history: QaReturnHistoryEntry[]): string {
  if (!history.length) return "- [none]";
  return history
    .map((h) => `- Attempt ${h.attempt} -> ${h.returnedTo} | findings=${h.findings.length} | ${h.summary || "[no summary]"}`)
    .join("\n");
}

export function trimText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
