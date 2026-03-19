import { trimText } from "../text-utils.js";

export type QaRemediationAgent =
  | "Synx Front Expert"
  | "Synx Mobile Expert"
  | "Synx Back Expert"
  | "Synx SEO Specialist";

export interface QaReturnContextItem {
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}

export const DEFAULT_MAX_FINDINGS = 6;
export const DEFAULT_MAX_EVIDENCE = 3;
export const DEFAULT_MAX_TEXT_CHARS = 220;

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

export function isQaRemediationAgent(value: string): value is QaRemediationAgent {
  return (
    value === "Synx Front Expert" ||
    value === "Synx Mobile Expert" ||
    value === "Synx Back Expert" ||
    value === "Synx SEO Specialist"
  );
}

export function contextKey(item: QaReturnContextItem): string {
  return `${item.issue.toLowerCase()}|||${item.expectedResult.toLowerCase()}|||${item.receivedResult.toLowerCase()}`;
}

export function normalizeIssueKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isGenericFallbackItem(item: QaReturnContextItem): boolean {
  return /acceptance criteria and validation checks should pass\.?/i.test(item.expectedResult);
}

export function isLowSignalFallbackText(value: string): boolean {
  const lower = value.toLowerCase().trim();
  if (!lower) return true;
  return /acceptance criteria and validation checks should pass|address this blocker directly and verify with relevant checks|no concrete evidence provided|missing actual content|no verification provided/.test(lower);
}

export function issueOverlaps(a: string, b: string): boolean {
  const aa = normalizeIssueKey(a);
  const bb = normalizeIssueKey(b);
  return aa.includes(bb) || bb.includes(aa);
}

export function normalizeQaReturnContextItems(value: unknown): QaReturnContextItem[] {
  if (!Array.isArray(value)) return [];
  const normalized: QaReturnContextItem[] = [];

  for (const rawItem of value) {
    const raw = asObject(rawItem);
    if (!raw) continue;

    const issue = asText(raw.issue ?? raw.title ?? raw.problem);
    const expectedResult = asText(raw.expectedResult ?? raw.expected);
    const receivedResult = asText(raw.receivedResult ?? raw.received ?? raw.actualResult);
    if (!issue || !expectedResult || !receivedResult) continue;

    const evidence = asStringArray(raw.evidence);
    const recommendedAction = asText(raw.recommendedAction ?? raw.recommendation ?? raw.fixSuggestion ?? raw.action);

    normalized.push({
      issue,
      expectedResult,
      receivedResult,
      evidence,
      recommendedAction,
    });
  }

  return mergeQaReturnContextItems(normalized);
}

export function mergeQaReturnContextItems(items: QaReturnContextItem[]): QaReturnContextItem[] {
  const merged = new Map<string, QaReturnContextItem>();

  for (const item of items) {
    if (!item.issue || !item.expectedResult || !item.receivedResult) continue;
    const key = contextKey(item);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        issue: item.issue.trim(),
        expectedResult: item.expectedResult.trim(),
        receivedResult: item.receivedResult.trim(),
        evidence: Array.from(new Set(item.evidence.map((x) => x.trim()).filter(Boolean))),
        recommendedAction: item.recommendedAction.trim(),
      });
      continue;
    }

    current.evidence = Array.from(
      new Set([...current.evidence, ...item.evidence].map((x) => x.trim()).filter(Boolean)),
    );
    if (!current.recommendedAction && item.recommendedAction.trim()) {
      current.recommendedAction = item.recommendedAction.trim();
    }
  }

  return Array.from(merged.values());
}

export function compactQaReturnContextItems(
  items: QaReturnContextItem[],
  options?: {
    maxItems?: number;
    maxEvidencePerItem?: number;
    maxTextChars?: number;
  },
): QaReturnContextItem[] {
  const maxItems = options?.maxItems ?? DEFAULT_MAX_FINDINGS;
  const maxEvidencePerItem = options?.maxEvidencePerItem ?? DEFAULT_MAX_EVIDENCE;
  const maxTextChars = options?.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;

  const merged = mergeQaReturnContextItems(items)
    .map((item) => ({
      issue: trimText(item.issue, maxTextChars),
      expectedResult: trimText(item.expectedResult, maxTextChars),
      receivedResult: trimText(item.receivedResult, maxTextChars),
      evidence: item.evidence
        .map((x) => trimText(x, maxTextChars))
        .filter(Boolean)
        .slice(0, maxEvidencePerItem),
      recommendedAction: trimText(item.recommendedAction || "Address this blocker and re-run relevant checks.", maxTextChars),
    }));

  const nonGeneric = merged.filter((item) => !isGenericFallbackItem(item));
  const filtered = merged.filter((item) => {
    const hasEvidence = item.evidence.length > 0;
    if (!hasEvidence && (
      isLowSignalFallbackText(item.issue)
      || isLowSignalFallbackText(item.receivedResult)
      || isLowSignalFallbackText(item.recommendedAction)
    )) {
      return false;
    }
    if (!isGenericFallbackItem(item)) return true;
    return !nonGeneric.some((x) => issueOverlaps(x.issue, item.issue) || issueOverlaps(x.receivedResult, item.receivedResult));
  });

  filtered.sort((a, b) => {
    const score = (value: QaReturnContextItem): number => {
      const evidenceScore = Math.min(2, value.evidence.length);
      const nonGenericScore = isGenericFallbackItem(value) ? 0 : 3;
      return nonGenericScore + evidenceScore;
    };
    return score(b) - score(a);
  });

  return filtered.slice(0, maxItems);
}
