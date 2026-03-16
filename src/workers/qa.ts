import path from "node:path";
import { existsSync } from "node:fs";
import { DEFAULT_QA_MAX_RETRIES, DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { ensureCodeQualityBootstrap } from "../lib/code-quality-bootstrap.js";
import { exists, readJson, writeJson } from "../lib/fs.js";
import { taskDir } from "../lib/paths.js";
import { qaOutputSchema } from "../lib/schema.js";
import { loadTaskMeta } from "../lib/task.js";
import type { AgentName, StageEnvelope } from "../lib/types.js";
import {
  buildFallbackQaReturnContextItems,
  buildQaCumulativeFindings,
  compactQaReturnContextItems,
  compactQaReturnHistoryEntries,
  normalizeQaReturnHistoryEntries,
  type QaHandoffContext,
  type QaReturnHistoryEntry,
} from "../lib/qa-context.js";
import { matchesE2EFrameworkCommand, resolveTaskQaPreferences } from "../lib/qa-preferences.js";
import { deriveQaRootCauseFocus } from "../lib/root-cause-intelligence.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { normalizeRiskLevel, raiseRisk, type RiskLevel } from "../lib/risk.js";
import { normalizeIssueLine, trimText, unique, uniqueNormalized } from "../lib/text-utils.js";
import { detectTestCapabilities, getGitChangedFiles, runE2ESelectorPreflight, runProjectChecks } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

interface QaRetryConfig {
  sameIssueMaxRetries: number;
  diverseIssueMaxRetries: number;
}

function resolveQaRetryConfig(): QaRetryConfig {
  const rawSame = Number(process.env.AI_AGENTS_QA_MAX_RETRIES || "");
  const sameIssueMaxRetries = Number.isFinite(rawSame) && rawSame >= 1
    ? Math.floor(rawSame)
    : DEFAULT_QA_MAX_RETRIES;

  const rawDiverse = Number(process.env.AI_AGENTS_QA_MAX_RETRIES_DIVERSE || "");
  const diverseIssueMaxRetries = Number.isFinite(rawDiverse) && rawDiverse >= sameIssueMaxRetries
    ? Math.floor(rawDiverse)
    : Math.max(5, sameIssueMaxRetries + 2);

  return {
    sameIssueMaxRetries,
    diverseIssueMaxRetries,
  };
}

function normalizeQaIssueKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[a-z]:\\[^\s]+/g, "<path>")
    .replace(/\/[a-z0-9_./-]+/g, "<path>")
    .replace(/\b(exit|code|attempt|retry|line|column)\s*\d+\b/g, "$1")
    .replace(/\bts\d{4}\b/g, "ts-error")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function issueTokenSet(value: string): Set<string> {
  const stopwords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "should", "failed",
    "error", "check", "tests", "test", "code", "exit", "retry", "attempt", "qa",
  ]);
  const tokens = normalizeQaIssueKey(value)
    .split(" ")
    .filter((x) => x.length >= 3 && !stopwords.has(x));
  return new Set(tokens);
}

function issuesLookEquivalent(a: string, b: string): boolean {
  const aa = normalizeQaIssueKey(a);
  const bb = normalizeQaIssueKey(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;

  const setA = issueTokenSet(aa);
  const setB = issueTokenSet(bb);
  if (!setA.size || !setB.size) return false;
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  const jaccard = overlap / (setA.size + setB.size - overlap);
  return jaccard >= 0.5;
}

function extractIssueCandidatesFromHistory(history: QaReturnHistoryEntry[]): string[] {
  return unique(history.flatMap((entry) => [
    entry.summary,
    ...entry.failures,
    ...entry.findings.map((finding) => finding.issue),
  ]));
}

function inferPreModelRetryLimit(history: QaReturnHistoryEntry[], config: QaRetryConfig): number {
  if (history.length < 2) return config.diverseIssueMaxRetries;
  const issueCandidates = extractIssueCandidatesFromHistory(history);
  let hasRepeatedIssue = false;
  for (let i = 0; i < issueCandidates.length; i += 1) {
    for (let j = i + 1; j < issueCandidates.length; j += 1) {
      if (issuesLookEquivalent(issueCandidates[i], issueCandidates[j])) {
        hasRepeatedIssue = true;
        break;
      }
    }
    if (hasRepeatedIssue) break;
  }
  return hasRepeatedIssue ? config.sameIssueMaxRetries : config.diverseIssueMaxRetries;
}

function resolveDynamicRetryLimit(args: {
  history: QaReturnHistoryEntry[];
  currentIssues: string[];
  config: QaRetryConfig;
}): number {
  if (!args.history.length || !args.currentIssues.length) return args.config.diverseIssueMaxRetries;

  const last = args.history[args.history.length - 1];
  const lastIssues = unique([
    last.summary,
    ...last.failures,
    ...last.findings.map((x) => x.issue),
  ]);
  const sameAsLast = args.currentIssues.some((currentIssue) =>
    lastIssues.some((previousIssue) => issuesLookEquivalent(currentIssue, previousIssue)));

  if (sameAsLast) return args.config.sameIssueMaxRetries;

  const priorIssueCandidates = extractIssueCandidatesFromHistory(args.history);
  const recurrent = args.currentIssues.some((currentIssue) =>
    priorIssueCandidates.some((previousIssue) => issuesLookEquivalent(currentIssue, previousIssue)));

  return recurrent ? args.config.sameIssueMaxRetries : args.config.diverseIssueMaxRetries;
}

function qaReturnHistoryPath(taskId: string): string {
  return path.join(taskDir(taskId), "artifacts", "qa-return-context-history.json");
}

async function loadQaReturnHistory(taskId: string): Promise<QaReturnHistoryEntry[]> {
  const historyPath = qaReturnHistoryPath(taskId);
  if (!(await exists(historyPath))) return [];
  try {
    const payload = await readJson<{ entries?: unknown }>(historyPath);
    return compactQaReturnHistoryEntries(normalizeQaReturnHistoryEntries(payload.entries));
  } catch {
    return [];
  }
}

async function saveQaReturnHistory(taskId: string, entries: QaReturnHistoryEntry[]): Promise<void> {
  await writeJson(qaReturnHistoryPath(taskId), {
    taskId,
    updatedAt: nowIso(),
    entries,
  });
}

function formatReturnContextForView(contextItems: Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}>): string {
  if (!contextItems.length) return "- [none]";
  return contextItems
    .map((item, index) => {
      const evidence = item.evidence.length ? item.evidence.join(" | ") : "[none]";
      const action = item.recommendedAction || "[none]";
      return `${index + 1}. ${item.issue}
   Expected: ${item.expectedResult}
   Received: ${item.receivedResult}
   Evidence: ${evidence}
   Recommended action: ${action}`;
    })
    .join("\n");
}

function formatReturnHistoryForView(history: QaReturnHistoryEntry[]): string {
  if (!history.length) return "- [none]";
  return history
    .map((entry) => {
      const summary = entry.summary || "[no summary]";
      return `- Attempt ${entry.attempt} -> ${entry.returnedTo} | findings=${entry.findings.length} | ${summary}`;
    })
    .join("\n");
}

function compactChecksForModel(
  checks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    timedOut: boolean;
    durationMs: number;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
    qaConfigNotes?: string[];
    artifacts?: string[];
  }>,
): Array<{
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPreview: string;
  stderrPreview: string;
  diagnostics: string[];
  qaConfigNotes: string[];
  artifacts: string[];
}> {
  return checks.map((x) => ({
    ...x,
    stdoutPreview: trimText(x.stdoutPreview, 500),
    stderrPreview: trimText(x.stderrPreview, 500),
    diagnostics: (x.diagnostics || []).map((item) => trimText(item, 220)).slice(0, 8),
    qaConfigNotes: (x.qaConfigNotes || []).map((item) => trimText(item, 220)).slice(0, 4),
    artifacts: (x.artifacts || []).map((item) => trimText(item, 180)).slice(0, 4),
  }));
}

interface QaTestCaseLike {
  id: string;
  title: string;
  type: "functional" | "regression" | "integration" | "e2e" | "unit" | "config";
  steps: string[];
  expectedResult: string;
  actualResult: string;
  status: "pass" | "fail" | "blocked";
  evidence: string[];
}

function compactQaTestCases(testCases: QaTestCaseLike[]): QaTestCaseLike[] {
  const normalized = testCases
    .map((x, index) => ({
      id: x.id || `TC-${index + 1}`,
      title: trimText(x.title || `QA Test Case ${index + 1}`, 120),
      type: x.type,
      steps: x.steps.map((step) => trimText(step, 140)).slice(0, 5),
      expectedResult: trimText(x.expectedResult, 220),
      actualResult: trimText(x.actualResult, 220),
      status: x.status,
      evidence: x.evidence.map((item) => trimText(item, 160)).slice(0, 3),
    }))
    .filter((x) => Boolean(x.title && x.expectedResult && x.actualResult));

  return normalized.slice(0, 6);
}

function buildFallbackQaTestCases(args: {
  failures: string[];
  returnContext: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[] }>;
  executedChecks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    diagnostics?: string[];
  }>;
}): QaTestCaseLike[] {
  const output: QaTestCaseLike[] = [];
  const checks = args.executedChecks;

  if (checks.length) {
    for (const check of checks.slice(0, 3)) {
      output.push({
        id: `CHK-${output.length + 1}`,
        title: `Run check: ${check.command}`,
        type: /e2e|playwright/i.test(check.command) ? "e2e" : "regression",
        steps: [`Execute ${check.command}`],
        expectedResult: "Command exits with code 0.",
        actualResult: check.diagnostics?.[0]
          ? `status=${check.status}, exit=${check.exitCode ?? "null"} | ${trimText(check.diagnostics[0], 140)}`
          : `status=${check.status}, exit=${check.exitCode ?? "null"}`,
        status: check.status === "passed" ? "pass" : "fail",
        evidence: [
          `${check.command} => ${check.status}`,
          ...(check.diagnostics || []).slice(0, 2),
        ],
      });
    }
  }

  for (const item of args.returnContext.slice(0, 4)) {
    output.push({
      id: `RC-${output.length + 1}`,
      title: item.issue,
      type: /e2e|playwright/i.test(item.issue) ? "e2e" : "functional",
      steps: ["Reproduce the issue using current workspace state."],
      expectedResult: item.expectedResult,
      actualResult: item.receivedResult,
      status: "fail",
      evidence: item.evidence,
    });
  }

  if (!output.length && args.failures.length) {
    for (const failure of args.failures.slice(0, 3)) {
      output.push({
        id: `F-${output.length + 1}`,
        title: trimText(failure, 120),
        type: /e2e|playwright/i.test(failure) ? "e2e" : "functional",
        steps: ["Reproduce the failure from QA report."],
        expectedResult: "Acceptance criteria should pass.",
        actualResult: trimText(failure, 220),
        status: "fail",
        evidence: [],
      });
    }
  }

  return compactQaTestCases(output);
}

function formatTestCasesForView(testCases: QaTestCaseLike[]): string {
  if (!testCases.length) return "- [none]";
  return testCases
    .map((tc) => `- ${tc.id} | ${tc.type.toUpperCase()} | ${tc.status.toUpperCase()} | ${tc.title}
  Expected: ${tc.expectedResult}
  Actual: ${tc.actualResult}`)
    .join("\n");
}

function isE2eCheckCommand(command: string): boolean {
  return /\be2e\b|playwright|e2e/i.test(command);
}

function extractSourceLocations(lines: string[]): string[] {
  const out: string[] = [];
  const locationPattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?:\d+:\d+)/g;

  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = locationPattern.exec(line))) {
      out.push(match[1]);
    }
  }

  return unique(out).slice(0, 3);
}

function buildCheckDrivenReturnContext(args: {
  executedChecks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    diagnostics?: string[];
    qaConfigNotes?: string[];
    artifacts?: string[];
  }>;
}): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  const failedChecks = args.executedChecks.filter((check) => check.status === "failed").slice(0, 4);
  const items: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }> = [];

  for (const check of failedChecks) {
    const diagnostics = (check.diagnostics || []).map((item) => trimText(item, 200)).slice(0, 4);
    const qaConfigNotes = (check.qaConfigNotes || []).map((item) => trimText(item, 180)).slice(0, 2);
    const artifacts = (check.artifacts || []).map((item) => trimText(item, 160)).slice(0, 2);
    const sourceLocations = extractSourceLocations(diagnostics);
    const e2eCheck = isE2eCheckCommand(check.command);
    const lowSignalE2eCheck = /\be2e\b|playwright/i.test(check.command);

    const issue = e2eCheck
      ? `E2E check failed: ${trimText(check.command, 120)}`
      : `Automated check failed: ${trimText(check.command, 120)}`;
    const expectedResult = e2eCheck
      ? "E2E command exits with code 0 and main-flow assertions pass with actionable failure details."
      : "Automated validation command exits with code 0.";
    const receivedResult = diagnostics[0]
      || `Command exited with code ${check.exitCode ?? "unknown"} and no detailed assertion context.`;
    const evidence = unique([
      `Command: ${check.command}`,
      ...qaConfigNotes,
      ...artifacts.map((item) => `Artifact: ${item}`),
      ...diagnostics,
    ]).slice(0, 6);

    let recommendedAction = e2eCheck
      ? "Investigate and fix the application root cause in source code first; update E2E assertions only if test logic is proven wrong, then re-run this E2E command."
      : "Fix the failing validation target and re-run this command.";

    if (sourceLocations.length) {
      recommendedAction = e2eCheck
        ? `Inspect and fix the likely source-code root cause near ${sourceLocations.join(", ")}; only adjust test logic if evidence shows test defects, then re-run this E2E command.`
        : `Apply targeted code/test fixes near ${sourceLocations.join(", ")} and re-run this command.`;
    }

    if (e2eCheck && hasStaticValueMismatchSignal(receivedResult)) {
      recommendedAction =
        "A runtime value expected to change remained identical across assertions. Inspect and fix source/state update logic first, then adjust E2E timing/assertion flow only if evidence confirms a test defect, and re-run this E2E command.";
    }

    if (lowSignalE2eCheck && diagnostics.length < 2) {
      recommendedAction = `${recommendedAction} If failure output is still low-signal, update E2E config/scripts to keep terminal-readable assertion output (reporter + stack traces) and avoid screenshot-only diagnostics.`;
    }

    items.push({
      issue,
      expectedResult,
      receivedResult,
      evidence,
      recommendedAction,
    });

    if (lowSignalE2eCheck && diagnostics.length < 2) {
      items.push({
        issue: "E2E diagnostics are low-signal for QA handoff.",
        expectedResult: "E2E failures include assertion message and source location in terminal/report output.",
        receivedResult: "Failure details were too generic and relied on low-value artifacts.",
        evidence: unique([
          ...qaConfigNotes,
          ...artifacts.map((item) => `Artifact: ${item}`),
          ...diagnostics,
        ]).slice(0, 5),
        recommendedAction:
          "Adjust E2E configuration/scripts so failed runs emit actionable assertion and location details for remediation agents.",
      });
    }
  }

  return items;
}

function hasStaticValueMismatchSignal(value: string): boolean {
  const repeatedExpectationPattern = /expected ['"]([^'"]+)['"] to not equal ['"]\1['"]/i;
  return repeatedExpectationPattern.test(value);
}

function buildSelectorPreflightDiagnostics(
  missingSelectors: Array<{ selector: string; specPaths: string[] }>,
): string[] {
  return missingSelectors.slice(0, 8).map((item) => {
    const specs = item.specPaths.length ? item.specPaths.join(", ") : "[unknown spec]";
    return `Missing selector [data-cy="${item.selector}"] referenced in ${specs}.`;
  });
}

function defaultSelectorTargetHint(selector: string): string {
  const lower = selector.toLowerCase();
  if (/(app|layout|container|root|shell|page)/.test(lower)) {
    return "the top-level application container element";
  }
  if (/(title|heading|header|hero)/.test(lower)) {
    return "the native heading element for this view";
  }
  if (/(display|value|status|label|counter|text|badge)/.test(lower)) {
    return "the DOM element that renders the target value/text";
  }
  if (/(button|btn|control|toggle|submit|reset|start|stop|pause|play)/.test(lower)) {
    return "the native clickable element (<button>/<a>/<input>) for this action";
  }
  if (/(input|field|search|email|password|textarea|select|form)/.test(lower)) {
    return "the native form control element for this interaction";
  }
  return "the source component that renders this element in the browser DOM";
}

function buildSelectorPreflightReturnContext(
  missingSelectors: Array<{ selector: string; specPaths: string[] }>,
): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  return missingSelectors.slice(0, 6).map((item) => {
    const specs = item.specPaths.length ? item.specPaths : ["[unknown spec]"];
    return {
      issue: `Missing data-cy="${item.selector}" selector hook`,
      expectedResult: `At least one DOM element should expose data-cy="${item.selector}" for E2E selection.`,
      receivedResult: `No source file currently exposes data-cy="${item.selector}", so E2E selectors fail.`,
      evidence: [
        `Referenced in specs: ${specs.join(", ")}`,
      ],
      recommendedAction: `Add data-cy="${item.selector}" in ${defaultSelectorTargetHint(item.selector)} and re-run E2E.`,
    };
  });
}

function isMissingE2eSpecText(value: string): boolean {
  const lower = value.toLowerCase();
  return /no spec files were found|can'?t run because no spec files were found|did not find e2e spec files/.test(lower);
}

function hasMissingE2eSpecSignal(checks: Array<{
  command: string;
  stdoutPreview: string;
  stderrPreview: string;
  diagnostics?: string[];
}>): boolean {
  const corpus = checks
    .flatMap((check) => [check.command, check.stdoutPreview, check.stderrPreview, ...(check.diagnostics || [])])
    .join("\n")
    .toLowerCase();
  return isMissingE2eSpecText(corpus);
}

function buildMissingE2eSpecReturnContext(checks: Array<{
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  diagnostics?: string[];
}>): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  const output: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }> = [];

  for (const check of checks) {
    if (check.status !== "failed") continue;
    if (!isE2eCheckCommand(check.command)) continue;
    const diagnostics = (check.diagnostics || []).filter((item) => item.trim());
    const signal = diagnostics.find((item) => isMissingE2eSpecText(item));
    if (!signal) continue;
    output.push({
      issue: "E2E spec files are missing.",
      expectedResult: "At least one runnable E2E spec should exist under e2e/** and be matched by project E2E test discovery.",
      receivedResult: signal,
      evidence: unique([
        `Command: ${check.command}`,
        ...diagnostics.slice(0, 4),
      ]),
      recommendedAction: "Create at least one E2E spec file (for example e2e/main-flow.spec.ts), align project E2E discovery, and re-run E2E.",
    });
  }

  return output;
}

function hasConfigFailureSignal(checks: Array<{
  command: string;
  stdoutPreview: string;
  stderrPreview: string;
  diagnostics?: string[];
}>): boolean {
  const corpus = checks
    .flatMap((check) => [check.command, check.stdoutPreview, check.stderrPreview, ...(check.diagnostics || [])])
    .join("\n")
    .toLowerCase();

  return /configfile is invalid|your configfile is invalid|invalid e2e config|e2e configuration.+invalid|missing.+baseurl|missing.+specpattern|cannot find.+e2e\.config/.test(corpus);
}

function isConfigRelatedText(value: string): boolean {
  const lower = value.toLowerCase();
  return /configfile is invalid|your configfile is invalid|invalid e2e config|e2e configuration.+invalid|failed to load e2e config|cannot find.+e2e\.config|missing.+baseurl|missing.+specpattern|baseurl.+(missing|invalid)|specpattern.+(missing|invalid)|config mismatch/.test(lower);
}

function filterUnsupportedConfigFailures(
  failures: string[],
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
): string[] {
  if (hasConfigFailureSignal(checks)) return failures;
  return failures.filter((item) => !isConfigRelatedText(item));
}

function filterUnsupportedConfigReturnContext(
  items: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }>,
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  if (hasConfigFailureSignal(checks)) return items;
  return items.filter((item) => {
    return !(
      isConfigRelatedText(item.issue)
      || isConfigRelatedText(item.expectedResult)
      || isConfigRelatedText(item.receivedResult)
      || isConfigRelatedText(item.recommendedAction)
    );
  });
}

function hasSelectorFailureSignal(args: {
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>;
  missingSelectors: Array<{ selector: string; specPaths: string[] }>;
}): boolean {
  if (args.missingSelectors.length > 0) return true;

  const corpus = args.checks
    .flatMap((check) => [check.command, check.stdoutPreview, check.stderrPreview, ...(check.diagnostics || [])])
    .join("\n")
    .toLowerCase();

  return /\bdata-cy\b|missing selector hook|timed out retrying.+data-cy|to exist.+data-cy|could not find.+data-cy/.test(corpus);
}

function isSelectorRelatedText(value: string): boolean {
  const lower = value.toLowerCase();
  return /\bdata-cy\b|selector hook|missing selector|data-testid|testid/.test(lower);
}

function filterUnsupportedSelectorFailures(
  failures: string[],
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
  missingSelectors: Array<{ selector: string; specPaths: string[] }>,
): string[] {
  if (hasSelectorFailureSignal({ checks, missingSelectors })) return failures;
  return failures.filter((item) => !isSelectorRelatedText(item));
}

function filterUnsupportedSelectorReturnContext(
  items: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }>,
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
  missingSelectors: Array<{ selector: string; specPaths: string[] }>,
): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  if (hasSelectorFailureSignal({ checks, missingSelectors })) return items;
  return items.filter((item) => {
    return !(
      isSelectorRelatedText(item.issue)
      || isSelectorRelatedText(item.expectedResult)
      || isSelectorRelatedText(item.receivedResult)
      || isSelectorRelatedText(item.recommendedAction)
    );
  });
}

function hasImportExportFailureSignal(checks: Array<{
  command: string;
  stdoutPreview: string;
  stderrPreview: string;
  diagnostics?: string[];
}>): boolean {
  const corpus = checks
    .flatMap((check) => [check.command, check.stdoutPreview, check.stderrPreview, ...(check.diagnostics || [])])
    .join("\n")
    .toLowerCase();

  return /does not provide an export named|import\/export mismatch|export\/import mismatch|cannot find module|requested module .* does not provide an export named|missing export\b/.test(corpus);
}

function isImportExportRelatedText(value: string): boolean {
  const lower = value.toLowerCase();
  return /does not provide an export named|import\/export mismatch|export\/import mismatch|requested module .* does not provide an export named|cannot find module|incorrect import|import statement|default import|named import|missing export\b|export not confirmed|export .* not confirmed|still attempts to import|does not export that symbol|export.*mismatch/.test(lower);
}

function filterUnsupportedImportExportFailures(
  failures: string[],
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
): string[] {
  if (hasImportExportFailureSignal(checks)) return failures;
  return failures.filter((item) => !isImportExportRelatedText(item));
}

function filterUnsupportedImportExportReturnContext(
  items: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }>,
  checks: Array<{
    command: string;
    stdoutPreview: string;
    stderrPreview: string;
    diagnostics?: string[];
  }>,
): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  if (hasImportExportFailureSignal(checks)) return items;
  return items.filter((item) => {
    return !(
      isImportExportRelatedText(item.issue)
      || isImportExportRelatedText(item.expectedResult)
      || isImportExportRelatedText(item.receivedResult)
      || isImportExportRelatedText(item.recommendedAction)
    );
  });
}

function filterUnsupportedEvidenceGapFailures(
  failures: string[],
): string[] {
  return failures.filter((item) => {
    const lower = item.toLowerCase();
    if (/no concrete evidence provided|missing actual content|no verification provided|actual content changes are not confirmed|content changes are not confirmed/.test(lower)) {
      return false;
    }
    return true;
  });
}

function isLowSignalQaText(value: string): boolean {
  const lower = value.toLowerCase().trim();
  if (!lower) return true;
  return /acceptance criteria and validation checks should pass|address this blocker directly and verify with relevant checks|qa validation failed|no detailed assertion context|no concrete evidence provided|missing actual content|no verification provided/.test(lower);
}

function hasOnlyRootCauseHintEvidence(evidence: string[]): boolean {
  const cleaned = evidence
    .map((entry) => entry.trim())
    .filter((entry) => entry && !/\[none\]/i.test(entry));
  if (!cleaned.length) return false;
  return cleaned.every((entry) => /^likely source root-cause paths:/i.test(entry));
}

function pickBestFailedCheckForContextItem(args: {
  item: {
    issue: string;
    expectedResult: string;
    receivedResult: string;
  };
  failedChecks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    diagnostics?: string[];
  }>;
}): {
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  diagnostics?: string[];
} | null {
  if (!args.failedChecks.length) return null;
  const corpus = `${args.item.issue}\n${args.item.expectedResult}\n${args.item.receivedResult}`.toLowerCase();

  const scored = args.failedChecks.map((check) => {
    const checkCorpus = `${check.command}\n${(check.diagnostics || []).join("\n")}`.toLowerCase();
    let score = 0;
    if (/\bplaywright\b/.test(corpus) && /\bplaywright\b/.test(checkCorpus)) score += 4;
    if (/\be2e\b|\bui\b|\bdom\b|\binteraction\b|\bruntime\b|\bbehavior\b/.test(corpus) && isE2eCheckCommand(check.command)) score += 3;
    if (/\btypescript\b|type error|ts\d{4}\b/.test(corpus) && /\btsc\b|typecheck|lint/.test(checkCorpus)) score += 3;
    if (/\bimport\b|\bexport\b|\bmodule\b/.test(corpus)
      && /does not provide an export named|cannot find module|import\/export mismatch|requested module/.test(checkCorpus)) {
      score += 3;
    }
    if (isE2eCheckCommand(check.command)) score += 1;
    return { check, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.check || null;
}

function enrichSparseReturnContextWithCheckEvidence(args: {
  items: Array<{
    issue: string;
    expectedResult: string;
    receivedResult: string;
    evidence: string[];
    recommendedAction: string;
  }>;
  executedChecks: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    diagnostics?: string[];
    qaConfigNotes?: string[];
    artifacts?: string[];
  }>;
}): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  const failedChecks = args.executedChecks.filter((check) => check.status === "failed");
  if (!failedChecks.length) return args.items;

  return args.items.map((item) => {
    const hasEvidence = item.evidence.some((entry) => entry.trim() && !/\[none\]/i.test(entry));
    const needsEvidence = !hasEvidence;
    const needsResult = isLowSignalQaText(item.receivedResult);
    const needsAction = isLowSignalQaText(item.recommendedAction);
    if (!needsEvidence && !needsResult && !needsAction) return item;

    const matchedCheck = pickBestFailedCheckForContextItem({ item, failedChecks });
    if (!matchedCheck) return item;

    const diagnostics = (matchedCheck.diagnostics || []).map((entry) => trimText(entry, 200)).slice(0, 4);
    const sourceLocations = extractSourceLocations(diagnostics);
    const evidence = unique([
      ...item.evidence,
      `Command: ${matchedCheck.command}`,
      ...diagnostics,
      ...(args.executedChecks.find((check) => check.command === matchedCheck.command)?.qaConfigNotes || [])
        .map((entry) => trimText(entry, 180)),
      ...(args.executedChecks.find((check) => check.command === matchedCheck.command)?.artifacts || [])
        .map((entry) => `Artifact: ${trimText(entry, 160)}`),
    ])
      .filter((entry) => entry.trim() && !/\[none\]/i.test(entry))
      .slice(0, 6);

    const receivedResult = needsResult
      ? (diagnostics[0] || `Command exited with code ${matchedCheck.exitCode ?? "unknown"}: ${matchedCheck.command}`)
      : item.receivedResult;

    let recommendedAction = item.recommendedAction.trim();
    if (needsAction) {
      recommendedAction = isE2eCheckCommand(matchedCheck.command)
        ? `Reproduce with "${matchedCheck.command}", fix the source-code root cause first, then re-run this E2E check.`
        : `Fix the failing behavior surfaced by "${matchedCheck.command}" and re-run the same validation command.`;
    }

    if (sourceLocations.length && !recommendedAction.includes(sourceLocations[0])) {
      recommendedAction = `${recommendedAction} Inspect ${sourceLocations.join(", ")} first.`;
    }

    return {
      ...item,
      receivedResult,
      evidence,
      recommendedAction,
    };
  });
}

function pruneLowSignalReturnContextItems(items: Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}>): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  const hasRichItem = items.some((item) => (
    item.evidence.length > 0
    && !hasOnlyRootCauseHintEvidence(item.evidence)
    && !isLowSignalQaText(item.receivedResult)
  ));
  if (!hasRichItem) return items;

  const filtered = items.filter((item) => {
    if (/qa retry limit reached/i.test(item.issue)) return false;
    const hasEvidence = item.evidence.some((entry) => entry.trim() && !/\[none\]/i.test(entry));
    const rootCauseHintOnly = hasOnlyRootCauseHintEvidence(item.evidence);
    const genericExpected = isLowSignalQaText(item.expectedResult);
    const genericReceived = isLowSignalQaText(item.receivedResult);
    const genericAction = isLowSignalQaText(item.recommendedAction);
    if (rootCauseHintOnly && (genericReceived || genericAction)) return false;
    return hasEvidence || !(genericExpected && genericReceived && genericAction);
  });

  return filtered.length ? filtered : items;
}

function enrichReturnContextWithRootCauseHints(items: Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}>, failures: string[]): Array<{
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}> {
  const focus = deriveQaRootCauseFocus({ qaFailures: failures, findings: items });
  if (!focus.mustPrioritizeSourceFix || !focus.sourceHints.length) return items;

  const hintLine = `Likely source root-cause paths: ${focus.sourceHints.slice(0, 5).join(", ")}`;
  return items.map((item) => {
    const text = `${item.issue}\n${item.expectedResult}\n${item.receivedResult}`.toLowerCase();
    if (!/\be2e\b|assert|import\/export|runtime|data-cy|selector|behavior|syntax|type|module|build|lint/.test(text)) {
      return item;
    }

    const evidence = unique([...item.evidence, hintLine]).slice(0, 6);
    const recommendedAction = item.recommendedAction.includes("Likely source root-cause paths:")
      ? item.recommendedAction
      : `${item.recommendedAction} Prioritize source-code fixes in ${focus.sourceHints.slice(0, 5).join(", ")} before modifying tests.`;

    return {
      ...item,
      evidence,
      recommendedAction,
    };
  });
}

function isLikelyUnitTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return (
    /(^|\/)(__tests__|tests)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

async function loadReportedUnitTests(taskId: string): Promise<string[]> {
  const doneDir = path.join(taskDir(taskId), "done");
  const candidates = [DONE_FILE_NAMES.bugFixer, DONE_FILE_NAMES.builder];
  const reported: string[] = [];

  for (const fileName of candidates) {
    const filePath = path.join(doneDir, fileName);
    if (!(await exists(filePath))) continue;
    try {
      const envelope = await readJson<{ output?: { unitTestsAdded?: unknown } }>(filePath);
      const unitTests = envelope.output?.unitTestsAdded;
      if (!Array.isArray(unitTests)) continue;
      for (const item of unitTests) {
        if (typeof item === "string" && item.trim()) {
          reported.push(item.trim());
        }
      }
    } catch {
      // Ignore malformed historical artifacts and continue with available evidence.
    }
  }

  return unique(reported);
}

function extractFileHintsFromLines(lines: string[]): string[] {
  const out: string[] = [];
  const pattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.(json|cjs|mjs|css|scss|md|yml|yaml))/g;
  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const normalized = match[1].replace(/^[./]+/, "").trim();
      if (normalized) out.push(normalized);
    }
  }
  return unique(out);
}

function normalizeWorkspacePathLabel(workspaceRoot: string, filePath: string): string {
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootNoLead = root.replace(/^\/+/, "");
  let next = filePath.replace(/\\/g, "/").trim();
  if (!next) return "";
  next = next.replace(/:\d+:\d+$/, "");
  if (next.startsWith(root)) {
    next = next.slice(root.length);
  } else if (next.startsWith(rootNoLead)) {
    next = next.slice(rootNoLead.length);
  }
  next = next.replace(/^\/+/, "");
  next = next.replace(/^\.\//, "");
  return next;
}

function collapseWorkspacePathLabels(args: {
  workspaceRoot: string;
  candidates: string[];
  preferredPaths: string[];
}): string[] {
  const { workspaceRoot } = args;
  const preferred = unique(args.preferredPaths.map((filePath) => normalizeWorkspacePathLabel(workspaceRoot, filePath)).filter(Boolean));
  const preferredByBase = new Map<string, string[]>();
  for (const filePath of preferred) {
    const base = path.basename(filePath);
    const list = preferredByBase.get(base) || [];
    list.push(filePath);
    preferredByBase.set(base, list);
  }

  const out: string[] = [];
  for (const rawCandidate of args.candidates) {
    const candidate = normalizeWorkspacePathLabel(workspaceRoot, rawCandidate);
    if (!candidate) continue;
    if (candidate.includes("/") || existsSync(path.join(workspaceRoot, candidate))) {
      out.push(candidate);
      continue;
    }
    const preferredMatch = preferredByBase.get(candidate) || [];
    if (preferredMatch.length === 1) {
      out.push(preferredMatch[0]);
      continue;
    }
    out.push(candidate);
  }
  return unique(out);
}

function deriveQaValidationMode(checks: Array<{ status: "passed" | "failed" | "skipped" }>): "static_review" | "executed_checks" | "mixed" {
  if (!checks.length) return "static_review";
  const hasExecuted = checks.some((check) => check.status === "passed" || check.status === "failed");
  if (!hasExecuted) return "static_review";
  return "mixed";
}

export class QaWorker extends WorkerBase {
  readonly agent = "QA Validator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.qa;
  readonly workingFileName = "06-qa.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("qa-validator.md");
    const provider = createProvider(config.providers.planner);
    const baseInput = await this.buildAgentInput(taskId, request);
    const qaPreferences = resolveTaskQaPreferences(baseInput.task);
    const meta = await loadTaskMeta(taskId);
    const workspaceRoot = process.cwd();
    const qualityBootstrap = await ensureCodeQualityBootstrap({ workspaceRoot });
    const shouldPrepareE2E = qaPreferences.e2ePolicy !== "skip";
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const reportedUnitTests = await loadReportedUnitTests(taskId);
    const changedFiles = unique([
      ...(await getGitChangedFiles(workspaceRoot)),
      ...qualityBootstrap.changedFiles,
    ]);
    const selectorPreflight = shouldPrepareE2E
      ? await runE2ESelectorPreflight(workspaceRoot)
      : null;
    const missingSelectorFindings = selectorPreflight?.missingSelectors || [];
    const skipHeavyE2ERun = missingSelectorFindings.length > 0;
    const executedChecks = [
      ...(await runProjectChecks({
        workspaceRoot,
        timeoutMsPerCheck: 150_000,
        includeE2E: qaPreferences.e2ePolicy !== "skip" && !skipHeavyE2ERun,
        changedFiles,
      })),
    ];
    if (missingSelectorFindings.length) {
      executedChecks.push({
        command: "e2e selector preflight",
        status: "failed",
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
        stdoutPreview: "",
        stderrPreview: "",
        diagnostics: buildSelectorPreflightDiagnostics(missingSelectorFindings),
        qaConfigNotes: [
          "QA preflight: skipped heavy E2E run because required data-cy selectors are missing in source.",
        ],
        artifacts: [],
      });
    }
    const previousQaAttempts = meta.history.filter((x) => x.stage === "qa").length;
    const currentQaAttempt = previousQaAttempts + 1;
    const retryConfig = resolveQaRetryConfig();
    const previousReturnHistory = await loadQaReturnHistory(taskId);
    const maxQaRetriesHint = inferPreModelRetryLimit(previousReturnHistory, retryConfig);
    const compactChecks = compactChecksForModel(executedChecks);
    const checkDrivenReturnContext = buildCheckDrivenReturnContext({ executedChecks: compactChecks });
    const selectorPreflightReturnContext = buildSelectorPreflightReturnContext(missingSelectorFindings);
    const missingE2eSpecReturnContext = buildMissingE2eSpecReturnContext(compactChecks);

    const hardFailures: string[] = [];
    if (!changedFiles.length) {
      hardFailures.push("No code changes detected in git diff.");
    }
    for (const item of missingSelectorFindings.slice(0, 8)) {
      hardFailures.push(`Missing selector hook: data-cy="${item.selector}" (referenced in ${item.specPaths.join(", ")}).`);
    }

    const failedChecks = executedChecks.filter((x) => x.status === "failed");
    for (const check of failedChecks) {
      const detail = (check.diagnostics || [])[0];
      hardFailures.push(
        detail
          ? `Check failed: ${check.command} (exit ${check.exitCode ?? "unknown"}) | ${trimText(detail, 160)}`
          : `Check failed: ${check.command} (exit ${check.exitCode ?? "unknown"})`,
      );
    }
    if (hasMissingE2eSpecSignal(compactChecks)) {
      hardFailures.push("E2E did not find runnable E2E spec files under e2e/**.");
    }

    const requiresE2E = qaPreferences.e2eRequired;
    const requiresUnitTests = requiresE2E;
    const e2eChecks = executedChecks.filter((x) => /\be2e\b|playwright/i.test(x.command));
    const frameworkChecks = qaPreferences.e2eFramework === "auto" || qaPreferences.e2eFramework === "other"
      ? e2eChecks
      : e2eChecks.filter((x) => matchesE2EFrameworkCommand(x.command, qaPreferences.e2eFramework));
    if (requiresE2E && !e2eChecks.length) {
      hardFailures.push(`No E2E check was executed. Objective: ${qaPreferences.objective}`);
    }
    if (requiresE2E && qaPreferences.e2eFramework !== "auto" && qaPreferences.e2eFramework !== "other" && !frameworkChecks.length) {
      hardFailures.push(`No ${qaPreferences.e2eFramework} check was executed, but this framework is required for this task.`);
    }

    const hasUnitTestEvidence = reportedUnitTests.length > 0 || changedFiles.some(isLikelyUnitTestFile);
    if (requiresUnitTests && testCapabilities.hasUnitTestScript && !hasUnitTestEvidence) {
      hardFailures.push("No unit test file changes were detected in git diff.");
    }

    const skippedChecks = executedChecks.filter((x) => x.status === "skipped");
    if (skippedChecks.length === executedChecks.length) {
      hardFailures.push("No automated checks were executed (check/test/lint/e2e scripts not found).");
    }
    await this.note({
      taskId,
      stage: "qa",
      message: "validation_evidence_snapshot",
      details: {
        attempt: currentQaAttempt,
        maxRetriesHint: maxQaRetriesHint,
        changedFiles: changedFiles.length,
        executedChecks: executedChecks.map((check) => ({
          command: check.command,
          status: check.status,
          exitCode: check.exitCode,
        })).slice(0, 6),
        hardFailures: hardFailures.length,
        missingSelectors: missingSelectorFindings.length,
        requiresE2E,
        e2eFramework: qaPreferences.e2eFramework,
      },
    });

    const remediationAgent: AgentName = baseInput.task.typeHint === "Bug" ? "Bug Fixer" : "Feature Builder";

    const modelInput = {
      ...baseInput,
      qaControl: {
        currentAttempt: currentQaAttempt,
        maxRetries: maxQaRetriesHint,
      },
      validationEvidence: {
        changedFiles,
        executedChecks: compactChecks,
        reportedUnitTests,
        codeQualityBootstrap: {
          notes: qualityBootstrap.notes.slice(0, 6),
          warnings: qualityBootstrap.warnings.slice(0, 6),
        },
        e2eBootstrap: {
          notes: [],
          warnings: [],
        },
        selectorPreflight: {
          skippedHeavyE2ERun: skipHeavyE2ERun,
          missingSelectors: missingSelectorFindings,
        },
      },
      qaPreferences,
    };

    const strictContract = `
MANDATORY VALIDATION CONTRACT:
- Use "validationEvidence.changedFiles" and "validationEvidence.executedChecks" as primary evidence.
- Use "validationEvidence.reportedUnitTests" as additional evidence from implementation stages.
- Use "validationEvidence.codeQualityBootstrap" to report lint/typecheck bootstrap actions before validation.
- Use "validationEvidence.e2eBootstrap" to report setup/install/config actions taken before validation.
- Use "validationEvidence.selectorPreflight.missingSelectors" to report missing data-cy hooks with exact selector names and referenced spec files.
- If any check failed, verdict must be "fail".
- If changedFiles is empty, verdict must be "fail".
- If task type is Feature/Bug/Refactor/Mixed and no E2E check was executed, verdict must be "fail".
- Follow qaPreferences.e2ePolicy and qaPreferences.objective as the explicit human quality target.
- If qaPreferences.e2ePolicy is "required", E2E evidence is mandatory.
- If qaPreferences.e2eFramework is "playwright", require evidence for that framework specifically.
- If verdict is "fail", set "nextAgent" to "${remediationAgent}".
- If verdict is "fail", fill "returnContext" with actionable items using "issue", "expectedResult", and "receivedResult".
- Each "returnContext" item must include concrete evidence and a recommended action for the next agent.
- Use executedChecks[].diagnostics, qaConfigNotes, and artifacts to make returnContext specific (avoid screenshot-only guidance).
- For E2E failures, include assertion/location evidence and remediation direction in returnContext.
- For E2E failures, point to likely application-code root cause paths first; do not give test-only remediation unless evidence shows the test is wrong.
- If failures suggest missing data-cy selectors, list required selectors and target files in returnContext.
- If failures suggest import/export mismatch, call out the exact symbol/file contract mismatch in returnContext.
- If failures suggest E2E config mismatch, call out exact config edits needed.
- If failures suggest flawed E2E test logic (scoping/order/assertion form), call out exact test file fixes.
- If failures show missing E2E spec files, explicitly request creation of runnable specs under e2e/** and reference project test discovery alignment.
- Populate "testCases" as a real QA would: include concrete expectedResult vs actualResult and status.
- Keep "testCases" concise and evidence-driven (max 6).
- Explicitly fill filesReviewed, validationMode, technicalRiskSummary, recommendedChecks, manualValidationNeeded, and residualRisks.
- Do not claim full certainty unless checks were truly executed.
- If part of the conclusion is static analysis only, state it in residualRisks/manualValidationNeeded.
- If verdict is "pass", set "nextAgent" to "PR Writer".
- This QA attempt is ${currentQaAttempt} of max ${maxQaRetriesHint} before forced human escalation.
- Keep failures specific and actionable.
`;

    const roleContract = buildAgentRoleContract("QA Validator", {
      stage: "qa",
      taskTypeHint: baseInput.task.typeHint,
      qaAttempt: currentQaAttempt,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "QA Validator",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "testCases": [{ "id": "string", "title": "string", "type": "functional | regression | integration | e2e | unit | config", "steps": ["string"], "expectedResult": "string", "actualResult": "string", "status": "pass | fail | blocked", "evidence": ["string"] }], "failures": ["string"], "verdict": "pass | fail", "e2ePlan": ["string"], "changedFiles": ["string"], "filesReviewed": ["string"], "validationMode": "static_review | executed_checks | mixed", "technicalRiskSummary": { "buildRisk": "low | medium | high | unknown", "syntaxRisk": "low | medium | high | unknown", "importExportRisk": "low | medium | high | unknown", "referenceRisk": "low | medium | high | unknown", "logicRisk": "low | medium | high | unknown", "regressionRisk": "low | medium | high | unknown" }, "recommendedChecks": ["string"], "manualValidationNeeded": ["string"], "residualRisks": ["string"], "executedChecks": [{ "command": "string", "status": "passed | failed | skipped", "exitCode": 0, "timedOut": false, "durationMs": 0, "stdoutPreview": "string", "stderrPreview": "string", "diagnostics": ["string"], "qaConfigNotes": ["string"], "artifacts": ["string"] }], "returnContext": [{ "issue": "string", "expectedResult": "string", "receivedResult": "string", "evidence": ["string"], "recommendedAction": "string" }], "nextAgent": "PR Writer | Feature Builder | Bug Fixer" }',
    });
    const output = qaOutputSchema.parse(result.parsed);
    output.changedFiles = unique([...output.changedFiles, ...changedFiles]);
    output.filesReviewed = unique([...output.filesReviewed, ...output.changedFiles]);
    output.executedChecks = compactChecks;
    output.failures = filterUnsupportedConfigFailures(
      unique([...output.failures, ...hardFailures]),
      output.executedChecks,
    );
    output.failures = filterUnsupportedSelectorFailures(
      output.failures,
      output.executedChecks,
      missingSelectorFindings,
    );
    output.failures = filterUnsupportedImportExportFailures(
      output.failures,
      output.executedChecks,
    );
    output.failures = filterUnsupportedEvidenceGapFailures(output.failures);
    const hasEvidenceBackedFailure = output.executedChecks.some((check) => check.status === "failed") || hardFailures.length > 0;
    if (!hasEvidenceBackedFailure) {
      output.failures = [];
      output.verdict = "pass";
    }
    if (output.failures.length) {
      output.verdict = "fail";
    }
    if (output.verdict === "pass") {
      output.returnContext = [];
    }

    const currentIssueCandidates = unique([
      ...output.failures,
      ...output.returnContext.map((item) => item.issue),
    ]);
    const maxQaRetries = resolveDynamicRetryLimit({
      history: previousReturnHistory,
      currentIssues: currentIssueCandidates,
      config: retryConfig,
    });

    output.nextAgent = output.verdict === "pass" ? "PR Writer" : remediationAgent;
    const escalatedToHuman = output.verdict === "fail" && currentQaAttempt >= maxQaRetries;
    if (escalatedToHuman) {
      output.failures = unique([
        ...output.failures,
        `QA retry limit reached (${currentQaAttempt}/${maxQaRetries}). Escalating to human review.`,
      ]);
    }
    await this.note({
      taskId,
      stage: "qa",
      message: "qa_decision",
      details: {
        attempt: currentQaAttempt,
        maxRetries: maxQaRetries,
        verdict: output.verdict,
        nextAgent: output.nextAgent,
        escalatedToHuman,
        failures: output.failures.length,
        returnContext: output.returnContext.length,
      },
    });

    const returnContextAfterConfigFilter = filterUnsupportedConfigReturnContext(
      [...output.returnContext, ...checkDrivenReturnContext, ...selectorPreflightReturnContext, ...missingE2eSpecReturnContext],
      output.executedChecks,
    );
    const modelAndCheckReturnContext = filterUnsupportedSelectorReturnContext(
      returnContextAfterConfigFilter,
      output.executedChecks,
      missingSelectorFindings,
    );
    const sanitizedReturnContext = filterUnsupportedImportExportReturnContext(
      modelAndCheckReturnContext,
      output.executedChecks,
    );
    const evidenceEnrichedReturnContext = enrichSparseReturnContextWithCheckEvidence({
      items: sanitizedReturnContext,
      executedChecks: output.executedChecks,
    });
    output.returnContext = compactQaReturnContextItems([
      ...evidenceEnrichedReturnContext,
      ...buildFallbackQaReturnContextItems({
        failures: output.failures,
        changedFiles: output.changedFiles,
        executedChecks: output.executedChecks.map((x) => ({
          command: x.command,
          status: x.status,
          exitCode: x.exitCode,
        })),
        existing: sanitizedReturnContext,
      }),
    ]);
    output.returnContext = enrichReturnContextWithRootCauseHints(output.returnContext, output.failures);
    output.returnContext = pruneLowSignalReturnContextItems(output.returnContext);
    output.filesReviewed = unique([
      ...output.filesReviewed,
      ...extractFileHintsFromLines([
        ...output.returnContext.flatMap((item) => [item.issue, item.expectedResult, item.receivedResult, ...item.evidence]),
        ...output.executedChecks.flatMap((check) => [check.stdoutPreview, check.stderrPreview, ...(check.diagnostics || [])]),
      ]),
    ]);
    output.filesReviewed = collapseWorkspacePathLabels({
      workspaceRoot,
      candidates: output.filesReviewed,
      preferredPaths: output.changedFiles,
    });
    output.testCases = compactQaTestCases([
      ...output.testCases,
      ...buildFallbackQaTestCases({
        failures: output.failures,
        returnContext: output.returnContext,
        executedChecks: output.executedChecks.map((x) => ({
          command: x.command,
          status: x.status,
          exitCode: x.exitCode,
          diagnostics: x.diagnostics,
        })),
      }),
    ]);
    output.validationMode = deriveQaValidationMode(output.executedChecks);
    output.recommendedChecks = uniqueNormalized([
      ...output.recommendedChecks,
      ...output.executedChecks
        .filter((check) => check.status !== "passed")
        .map((check) => `Re-run and confirm: ${check.command}`),
      ...output.e2ePlan,
    ]).slice(0, 12);
    const technicalRiskSummary = output.technicalRiskSummary;
    technicalRiskSummary.buildRisk = normalizeRiskLevel(technicalRiskSummary.buildRisk);
    technicalRiskSummary.syntaxRisk = normalizeRiskLevel(technicalRiskSummary.syntaxRisk);
    technicalRiskSummary.importExportRisk = normalizeRiskLevel(technicalRiskSummary.importExportRisk);
    technicalRiskSummary.referenceRisk = normalizeRiskLevel(technicalRiskSummary.referenceRisk);
    technicalRiskSummary.logicRisk = normalizeRiskLevel(technicalRiskSummary.logicRisk);
    technicalRiskSummary.regressionRisk = normalizeRiskLevel(technicalRiskSummary.regressionRisk);
    if (!output.changedFiles.length) {
      technicalRiskSummary.buildRisk = raiseRisk(technicalRiskSummary.buildRisk, "high");
      technicalRiskSummary.regressionRisk = raiseRisk(technicalRiskSummary.regressionRisk, "high");
    }
    if (output.executedChecks.some((check) => check.status === "failed")) {
      technicalRiskSummary.buildRisk = raiseRisk(technicalRiskSummary.buildRisk, "medium");
      technicalRiskSummary.regressionRisk = raiseRisk(technicalRiskSummary.regressionRisk, "medium");
    }
    const failureCorpus = output.failures.join("\n");
    if (/syntaxerror|ts\d{4}|parse error|unexpected token/i.test(failureCorpus)) {
      technicalRiskSummary.syntaxRisk = raiseRisk(technicalRiskSummary.syntaxRisk, "high");
    }
    if (/does not provide an export named|cannot find module|import\/export|named export/i.test(failureCorpus)) {
      technicalRiskSummary.importExportRisk = raiseRisk(technicalRiskSummary.importExportRisk, "high");
      technicalRiskSummary.referenceRisk = raiseRisk(technicalRiskSummary.referenceRisk, "medium");
    }
    if (/undefined|not defined|null|referenceerror|cannot read/i.test(failureCorpus)) {
      technicalRiskSummary.referenceRisk = raiseRisk(technicalRiskSummary.referenceRisk, "high");
    }
    if (/countdown|state|logic|behavior|assertion/i.test(failureCorpus)) {
      technicalRiskSummary.logicRisk = raiseRisk(technicalRiskSummary.logicRisk, "medium");
    }
    output.manualValidationNeeded = uniqueNormalized([
      ...output.manualValidationNeeded,
      ...(requiresE2E ? [`Manual runtime validation for ${qaPreferences.e2eFramework} flow is still recommended.`] : []),
      ...(output.verdict === "pass" ? ["Smoke-test core user flow manually in runtime environment."] : []),
    ]).slice(0, 10);
    output.residualRisks = uniqueNormalized([
      ...output.residualRisks,
      `Validation mode used: ${output.validationMode}.`,
      output.validationMode === "static_review"
        ? "No command-level validation evidence was executed in this QA pass."
        : "Command evidence exists, but environment-specific runtime behavior can still differ.",
      `Technical risk snapshot: build=${technicalRiskSummary.buildRisk}, syntax=${technicalRiskSummary.syntaxRisk}, import/export=${technicalRiskSummary.importExportRisk}, logic=${technicalRiskSummary.logicRisk}.`,
    ]).slice(0, 12);

    let qaReturnHistory = previousReturnHistory;
    if (output.verdict === "fail") {
      const latestReturnEntry: QaReturnHistoryEntry = {
        attempt: currentQaAttempt,
        returnedAt: nowIso(),
        returnedTo: remediationAgent,
        summary: output.failures[0] || "QA validation failed.",
        failures: [...output.failures],
        findings: output.returnContext,
      };
      qaReturnHistory = [...previousReturnHistory.filter((x) => x.attempt !== currentQaAttempt), latestReturnEntry]
        .sort((a, b) => a.attempt - b.attempt);
      qaReturnHistory = compactQaReturnHistoryEntries(qaReturnHistory);
      await saveQaReturnHistory(taskId, qaReturnHistory);
    }

    const qaHandoffContext: QaHandoffContext = {
      attempt: currentQaAttempt,
      maxRetries: maxQaRetries,
      returnedTo: output.nextAgent,
      summary: output.verdict === "fail"
        ? `QA failed at attempt ${currentQaAttempt}/${maxQaRetries}.`
        : `QA passed at attempt ${currentQaAttempt}/${maxQaRetries}.`,
      latestFindings: output.verdict === "fail" ? output.returnContext : [],
      cumulativeFindings: buildQaCumulativeFindings(qaReturnHistory),
      history: qaReturnHistory,
    };
    output.qaHandoffContext = qaHandoffContext;

    const queuedNextAgent = escalatedToHuman ? undefined : output.nextAgent;
    const queuedNextStage = queuedNextAgent === "PR Writer" ? "pr" : queuedNextAgent === "Bug Fixer" ? "bug-fixer" : "builder";
    const queuedNextRequestFileName = queuedNextAgent === "PR Writer"
      ? STAGE_FILE_NAMES.pr
      : queuedNextAgent === "Bug Fixer"
        ? STAGE_FILE_NAMES.bugFixer
        : STAGE_FILE_NAMES.builder;
    const nextInputRef = `done/${DONE_FILE_NAMES.qa}`;

    const view = `# HANDOFF

## Agent
QA Validator

## Main Scenarios
${output.mainScenarios.length ? output.mainScenarios.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Acceptance Checklist
${output.acceptanceChecklist.length ? output.acceptanceChecklist.map((x) => `- [ ] ${x}`).join("\n") : "- [none]"}

## QA Test Cases
${formatTestCasesForView(output.testCases)}

## Failures
${output.failures.length ? output.failures.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Return Context (Expected vs Received)
${formatReturnContextForView(output.returnContext)}

## QA Verdict
${output.verdict}

## QA Attempt
- Attempt: ${currentQaAttempt}/${maxQaRetries}
- Escalated to human: ${escalatedToHuman ? "yes" : "no"}

## Human QA Preferences
- E2E policy: ${qaPreferences.e2ePolicy}
- E2E framework: ${qaPreferences.e2eFramework}
- Objective: ${qaPreferences.objective}

## Code Quality Bootstrap
${qualityBootstrap.notes.length ? qualityBootstrap.notes.map((x) => `- ${x}`).join("\n") : "- [none]"}
${qualityBootstrap.warnings.length ? qualityBootstrap.warnings.map((x) => `- WARNING: ${x}`).join("\n") : ""}

## E2E Bootstrap
- [none]

## E2E Plan
${output.e2ePlan.length ? output.e2ePlan.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changed Files (git diff)
${output.changedFiles.length ? output.changedFiles.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Files Reviewed
${output.filesReviewed.length ? output.filesReviewed.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Unit Tests Reported By Implementation
${reportedUnitTests.length ? reportedUnitTests.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Executed Checks
${output.executedChecks.length ? output.executedChecks.map((x) => {
        const diag = x.diagnostics?.[0] ? ` | diag=${trimText(x.diagnostics[0], 120)}` : "";
        return `- ${x.status.toUpperCase()} | ${x.command} | exit=${x.exitCode ?? "null"} | ${x.durationMs}ms${diag}`;
      }).join("\n") : "- [none]"}

## Validation Mode
- ${output.validationMode}

## Technical Risk Summary
- Build risk: ${output.technicalRiskSummary.buildRisk}
- Syntax risk: ${output.technicalRiskSummary.syntaxRisk}
- Import/export risk: ${output.technicalRiskSummary.importExportRisk}
- Reference risk: ${output.technicalRiskSummary.referenceRisk}
- Logic risk: ${output.technicalRiskSummary.logicRisk}
- Regression risk: ${output.technicalRiskSummary.regressionRisk}

## Recommended Checks
${output.recommendedChecks.length ? output.recommendedChecks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Manual Validation Needed
${output.manualValidationNeeded.length ? output.manualValidationNeeded.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Residual Risks
${output.residualRisks.length ? output.residualRisks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Cumulative QA Return History
${formatReturnHistoryForView(output.qaHandoffContext?.history || [])}

## Next
${escalatedToHuman ? "Human Review" : output.nextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "qa",
      doneFileName: DONE_FILE_NAMES.qa,
      viewFileName: "06-qa.md",
      viewContent: view,
      output,
      nextAgent: queuedNextAgent,
      nextStage: queuedNextAgent ? queuedNextStage : undefined,
      nextRequestFileName: queuedNextAgent ? queuedNextRequestFileName : undefined,
      nextInputRef,
      humanApprovalRequired: escalatedToHuman,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
      providerAttempts: result.providerAttempts,
      providerBackoffRetries: result.providerBackoffRetries,
      providerBackoffWaitMs: result.providerBackoffWaitMs,
      providerRateLimitWaitMs: result.providerRateLimitWaitMs,
      estimatedInputTokens: result.estimatedInputTokens,
      estimatedOutputTokens: result.estimatedOutputTokens,
      estimatedTotalTokens: result.estimatedTotalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    });
  }
}
