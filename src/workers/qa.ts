import path from "node:path";
import { DEFAULT_QA_MAX_RETRIES, DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
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
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { detectTestCapabilities, getGitChangedFiles, runCypressSelectorPreflight, runProjectChecks } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function resolveQaMaxRetries(): number {
  const raw = Number(process.env.AI_AGENTS_QA_MAX_RETRIES || "");
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_QA_MAX_RETRIES;
}

function trimText(value: string, maxChars = 240): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
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
        type: /e2e|playwright|cypress/i.test(check.command) ? "e2e" : "regression",
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
      type: /e2e|playwright|cypress/i.test(item.issue) ? "e2e" : "functional",
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
        type: /e2e|playwright|cypress/i.test(failure) ? "e2e" : "functional",
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
  return /\be2e\b|playwright|cypress/i.test(command);
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
    const cypressCheck = /\bcypress\b/i.test(check.command);

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

    const timerDidNotAdvancePattern = /expected ['"]25:00['"] to not equal ['"]25:00['"]|to not equal ['"]\d{1,2}:\d{2}['"]/i;
    if (e2eCheck && timerDidNotAdvancePattern.test(receivedResult)) {
      recommendedAction =
        "Timer value did not advance between reads; first inspect/fix timer runtime logic in source (hooks/store/components), then update E2E timing/assertion flow only if needed, and re-run this E2E command.";
    }

    if (cypressCheck && diagnostics.length < 2) {
      recommendedAction = `${recommendedAction} If failure output is still low-signal, update Cypress config/scripts to keep terminal-readable assertion output (reporter + stack traces) and avoid screenshot-only diagnostics.`;
    }

    items.push({
      issue,
      expectedResult,
      receivedResult,
      evidence,
      recommendedAction,
    });

    if (cypressCheck && diagnostics.length < 2) {
      items.push({
        issue: "Cypress diagnostics are low-signal for QA handoff.",
        expectedResult: "Cypress failures include assertion message and source location in terminal/report output.",
        receivedResult: "Failure details were too generic and relied on low-value artifacts.",
        evidence: unique([
          ...qaConfigNotes,
          ...artifacts.map((item) => `Artifact: ${item}`),
          ...diagnostics,
        ]).slice(0, 5),
        recommendedAction:
          "Adjust Cypress configuration/scripts so failed runs emit actionable assertion and location details for remediation agents.",
      });
    }
  }

  return items;
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
  switch (selector) {
    case "timer":
    case "timer-title":
      return "src/components/Timer/Timer.tsx";
    case "timer-display":
      return "src/components/CircularTimer/CircularTimer.tsx";
    case "timer-controls":
      return "src/components/Controls/Controls.tsx";
    case "app-container":
      return "src/components/Layout/Layout.tsx";
    default:
      return "the component that renders this element";
  }
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
      expectedResult: `At least one DOM element should expose data-cy="${item.selector}" for Cypress selection.`,
      receivedResult: `No source file currently exposes data-cy="${item.selector}", so Cypress selectors fail.`,
      evidence: [
        `Referenced in specs: ${specs.join(", ")}`,
      ],
      recommendedAction: `Add data-cy="${item.selector}" in ${defaultSelectorTargetHint(item.selector)} and re-run Cypress.`,
    };
  });
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

  return /configfile is invalid|your configfile is invalid|invalid cypress config|cypress configuration.+invalid|missing.+baseurl|missing.+specpattern|cannot find.+cypress\.config/.test(corpus);
}

function isConfigRelatedText(value: string): boolean {
  const lower = value.toLowerCase();
  return /cypress config|cypress configuration|cypress\.config|baseurl|specpattern|config mismatch|config file/.test(lower);
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
  return /\bdata-cy\b|selector hook|missing selector|timer-display|timer-controls|timer-title|app-container/.test(lower);
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
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const reportedUnitTests = await loadReportedUnitTests(taskId);
    const changedFiles = await getGitChangedFiles(workspaceRoot);
    const shouldRunCypressPreflight = qaPreferences.e2ePolicy !== "skip"
      && (qaPreferences.e2eFramework === "cypress" || qaPreferences.e2eFramework === "auto");
    const selectorPreflight = shouldRunCypressPreflight
      ? await runCypressSelectorPreflight(workspaceRoot)
      : null;
    const missingSelectorFindings = selectorPreflight?.missingSelectors || [];
    const skipHeavyE2ERun = missingSelectorFindings.length > 0;
    const executedChecks = await runProjectChecks({
      workspaceRoot,
      timeoutMsPerCheck: 150_000,
      includeE2E: qaPreferences.e2ePolicy !== "skip" && !skipHeavyE2ERun,
    });
    if (missingSelectorFindings.length) {
      executedChecks.push({
        command: "cypress selector preflight",
        status: "failed",
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
        stdoutPreview: "",
        stderrPreview: "",
        diagnostics: buildSelectorPreflightDiagnostics(missingSelectorFindings),
        qaConfigNotes: [
          "QA preflight: skipped heavy Cypress run because required data-cy selectors are missing in source.",
        ],
        artifacts: [],
      });
    }
    const previousQaAttempts = meta.history.filter((x) => x.stage === "qa").length;
    const currentQaAttempt = previousQaAttempts + 1;
    const maxQaRetries = resolveQaMaxRetries();
    const previousReturnHistory = await loadQaReturnHistory(taskId);
    const compactChecks = compactChecksForModel(executedChecks);
    const checkDrivenReturnContext = buildCheckDrivenReturnContext({ executedChecks: compactChecks });
    const selectorPreflightReturnContext = buildSelectorPreflightReturnContext(missingSelectorFindings);

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

    const requiresE2E = qaPreferences.e2eRequired;
    const requiresUnitTests = requiresE2E;
    const e2eChecks = executedChecks.filter((x) => /\be2e\b|playwright|cypress/i.test(x.command));
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

    const remediationAgent: AgentName = baseInput.task.typeHint === "Bug" ? "Bug Fixer" : "Feature Builder";

    const modelInput = {
      ...baseInput,
      qaControl: {
        currentAttempt: currentQaAttempt,
        maxRetries: maxQaRetries,
      },
      validationEvidence: {
        changedFiles,
        executedChecks: compactChecks,
        reportedUnitTests,
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
- Use "validationEvidence.selectorPreflight.missingSelectors" to report missing data-cy hooks with exact selector names and referenced spec files.
- If any check failed, verdict must be "fail".
- If changedFiles is empty, verdict must be "fail".
- If task type is Feature/Bug/Refactor/Mixed and no E2E check was executed, verdict must be "fail".
- Follow qaPreferences.e2ePolicy and qaPreferences.objective as the explicit human quality target.
- If qaPreferences.e2ePolicy is "required", E2E evidence is mandatory.
- If qaPreferences.e2eFramework is "cypress" or "playwright", require evidence for that framework specifically.
- If verdict is "fail", set "nextAgent" to "${remediationAgent}".
- If verdict is "fail", fill "returnContext" with actionable items using "issue", "expectedResult", and "receivedResult".
- Each "returnContext" item must include concrete evidence and a recommended action for the next agent.
- Use executedChecks[].diagnostics, qaConfigNotes, and artifacts to make returnContext specific (avoid screenshot-only guidance).
- For Cypress/E2E failures, include assertion/location evidence and remediation direction in returnContext.
- For Cypress/E2E failures, point to likely application-code root cause paths first; do not give test-only remediation unless evidence shows the test is wrong.
- If failures suggest missing data-cy selectors, list required selectors and target files in returnContext.
- If failures suggest import/export mismatch, call out the exact symbol/file contract mismatch in returnContext.
- If failures suggest Cypress config mismatch (baseUrl/specPattern/configFile), call out exact config edits needed.
- If failures suggest flawed E2E test logic (scoping/order/assertion form), call out exact test file fixes.
- Populate "testCases" as a real QA would: include concrete expectedResult vs actualResult and status.
- Keep "testCases" concise and evidence-driven (max 6).
- If verdict is "pass", set "nextAgent" to "PR Writer".
- This QA attempt is ${currentQaAttempt} of max ${maxQaRetries} before forced human escalation.
- Keep failures specific and actionable.
`;

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "QA Validator",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "testCases": [{ "id": "string", "title": "string", "type": "functional | regression | integration | e2e | unit | config", "steps": ["string"], "expectedResult": "string", "actualResult": "string", "status": "pass | fail | blocked", "evidence": ["string"] }], "failures": ["string"], "verdict": "pass | fail", "e2ePlan": ["string"], "changedFiles": ["string"], "executedChecks": [{ "command": "string", "status": "passed | failed | skipped", "exitCode": 0, "timedOut": false, "durationMs": 0, "stdoutPreview": "string", "stderrPreview": "string", "diagnostics": ["string"], "qaConfigNotes": ["string"], "artifacts": ["string"] }], "returnContext": [{ "issue": "string", "expectedResult": "string", "receivedResult": "string", "evidence": ["string"], "recommendedAction": "string" }], "nextAgent": "PR Writer | Feature Builder | Bug Fixer" }',
    });
    const output = qaOutputSchema.parse(result.parsed);
    output.changedFiles = unique([...output.changedFiles, ...changedFiles]);
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

    output.nextAgent = output.verdict === "pass" ? "PR Writer" : remediationAgent;
    const escalatedToHuman = output.verdict === "fail" && currentQaAttempt >= maxQaRetries;
    if (escalatedToHuman) {
      output.failures = unique([
        ...output.failures,
        `QA retry limit reached (${currentQaAttempt}/${maxQaRetries}). Escalating to human review.`,
      ]);
    }

    const returnContextAfterConfigFilter = filterUnsupportedConfigReturnContext(
      [...output.returnContext, ...checkDrivenReturnContext, ...selectorPreflightReturnContext],
      output.executedChecks,
    );
    const modelAndCheckReturnContext = filterUnsupportedSelectorReturnContext(
      returnContextAfterConfigFilter,
      output.executedChecks,
      missingSelectorFindings,
    );
    output.returnContext = compactQaReturnContextItems([
      ...modelAndCheckReturnContext,
      ...buildFallbackQaReturnContextItems({
        failures: output.failures,
        changedFiles: output.changedFiles,
        executedChecks: output.executedChecks.map((x) => ({
          command: x.command,
          status: x.status,
          exitCode: x.exitCode,
        })),
        existing: modelAndCheckReturnContext,
      }),
    ]);
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

## E2E Plan
${output.e2ePlan.length ? output.e2ePlan.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changed Files (git diff)
${output.changedFiles.length ? output.changedFiles.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Unit Tests Reported By Implementation
${reportedUnitTests.length ? reportedUnitTests.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Executed Checks
${output.executedChecks.length ? output.executedChecks.map((x) => {
        const diag = x.diagnostics?.[0] ? ` | diag=${trimText(x.diagnostics[0], 120)}` : "";
        return `- ${x.status.toUpperCase()} | ${x.command} | exit=${x.exitCode ?? "null"} | ${x.durationMs}ms${diag}`;
      }).join("\n") : "- [none]"}

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
    });
  }
}
