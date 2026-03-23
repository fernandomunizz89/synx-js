import { trimText } from "../text-utils.js";
import {
  asObject,
  asStringArray,
  asText,
  compactQaReturnContextItems,
  DEFAULT_MAX_FINDINGS,
  DEFAULT_MAX_TEXT_CHARS,
  isQaRemediationAgent,
  issueOverlaps,
  isLowSignalFallbackText,
  normalizeQaReturnContextItems,
  type QaRemediationAgent,
  type QaReturnContextItem,
} from "./context-utils.js";

export interface QaReturnHistoryEntry {
  attempt: number;
  returnedAt: string;
  returnedTo: "Human Review" | QaRemediationAgent;
  summary: string;
  failures: string[];
  findings: QaReturnContextItem[];
  // Phase 4.4 — Smart QA Retry
  retryStrategy?: "local_patch" | "expanded_context" | "strategy_shift";
  retryCategory?: string;
}

export interface QaCumulativeFinding extends QaReturnContextItem {
  firstSeenAttempt: number;
  lastSeenAttempt: number;
  occurrences: number;
}

export interface QaHandoffContext {
  attempt: number;
  maxRetries: number;
  returnedTo: "Human Review" | QaRemediationAgent;
  summary: string;
  latestFindings: QaReturnContextItem[];
  cumulativeFindings: QaCumulativeFinding[];
  history: QaReturnHistoryEntry[];
  // Phase 4.4 — Smart QA Retry
  retryStrategy?: "local_patch" | "expanded_context" | "strategy_shift";
  retryInstructions?: string;
  noProgressAbort?: boolean;
}

export interface CheckLike {
  command: string;
  status: string;
  exitCode: number | null;
}

export const DEFAULT_MAX_HISTORY_ENTRIES = 6;
export const DEFAULT_MAX_CUMULATIVE_FINDINGS = 10;

export function normalizeQaReturnHistoryEntries(value: unknown): QaReturnHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized: QaReturnHistoryEntry[] = [];

  for (const rawEntry of value) {
    const raw = asObject(rawEntry);
    if (!raw) continue;
    const attemptRaw = raw.attempt;
    const attempt = typeof attemptRaw === "number" && Number.isFinite(attemptRaw) ? Math.floor(attemptRaw) : 0;
    const returnedTo = asText(raw.returnedTo);
    if (attempt < 1 || (returnedTo !== "Human Review" && !isQaRemediationAgent(returnedTo))) continue;

    normalized.push({
      attempt,
      returnedAt: asText(raw.returnedAt) || "",
      returnedTo,
      summary: asText(raw.summary),
      failures: asStringArray(raw.failures),
      findings: normalizeQaReturnContextItems(raw.findings),
    });
  }

  return normalized.sort((a, b) => a.attempt - b.attempt);
}

export function compactQaReturnHistoryEntries(
  entries: QaReturnHistoryEntry[],
  options?: {
    maxEntries?: number;
    maxFindingsPerEntry?: number;
  },
): QaReturnHistoryEntry[] {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_HISTORY_ENTRIES;
  const maxFindingsPerEntry = options?.maxFindingsPerEntry ?? DEFAULT_MAX_FINDINGS;
  const recent = [...entries].sort((a, b) => a.attempt - b.attempt).slice(-maxEntries);
  return recent.map((entry) => ({
    ...entry,
    summary: trimText(entry.summary, DEFAULT_MAX_TEXT_CHARS),
    failures: entry.failures.map((x) => trimText(x, DEFAULT_MAX_TEXT_CHARS)).slice(0, maxFindingsPerEntry),
    findings: compactQaReturnContextItems(entry.findings, { maxItems: maxFindingsPerEntry }),
  }));
}

export function buildQaCumulativeFindings(history: QaReturnHistoryEntry[]): QaCumulativeFinding[] {
  const merged = new Map<string, QaCumulativeFinding>();

  for (const entry of history) {
    for (const finding of entry.findings) {
      const key = finding.issue.toLowerCase().trim();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...finding,
          firstSeenAttempt: entry.attempt,
          lastSeenAttempt: entry.attempt,
          occurrences: 1,
        });
        continue;
      }

      existing.lastSeenAttempt = entry.attempt;
      existing.occurrences += 1;
      existing.expectedResult = finding.expectedResult;
      existing.receivedResult = finding.receivedResult;
      existing.evidence = Array.from(new Set([...existing.evidence, ...finding.evidence]));
      if (finding.recommendedAction.trim()) {
        existing.recommendedAction = finding.recommendedAction.trim();
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.occurrences - a.occurrences || a.firstSeenAttempt - b.firstSeenAttempt)
    .slice(0, DEFAULT_MAX_CUMULATIVE_FINDINGS);
}

export function buildFallbackQaReturnContextItems(args: {
  failures: string[];
  changedFiles: string[];
  executedChecks: CheckLike[];
  existing?: QaReturnContextItem[];
}): QaReturnContextItem[] {
  const items: QaReturnContextItem[] = [];
  const checks = args.executedChecks;
  const changedFiles = args.changedFiles;
  const existing = args.existing ?? [];

  const hasExistingOverlap = (issue: string): boolean => {
    return existing.some((item) => issueOverlaps(item.issue, issue) || issueOverlaps(item.receivedResult, issue));
  };

  for (const failure of args.failures) {
    const normalizedFailure = failure.trim();
    if (!normalizedFailure) continue;

    const failedCheckMatch = normalizedFailure.match(/^Check failed:\s*(.+?)\s*\(exit\s*([^)]+)\)/i);
    if (failedCheckMatch) {
      const command = failedCheckMatch[1].trim();
      const exitCode = failedCheckMatch[2].trim();
      const alreadyCoveredByExisting = hasExistingOverlap(normalizedFailure)
        || existing.some((item) =>
          item.issue.toLowerCase().includes(command.toLowerCase())
          || item.receivedResult.toLowerCase().includes(command.toLowerCase())
          || item.evidence.some((e) => e.toLowerCase().includes(command.toLowerCase())),
        );
      if (alreadyCoveredByExisting) continue;
      const checkEvidence = checks
        .filter((x) => x.command.includes(command))
        .map((x) => `${x.command} => status=${x.status}, exit=${x.exitCode ?? "null"}`);
      items.push({
        issue: `Failed check: ${command}`,
        expectedResult: `${command} should pass with exit code 0.`,
        receivedResult: `${command} failed with exit code ${exitCode}.`,
        evidence: checkEvidence,
        recommendedAction: "Fix the failing check and keep the command listed in testsToRun.",
      });
      continue;
    }

    if (/no code changes detected in git diff/i.test(normalizedFailure)) {
      if (hasExistingOverlap("No code changes detected")) continue;
      items.push({
        issue: "No code changes detected",
        expectedResult: "Relevant source/test/config files should be present in git diff.",
        receivedResult: "git diff reported zero changed files during QA.",
        evidence: [`changedFiles=${changedFiles.length}`],
        recommendedAction: "Apply concrete edits tied to the request and verify they appear in git diff.",
      });
      continue;
    }

    if (/no e2e check was executed/i.test(normalizedFailure)) {
      if (hasExistingOverlap("Missing E2E execution evidence")) continue;
      items.push({
        issue: "Missing E2E execution evidence",
        expectedResult: "At least one E2E command should execute and be recorded in QA checks.",
        receivedResult: "QA found no executed E2E command in validation evidence.",
        evidence: checks.map((x) => `${x.command} => ${x.status}`),
        recommendedAction: "Add a runnable E2E script and execute it before handoff.",
      });
      continue;
    }

    if (/no unit test file changes were detected/i.test(normalizedFailure)) {
      if (hasExistingOverlap("Missing unit-test evidence")) continue;
      items.push({
        issue: "Missing unit-test evidence",
        expectedResult: "At least one relevant unit test should be added or updated.",
        receivedResult: "QA did not detect unit test file changes in git diff.",
        evidence: [`changedFiles=${changedFiles.length}`],
        recommendedAction: "Add or update unit tests covering the implemented behavior.",
      });
      continue;
    }

    if (/no automated checks were executed/i.test(normalizedFailure)) {
      if (hasExistingOverlap("No automated checks executed")) continue;
      items.push({
        issue: "No automated checks executed",
        expectedResult: "Project checks (lint/test/check/e2e) should run with recorded output.",
        receivedResult: "All candidate checks were skipped or unavailable.",
        evidence: checks.map((x) => `${x.command} => ${x.status}`),
        recommendedAction: "Configure scripts and run at least one applicable check before QA handoff.",
      });
      continue;
    }

    if (hasExistingOverlap(normalizedFailure)) continue;
    if (isLowSignalFallbackText(normalizedFailure)) continue;
    items.push({
      issue: normalizedFailure,
      expectedResult: "Acceptance criteria and validation checks should pass.",
      receivedResult: normalizedFailure,
      evidence: [],
      recommendedAction: "Address this blocker directly and verify with relevant checks.",
    });
  }

  return compactQaReturnContextItems(items);
}

export function extractQaHandoffContext(previousStage: unknown): QaHandoffContext | null {
  const stage = asObject(previousStage);
  const output = stage ? asObject(stage.output) : null;
  const raw = output ? asObject(output.qaHandoffContext) : null;
  if (!raw) return null;

  const attemptRaw = raw.attempt;
  const maxRetriesRaw = raw.maxRetries;
  const attempt = typeof attemptRaw === "number" && Number.isFinite(attemptRaw) ? Math.floor(attemptRaw) : 0;
  const maxRetries = typeof maxRetriesRaw === "number" && Number.isFinite(maxRetriesRaw) ? Math.floor(maxRetriesRaw) : 0;
  const returnedToRaw = asText(raw.returnedTo);
  if (attempt < 1 || maxRetries < 1) return null;
  if (returnedToRaw !== "Human Review" && !isQaRemediationAgent(returnedToRaw)) return null;

  const latestFindings = compactQaReturnContextItems(normalizeQaReturnContextItems(raw.latestFindings));
  const history = compactQaReturnHistoryEntries(normalizeQaReturnHistoryEntries(raw.history));
  const rawCumulativeFindings: QaCumulativeFinding[] = Array.isArray(raw.cumulativeFindings)
    ? raw.cumulativeFindings
      .map((item) => {
        const parsed = asObject(item);
        if (!parsed) return null;
        const issue = asText(parsed.issue);
        const expectedResult = asText(parsed.expectedResult);
        const receivedResult = asText(parsed.receivedResult);
        if (!issue || !expectedResult || !receivedResult) return null;
        const firstSeenAttemptRaw = parsed.firstSeenAttempt;
        const lastSeenAttemptRaw = parsed.lastSeenAttempt;
        const occurrencesRaw = parsed.occurrences;
        const firstSeenAttempt =
          typeof firstSeenAttemptRaw === "number" && Number.isFinite(firstSeenAttemptRaw)
            ? Math.max(1, Math.floor(firstSeenAttemptRaw))
            : 1;
        const lastSeenAttempt =
          typeof lastSeenAttemptRaw === "number" && Number.isFinite(lastSeenAttemptRaw)
            ? Math.max(firstSeenAttempt, Math.floor(lastSeenAttemptRaw))
            : attempt;
        const occurrences =
          typeof occurrencesRaw === "number" && Number.isFinite(occurrencesRaw)
            ? Math.max(1, Math.floor(occurrencesRaw))
            : 1;
        return {
          issue,
          expectedResult,
          receivedResult,
          evidence: asStringArray(parsed.evidence),
          recommendedAction: asText(parsed.recommendedAction),
          firstSeenAttempt,
          lastSeenAttempt,
          occurrences,
        } satisfies QaCumulativeFinding;
      })
      .filter((x): x is QaCumulativeFinding => x !== null)
    : [];
  const cumulativeFindings = history.length ? buildQaCumulativeFindings(history) : rawCumulativeFindings.slice(0, DEFAULT_MAX_CUMULATIVE_FINDINGS);

  return {
    attempt,
    maxRetries,
    returnedTo: returnedToRaw,
    summary: asText(raw.summary),
    latestFindings,
    cumulativeFindings,
    history,
  };
}
