import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { ensureCodeQualityBootstrap } from "../lib/code-quality-bootstrap.js";
import { enforceCypressConfigScriptConsistency } from "../lib/cypress-recovery.js";
import { extractQaHandoffContext } from "../lib/qa-context.js";
import { deriveQaFileHints, synthesizeQaSelectorHotfixEdits } from "../lib/qa-remediation.js";
import { matchesE2EFrameworkCommand, preferredE2ECommand, resolveTaskQaPreferences } from "../lib/qa-preferences.js";
import { normalizeBuilderLikeModelOutput } from "../lib/model-output-recovery.js";
import { deriveQaRootCauseFocus } from "../lib/root-cause-intelligence.js";
import { runPostEditSanityChecks } from "../lib/post-edit-sanity.js";
import { buildFailureSignature, buildRetryStrategyInstructions, decideAdaptiveRetry, resolveQualityRepairMaxAttempts, type RetryStrategy } from "../lib/quality-retry-policy.js";
import { ARTIFACT_FILES, loadTaskArtifact } from "../lib/task-artifacts.js";
import { exists, readJson } from "../lib/fs.js";
import { taskDir } from "../lib/paths.js";
import { bugFixerOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { applyWorkspaceEdits, buildWorkspaceContextSnapshot, detectTestCapabilities, getGitChangedFiles } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function trimText(value: string, maxChars = 220): string {
  const next = value.trim();
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}

function extractQaFailures(previousStage: unknown): string[] {
  if (!previousStage || typeof previousStage !== "object") return [];
  const output = (previousStage as { output?: unknown }).output;
  if (!output || typeof output !== "object") return [];
  const failures = (output as { failures?: unknown }).failures;
  if (!Array.isArray(failures)) return [];
  return failures.filter((x): x is string => typeof x === "string");
}

function contextMentionsE2e(text: string): boolean {
  return /\be2e\b|playwright|cypress/i.test(text);
}

function textSignalsMissingE2eSpecs(text: string): boolean {
  return /no spec files were found|can'?t run because no spec files were found|did not find e2e spec files|missing e2e spec/i.test(text);
}

function hasQaMissingE2eSpecSignal(args: {
  qaFailures: string[];
  latestFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
  cumulativeFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
}): boolean {
  const corpus = [
    ...args.qaFailures,
    ...args.latestFindings.flatMap((item) => [item.issue, item.expectedResult, item.receivedResult, item.recommendedAction, ...item.evidence]),
    ...args.cumulativeFindings.flatMap((item) => [item.issue, item.expectedResult, item.receivedResult, item.recommendedAction, ...item.evidence]),
  ].join("\n").toLowerCase();
  return textSignalsMissingE2eSpecs(corpus);
}

function formatQaFindingsForView(
  findings: Array<{ issue: string; expectedResult: string; receivedResult: string; recommendedAction: string }>,
): string {
  if (!findings.length) return "- [none]";
  return findings
    .map((item, index) => `${index + 1}. ${item.issue}
   Expected: ${item.expectedResult}
   Received: ${item.receivedResult}
   Recommended action: ${item.recommendedAction || "[none]"}`)
    .join("\n");
}

function compactQaFindingsForModel(
  findings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>,
  maxItems = 5,
): Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }> {
  return findings.slice(0, maxItems).map((item) => ({
    issue: trimText(item.issue, 180),
    expectedResult: trimText(item.expectedResult, 180),
    receivedResult: trimText(item.receivedResult, 180),
    evidence: item.evidence.map((x) => trimText(x, 160)).slice(0, 3),
    recommendedAction: trimText(item.recommendedAction, 220),
  }));
}

function compactQaHistoryForModel(
  history: Array<{ attempt: number; summary: string; returnedTo: string; findings: Array<{ issue: string }> }>,
): Array<{ attempt: number; summary: string; returnedTo: string; findingIssues: string[] }> {
  return history.slice(-4).map((entry) => ({
    attempt: entry.attempt,
    summary: trimText(entry.summary, 180),
    returnedTo: entry.returnedTo,
    findingIssues: entry.findings.map((x) => trimText(x.issue, 120)).slice(0, 4),
  }));
}

function collectQaSignals(args: {
  qaFailures: string[];
  latestFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
  cumulativeFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
}): string[] {
  return [
    ...args.qaFailures,
    ...args.latestFindings.flatMap((item) => [
      item.issue,
      item.expectedResult,
      item.receivedResult,
      item.recommendedAction,
      ...item.evidence,
    ]),
    ...args.cumulativeFindings.flatMap((item) => [
      item.issue,
      item.expectedResult,
      item.receivedResult,
      item.recommendedAction,
      ...item.evidence,
    ]),
  ].filter(Boolean);
}

function buildQaFeedbackQuery(args: {
  title: string;
  rawRequest: string;
  qaFailures: string[];
  latestFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
  repeatedIssues: string[];
}): string {
  const lines: string[] = [];
  lines.push(args.title);
  lines.push(args.rawRequest);
  if (args.qaFailures.length) {
    lines.push("QA Failures:");
    for (const item of args.qaFailures.slice(0, 6)) lines.push(`- ${trimText(item, 180)}`);
  }
  if (args.latestFindings.length) {
    lines.push("Latest QA Expected vs Received:");
    for (const item of args.latestFindings.slice(0, 5)) {
      lines.push(`- ${trimText(item.issue, 120)}`);
      lines.push(`  expected=${trimText(item.expectedResult, 120)}`);
      lines.push(`  received=${trimText(item.receivedResult, 120)}`);
      if (item.recommendedAction) lines.push(`  action=${trimText(item.recommendedAction, 140)}`);
      if (item.evidence.length) lines.push(`  evidence=${item.evidence.map((x) => trimText(x, 80)).join(" | ")}`);
    }
  }
  if (args.repeatedIssues.length) {
    lines.push("Repeated QA Issues:");
    for (const issue of args.repeatedIssues.slice(0, 5)) lines.push(`- ${trimText(issue, 120)}`);
  }
  return lines.join("\n");
}

function contextLimitsForIteration(qaAttempt: number) {
  if (qaAttempt >= 2) {
    return {
      maxContextFiles: 8,
      maxTotalContextChars: 16_000,
      maxFileContextChars: 2_800,
      maxScanFiles: 900,
    };
  }

  return {
    maxContextFiles: 10,
    maxTotalContextChars: 22_000,
    maxFileContextChars: 4_200,
    maxScanFiles: 1_100,
  };
}

function editSignature(edits: Array<{ path: string; action: string; find?: string; replace?: string; content?: string }>): string {
  return edits
    .map((edit) => {
      const p = edit.path.replace(/\\/g, "/").trim().toLowerCase();
      const find = (edit.find || "").trim().slice(0, 80);
      const replace = (edit.replace || "").trim().slice(0, 80);
      const contentSample = (edit.content || "").trim().slice(0, 80);
      return `${edit.action}|${p}|${find}|${replace}|${contentSample.length}`;
    })
    .sort()
    .join("||");
}

async function loadPreviousBugFixerSignature(taskId: string): Promise<string | null> {
  const donePath = path.join(taskDir(taskId), "done", DONE_FILE_NAMES.bugFixer);
  if (!(await exists(donePath))) return null;
  try {
    const envelope = await readJson<{ output?: { edits?: Array<{ path: string; action: string; find?: string; replace?: string; content?: string }> } }>(donePath);
    const edits = envelope.output?.edits;
    if (!Array.isArray(edits) || edits.length === 0) return null;
    return editSignature(edits);
  } catch {
    return null;
  }
}

async function loadPreviousSkippedSnippetPaths(taskId: string): Promise<string[]> {
  const donePath = path.join(taskDir(taskId), "done", DONE_FILE_NAMES.bugFixer);
  if (!(await exists(donePath))) return [];
  try {
    const envelope = await readJson<{ output?: { risks?: unknown } }>(donePath);
    const risks = envelope.output?.risks;
    if (!Array.isArray(risks)) return [];
    return unique(
      risks
        .filter((item): item is string => typeof item === "string")
        .map((item) => {
          const match = item.match(/^Skipped edit:\s*([^\s].*?)\s*\(replace_snippet skipped: target snippet not found\)/i);
          return match ? match[1].trim() : "";
        })
        .filter(Boolean),
    );
  } catch {
    return [];
  }
}

function hasE2eInfraEdits(edits: Array<{ path: string }>): boolean {
  return edits.some((edit) => {
    const p = edit.path.replace(/\\/g, "/").toLowerCase();
    return (
      p === "package.json" ||
      p.includes("/e2e/") ||
      p.endsWith(".spec.ts") ||
      p.endsWith(".spec.tsx") ||
      p.includes("playwright") ||
      p.includes("cypress")
    );
  });
}

function hasSourceEdits(edits: Array<{ path: string }>): boolean {
  return edits.some((edit) => edit.path.replace(/\\/g, "/").startsWith("src/"));
}

function extractSymbolContractFileHints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hints: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const modulePath = typeof row.modulePath === "string" ? row.modulePath.trim() : "";
    const importerPath = typeof row.importerPath === "string" ? row.importerPath.trim() : "";
    if (modulePath) hints.push(modulePath);
    if (importerPath) hints.push(importerPath);
  }
  return unique(hints);
}

function normalizeIssueLine(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map((x) => normalizeIssueLine(x)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "");
}

export class BugFixerWorker extends WorkerBase {
  readonly agent = "Bug Fixer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.bugFixer;
  readonly workingFileName = "04b-bug-fixer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("bug-fixer.md");
    const provider = createProvider(config.providers.planner);
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const qaPreferences = resolveTaskQaPreferences(baseInput.task);
    const qualityBootstrap = await ensureCodeQualityBootstrap({ workspaceRoot });
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const qaFailures = extractQaFailures(baseInput.previousStage);
    const qaHandoffContext = extractQaHandoffContext(baseInput.previousStage);
    const projectProfile = await loadTaskArtifact(taskId, ARTIFACT_FILES.projectProfile);
    const bugBrief = await loadTaskArtifact(taskId, ARTIFACT_FILES.bugBrief);
    const symbolContracts = await loadTaskArtifact(taskId, ARTIFACT_FILES.symbolContract);
    const symbolContractFileHints = extractSymbolContractFileHints(symbolContracts);
    const latestQaFindings = compactQaFindingsForModel(qaHandoffContext?.latestFindings ?? []);
    const cumulativeQaFindings = compactQaFindingsForModel(qaHandoffContext?.cumulativeFindings ?? [], 8);
    const qaFileHints = deriveQaFileHints([
      ...latestQaFindings,
      ...cumulativeQaFindings,
    ]);
    const rootCauseFocus = deriveQaRootCauseFocus({
      qaFailures,
      findings: [...latestQaFindings, ...cumulativeQaFindings],
    });
    const repeatedIssues = (qaHandoffContext?.cumulativeFindings ?? [])
      .filter((item) => item.occurrences >= 2)
      .map((item) => `${item.issue} (x${item.occurrences})`)
      .slice(0, 5);
    const previousSkippedSnippetPaths = await loadPreviousSkippedSnippetPaths(taskId);
    const mustChangeStrategy = (qaHandoffContext?.attempt ?? 0) >= 2 || repeatedIssues.length > 0;
    const requiresE2eMainFlow = qaPreferences.e2eRequired;
    const qaSignalsMissingE2eSpecs = hasQaMissingE2eSpecSignal({
      qaFailures,
      latestFindings: latestQaFindings,
      cumulativeFindings: cumulativeQaFindings,
    });
    const missingE2eInfra = !testCapabilities.hasE2EScript || !testCapabilities.hasE2ESpecFiles || qaSignalsMissingE2eSpecs;
    const mustCreateE2eInfra = requiresE2eMainFlow && missingE2eInfra;
    const requiresE2eRepair = [
      ...qaFailures,
      ...latestQaFindings.map((x) => `${x.issue} ${x.expectedResult} ${x.receivedResult}`),
      ...cumulativeQaFindings.map((x) => `${x.issue} ${x.expectedResult} ${x.receivedResult}`),
    ].some((x) => contextMentionsE2e(x));
    await this.note({
      taskId,
      stage: "bug-fixer",
      message: "execution_context",
      details: {
        qaAttempt: qaHandoffContext?.attempt ?? 0,
        qaFailures: qaFailures.length,
        latestFindings: latestQaFindings.length,
        cumulativeFindings: cumulativeQaFindings.length,
        mustChangeStrategy,
        requiresE2eMainFlow,
        mustCreateE2eInfra,
        requiresE2eRepair,
      },
    });
    const workspaceContext = await buildWorkspaceContextSnapshot({
      workspaceRoot,
      query: buildQaFeedbackQuery({
        title: baseInput.task.title,
        rawRequest: baseInput.task.rawRequest,
        qaFailures,
        latestFindings: latestQaFindings,
        repeatedIssues,
      }),
      relatedFiles: unique([
        ...(baseInput.task.extraContext.relatedFiles || []),
        ...qaFileHints,
        ...rootCauseFocus.sourceHints,
        ...symbolContractFileHints,
      ]),
      limits: contextLimitsForIteration(qaHandoffContext?.attempt ?? 0),
    });

    const modelInput = {
      ...baseInput,
      previousStage: qaHandoffContext || qaFailures.length
        ? {
            stage: "qa",
            qaAttempt: qaHandoffContext?.attempt ?? 0,
            verdict: "fail",
          }
        : baseInput.previousStage,
      workspaceContext,
      qaFeedback: {
        failures: qaFailures.slice(0, 8).map((x) => trimText(x, 200)),
        latestExpectedVsReceived: latestQaFindings,
        cumulativeExpectedVsReceived: cumulativeQaFindings,
        repeatedIssues,
        history: compactQaHistoryForModel(qaHandoffContext?.history ?? []),
      },
      upstreamHandoff: {
        projectProfile,
        bugBrief,
        symbolContracts,
      },
      executionContract: {
        mustProduceRealEdits: true,
        allowedActions: ["create", "replace", "replace_snippet", "delete"],
        protectedPaths: [".ai-agents/**", ".git/**"],
        testCapabilities,
        qaPreferences,
        requiresE2eMainFlow,
        mustCreateE2eInfra,
        requiresE2eRepair,
        requiresQaFeedbackRemediation: latestQaFindings.length > 0,
        mustChangeStrategy,
        previousSkippedSnippetPaths,
        rootCauseFocus,
      },
    };

    const strictContract = `
MANDATORY EXECUTION CONTRACT:
- You MUST implement the bug fix through concrete file edits in "edits".
- You MAY edit any files that are directly related to the bug (source, tests, config, and wiring).
- If executionContract.testCapabilities.hasUnitTestScript is true, include at least one updated unit test path in "unitTestsAdded".
- Follow executionContract.qaPreferences.objective as the human-defined validation target.
- If executionContract.requiresE2eMainFlow is true, include runnable e2e command(s) in "testsToRun".
- If executionContract.qaPreferences.e2eFramework is cypress or playwright, include the corresponding framework command in "testsToRun".
- If executionContract.mustCreateE2eInfra is true, create missing e2e script/config and at least one runnable e2e spec for the main flow.
- If executionContract.requiresE2eRepair is true, fix existing e2e coverage gaps called out by QA.
- If executionContract.requiresQaFeedbackRemediation is true, address every item from qaFeedback.latestExpectedVsReceived.
- Use qaFeedback.latestExpectedVsReceived.expectedResult vs receivedResult as explicit fix targets.
- Use qaFeedback.latestExpectedVsReceived.recommendedAction and evidence to choose concrete edits.
- Use upstreamHandoff.projectProfile, upstreamHandoff.bugBrief, and upstreamHandoff.symbolContracts as primary context before proposing edits.
- If upstreamHandoff.symbolContracts defines import/export expectations, edits MUST satisfy those contracts.
- Treat tests as diagnostic signals: prioritize fixing root cause in application/source code first (typically src/**).
- Do not change tests only to "make green" when behavior is broken in app code.
- Modify tests only when evidence shows the test itself is wrong, brittle, or misaligned with intended behavior.
- If executionContract.rootCauseFocus.mustPrioritizeSourceFix is true, include at least one concrete src/** edit targeting the likely root-cause area before/alongside test updates.
- Use executionContract.rootCauseFocus.sourceHints as priority files for source-level investigation.
- Preserve previous QA fixes described in qaFeedback.cumulativeExpectedVsReceived and avoid regressions.
- If QA evidence points to Cypress/E2E diagnostics or config gaps, include required E2E config/script/test edits to make failures actionable and stable.
- If QA findings mention missing data-cy selectors, add those data-cy attributes directly in the relevant UI components.
- Never place data-cy on custom React component invocations (capitalized JSX tags like <Controls ...>); attach data-cy only to native DOM/SVG elements actually rendered in the browser.
- If QA findings mention import/export mismatch (e.g., "does not provide an export named"), reconcile import/export contracts in source code.
- If QA findings mention Cypress config issues (baseUrl/specPattern/configFile), fix and unify Cypress config so tests run consistently.
- If QA findings mention flaky/incorrect E2E test logic (e.g., variable scope across then blocks), patch the test code itself.
- If QA findings show a value expected to change stayed identical across assertions, inspect source/state update logic first and only then adjust E2E timing/assertion flow if the test is at fault.
- If QA findings mention missing E2E selectors, either add matching data-cy attributes in source or update E2E spec to canonical selectors that already exist in source.
- Resolve lint/type issues before handoff (for example TS6198 and no-unused-vars on hook destructuring or config parameters).
- Pre-QA quality gate is strict: lint and build checks (when scripts exist) plus language-aware sanity checks must pass before handoff.
- Inspect command diagnostics/log output for hidden blocker signatures (import/export mismatch, syntax/type crashes) and fix them before handoff.
- If executionContract.previousSkippedSnippetPaths is non-empty, avoid replace_snippet for those paths and use full-file replace edits derived from current workspace content.
- Use exact file structures from workspaceContext; do not invent class names or JSX wrappers that are not present in the file content.
- Before finalizing edits, self-check for obvious syntax/import/type mismatches introduced by your changes.
- If executionContract.mustChangeStrategy is true, do not repeat the previous failed approach.
- If executionContract.mustChangeStrategy is true, include "Iteration Strategy: ..." as the first item in changesMade.
- Use repository paths that exist in workspaceContext.files when possible.
- Prefer action "replace_snippet" for small/localized edits.
- Use action "replace" for full-file rewrites, and "create" only for new files.
- "content" is required for create/replace.
- For "replace_snippet", provide "find" and "replace".
- Keep edits scoped to bug resolution and its required tests.

Return exactly this JSON shape:
{
  "implementationSummary": "string",
  "filesChanged": ["string"],
  "changesMade": ["string"],
  "unitTestsAdded": ["string"],
  "testsToRun": ["string"],
  "risks": ["string"],
  "edits": [
    {
      "path": "relative/path.ext",
      "action": "create | replace | replace_snippet | delete",
      "content": "required for create/replace",
      "find": "required for replace_snippet",
      "replace": "required for replace_snippet"
    }
  ],
  "nextAgent": "Reviewer"
}
`;

    const roleContract = buildAgentRoleContract("Bug Fixer", {
      stage: "bug-fixer",
      taskTypeHint: baseInput.task.typeHint,
      qaAttempt: qaHandoffContext?.attempt ?? 0,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "Bug Fixer",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string (required for create/replace)", "find": "string (required for replace_snippet)", "replace": "string (required for replace_snippet)" }], "nextAgent": "Reviewer" }',
    });
    const normalizedModelOutput = normalizeBuilderLikeModelOutput(result.parsed);
    const output = bugFixerOutputSchema.parse(normalizedModelOutput.payload);
    if (qualityBootstrap.notes.length) {
      output.changesMade = unique([...qualityBootstrap.notes, ...output.changesMade]);
    }
    if (qualityBootstrap.warnings.length) {
      output.risks = unique([...output.risks, ...qualityBootstrap.warnings]);
    }
    if (normalizedModelOutput.notes.length) {
      output.risks = unique([...output.risks, ...normalizedModelOutput.notes]);
    }
    const previousSignature = await loadPreviousBugFixerSignature(taskId);
    const currentSignature = editSignature(output.edits);
    if (mustChangeStrategy && previousSignature && previousSignature === currentSignature) {
      output.risks = unique([
        ...output.risks,
        "Proposed edit plan is identical to the previous failed attempt; strategy must differ.",
      ]);
    }
    if (mustChangeStrategy) {
      const hasStrategyLine = output.changesMade.some((item) => /^iteration strategy:/i.test(item));
      if (!hasStrategyLine) {
        const strategy = repeatedIssues.length
          ? `Iteration Strategy: prioritize repeated blockers (${repeatedIssues.join("; ")}).`
          : "Iteration Strategy: apply a materially different fix path than the previous QA-failed attempt.";
        output.changesMade = [strategy, ...output.changesMade];
      }
    }
    if (testCapabilities.hasUnitTestScript && !output.unitTestsAdded.length) {
      output.risks = unique([
        ...output.risks,
        "Unit test scripts exist but no unit test file was reported in unitTestsAdded.",
      ]);
    }
    const hasRequiredE2eCommand = output.testsToRun.some((x) => matchesE2EFrameworkCommand(x, qaPreferences.e2eFramework));
    const preferredCommand = preferredE2ECommand(qaPreferences.e2eFramework, testCapabilities.e2eScripts);
    if (requiresE2eRepair && !hasRequiredE2eCommand) {
      output.testsToRun = unique([...output.testsToRun, preferredCommand]);
      output.risks = unique([
        ...output.risks,
        `QA requested E2E remediation but testsToRun did not include ${qaPreferences.e2eFramework} command coverage.`,
      ]);
    }
    if (requiresE2eMainFlow && !output.testsToRun.some((x) => matchesE2EFrameworkCommand(x, qaPreferences.e2eFramework))) {
      output.testsToRun = unique([...output.testsToRun, preferredCommand]);
      output.risks = unique([
        ...output.risks,
        `Main-flow E2E is required (${qaPreferences.e2eFramework}) but testsToRun did not include the required framework command.`,
      ]);
    }
    if (mustCreateE2eInfra && !hasE2eInfraEdits(output.edits)) {
      output.risks = unique([
        ...output.risks,
        "No E2E infrastructure edits were proposed although E2E script/spec infrastructure is missing.",
      ]);
    }
    if (latestQaFindings.length && !output.changesMade.length) {
      output.risks = unique([
        ...output.risks,
        "QA provided detailed expected-vs-received findings, but changesMade is empty.",
      ]);
    }
    if (rootCauseFocus.mustPrioritizeSourceFix && !hasSourceEdits(output.edits)) {
      output.risks = unique([
        ...output.risks,
        `Root-cause-first guard: QA signals indicate application-code defect, but no src/** edit was proposed. Priority hints: ${rootCauseFocus.sourceHints.join(", ") || "[none]"}.`,
      ]);
    }

    const cypressRecovery = await enforceCypressConfigScriptConsistency({
      workspaceRoot,
      edits: output.edits,
      signals: collectQaSignals({
        qaFailures,
        latestFindings: latestQaFindings,
        cumulativeFindings: cumulativeQaFindings,
      }),
    });
    output.edits = cypressRecovery.edits;
    if (cypressRecovery.changed && cypressRecovery.note) {
      output.changesMade = unique([...output.changesMade, cypressRecovery.note]);
    }
    if (cypressRecovery.warning) {
      output.risks = unique([...output.risks, cypressRecovery.warning]);
    }

    const selectorHotfix = await synthesizeQaSelectorHotfixEdits({
      workspaceRoot,
      findings: latestQaFindings,
      existingEdits: output.edits,
    });
    output.edits = selectorHotfix.edits;
    if (selectorHotfix.notes.length) {
      output.changesMade = unique([...output.changesMade, ...selectorHotfix.notes]);
    }
    if (selectorHotfix.warnings.length) {
      output.risks = unique([...output.risks, ...selectorHotfix.warnings]);
    }

    const gitChangedBefore = await getGitChangedFiles(workspaceRoot);
    const applied = await applyWorkspaceEdits({
      workspaceRoot,
      edits: output.edits,
    });
    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const newlyTrackedGitChanges = gitChangedFiles.filter((file) => !gitChangedBefore.includes(file));
    const effectiveChanged = unique([
      ...applied.changedFiles,
      ...newlyTrackedGitChanges,
    ]);

    if (!effectiveChanged.length && !gitChangedFiles.length) {
      throw new Error("Bug Fixer completed but no code changes were detected. No usable patch was applied.");
    }

    if (!effectiveChanged.length && gitChangedFiles.length) {
      output.risks = unique([
        ...output.risks,
        "No net-new edits were applied in this iteration; proceeding with existing workspace changes for validation.",
      ]);
    }

    output.filesChanged = effectiveChanged.length ? effectiveChanged : gitChangedFiles;
    let stageScopeFiles = unique([
      ...applied.changedFiles,
      ...output.edits.map((edit) => edit.path),
      ...qualityBootstrap.changedFiles,
    ]).map((x) => normalizePathToken(x));
    output.risks = uniqueNormalized([
      ...output.risks,
      ...applied.warnings,
      ...applied.skippedEdits.map((x) => `Skipped edit: ${x}`),
    ]);
    let postEditSanity = await runPostEditSanityChecks({
      workspaceRoot,
      changedFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
      scopeFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
      timeoutMsPerCheck: 120_000,
      requireLintScript: true,
      requireBuildScript: true,
      enforceCleanProject: true,
      detectHiddenLogBlockers: true,
    });
    await this.note({
      taskId,
      stage: "bug-fixer",
      message: "quality_gate_initial",
      details: {
        scopeFiles: stageScopeFiles.length,
        checks: postEditSanity.checks.slice(0, 3).map((check) => ({
          command: check.command,
          status: check.status,
          exitCode: check.exitCode,
        })),
        blockingFailures: postEditSanity.blockingFailureSummaries.length,
        outOfScopeFailures: postEditSanity.outOfScopeFailureSummaries.length,
        cheapChecksExecuted: postEditSanity.metrics.cheapChecksExecuted,
        heavyChecksExecuted: postEditSanity.metrics.heavyChecksExecuted,
        heavyChecksSkipped: postEditSanity.metrics.heavyChecksSkipped,
        fullBuildChecksExecuted: postEditSanity.metrics.fullBuildChecksExecuted,
        earlyInScopeFailures: postEditSanity.metrics.earlyInScopeFailures,
      },
    });

    let qualityRepairAttempted = false;
    let qualityRepairAttempts = 0;
    const maxQualityRepairAttempts = resolveQualityRepairMaxAttempts();
    const blockingSignatureCounts = new Map<string, number>();
    let noProgressStreak = 0;
    let previousRetryState: {
      strategy: RetryStrategy;
      signature: string;
      blockingCount: number;
      category: string;
    } | undefined;
    const retryStats = {
      attempted: 0,
      productive: 0,
      unproductive: 0,
      repeatedStrategy: 0,
      additionalTimeMs: 0,
      abortedEarly: false,
      abortReason: "",
    };
    while (postEditSanity.blockingFailureSummaries.length && qualityRepairAttempts < maxQualityRepairAttempts) {
      const nextAttempt = qualityRepairAttempts + 1;
      const blockingBeforeCount = postEditSanity.blockingFailureSummaries.length;
      const blockingSignature = buildFailureSignature(postEditSanity.blockingFailureSummaries);
      const signatureAttempts = (blockingSignatureCounts.get(blockingSignature) || 0) + 1;
      const retryDecision = decideAdaptiveRetry({
        attempt: nextAttempt,
        maxAttempts: maxQualityRepairAttempts,
        blockingFailures: postEditSanity.blockingFailureSummaries,
        blockingCount: blockingBeforeCount,
        signature: blockingSignature,
        signatureAttempts,
        noProgressStreak,
        previousAttempt: previousRetryState,
      });
      const strategyChanged = previousRetryState ? previousRetryState.strategy !== retryDecision.strategy : false;
      await this.note({
        taskId,
        stage: "bug-fixer",
        message: "quality_repair_attempt_started",
        details: {
          attempt: nextAttempt,
          maxAttempts: maxQualityRepairAttempts,
          blockingFailures: postEditSanity.blockingFailureSummaries.slice(0, 3),
          signature: blockingSignature,
          signatureAttempts,
          strategy: retryDecision.strategy,
          strategyChanged,
          retryReason: retryDecision.reason,
          failureHypothesis: retryDecision.hypothesis,
          changedFromPrevious: retryDecision.changedFromPrevious,
          successCriteria: retryDecision.successCriteria,
          abandonCriteria: retryDecision.abandonCriteria,
          noProgressStreak,
        },
      });
      if (!retryDecision.shouldContinue) {
        retryStats.abortedEarly = true;
        retryStats.abortReason = retryDecision.reason;
        output.risks = uniqueNormalized([
          ...output.risks,
          `Adaptive retry aborted before attempt ${nextAttempt}: ${retryDecision.reason}`,
        ]);
        await this.note({
          taskId,
          stage: "bug-fixer",
          message: "quality_repair_aborted_early",
          details: {
            attempt: nextAttempt,
            reason: retryDecision.reason,
            noProgressStreak,
            blockingFailures: postEditSanity.blockingFailureSummaries.slice(0, 3),
          },
        });
        break;
      }
      qualityRepairAttempted = true;
      qualityRepairAttempts = nextAttempt;
      blockingSignatureCounts.set(blockingSignature, signatureAttempts);
      if (signatureAttempts > 3) {
        output.risks = uniqueNormalized([
          ...output.risks,
          `Quality repair halted: blocking failure signature repeated ${signatureAttempts - 1} times without progress.`,
        ]);
        break;
      }
      const repairContext = await buildWorkspaceContextSnapshot({
        workspaceRoot,
        query: postEditSanity.blockingFailureSummaries.join("\n"),
        relatedFiles: stageScopeFiles,
        limits: retryDecision.contextLimits,
      });
      const retryInstructions = buildRetryStrategyInstructions({
        strategy: retryDecision.strategy,
        attempt: qualityRepairAttempts,
        maxAttempts: maxQualityRepairAttempts,
        blockingFailures: postEditSanity.blockingFailureSummaries,
        changedFromPrevious: retryDecision.changedFromPrevious,
      });
      const repairInput = {
        ...modelInput,
        workspaceContext: repairContext,
        qualityGate: {
          mode: "pre_handover_repair",
          blockingFailures: postEditSanity.blockingFailureSummaries,
          scopeFiles: stageScopeFiles,
          attempt: qualityRepairAttempts,
          maxAttempts: maxQualityRepairAttempts,
          retryReason: retryDecision.reason,
          failureHypothesis: retryDecision.hypothesis,
          strategy: retryDecision.strategy,
          strategyChanged,
          changedFromPrevious: retryDecision.changedFromPrevious,
          successCriteria: retryDecision.successCriteria,
          abandonCriteria: retryDecision.abandonCriteria,
        },
      };
      const repairPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(repairInput, null, 2))}\n\n${roleContract}\n\n${strictContract}\n\nQUALITY GATE REMEDIATION:\n- Current attempt: ${qualityRepairAttempts}/${maxQualityRepairAttempts}.\n- Fix every blocking failure from qualityGate.blockingFailures before handover.\n- Keep edits scoped to qualityGate.scopeFiles when possible.\n- Do not create unrelated behavior changes.\n- If diagnostics mention TS6198 or no-unused-vars, remove or rename unused bindings so lint/typecheck passes.\n- If diagnostics mention TS2322 / IntrinsicAttributes, align props with existing component contracts instead of widening APIs blindly.\n- Return valid JSON with concrete edits only.\n\n${retryInstructions}`;
      const retryStartedAt = Date.now();
      const repairResult = await provider.generateStructured({
        agent: "Bug Fixer",
        taskId,
        stage: request.stage,
        taskType: baseInput.task.typeHint,
        systemPrompt: repairPrompt,
        input: repairInput,
        expectedJsonSchemaDescription:
          '{ "implementationSummary": "string", "filesChanged": ["string"], "changesMade": ["string"], "unitTestsAdded": ["string"], "testsToRun": ["string"], "risks": ["string"], "edits": [{ "path": "string", "action": "create | replace | replace_snippet | delete", "content": "string (required for create/replace)", "find": "string (required for replace_snippet)", "replace": "string (required for replace_snippet)" }], "nextAgent": "Reviewer" }',
      });
      const normalizedRepairOutput = normalizeBuilderLikeModelOutput(repairResult.parsed);
      const repairOutput = bugFixerOutputSchema.parse(normalizedRepairOutput.payload);
      const repairApplied = await applyWorkspaceEdits({
        workspaceRoot,
        edits: repairOutput.edits,
      });
      stageScopeFiles = unique([
        ...stageScopeFiles,
        ...repairOutput.edits.map((edit) => edit.path),
        ...repairApplied.changedFiles,
      ]).map((x) => normalizePathToken(x));
      if (!repairApplied.changedFiles.length && !repairOutput.edits.length) {
        const retryDurationMs = Date.now() - retryStartedAt;
        retryStats.attempted += 1;
        retryStats.unproductive += 1;
        retryStats.additionalTimeMs += retryDurationMs;
        if (previousRetryState && previousRetryState.strategy === retryDecision.strategy) {
          retryStats.repeatedStrategy += 1;
        }
        noProgressStreak += 1;
        previousRetryState = {
          strategy: retryDecision.strategy,
          signature: blockingSignature,
          blockingCount: blockingBeforeCount,
          category: retryDecision.category,
        };
        output.risks = uniqueNormalized([
          ...output.risks,
          `Quality repair attempt ${qualityRepairAttempts} produced no file changes.`,
        ]);
        await this.note({
          taskId,
          stage: "bug-fixer",
          message: "quality_repair_attempt_result",
          details: {
            attempt: qualityRepairAttempts,
            strategy: retryDecision.strategy,
            changedFiles: [],
            blockingFailuresBefore: blockingBeforeCount,
            blockingFailuresAfter: blockingBeforeCount,
            progressed: false,
            sameSignatureAfter: true,
            retryDurationMs,
            noProgressStreak,
            blockingFailures: blockingBeforeCount,
            outOfScopeFailures: postEditSanity.outOfScopeFailureSummaries.length,
            cheapChecksExecuted: postEditSanity.metrics.cheapChecksExecuted,
            heavyChecksExecuted: postEditSanity.metrics.heavyChecksExecuted,
            heavyChecksSkipped: postEditSanity.metrics.heavyChecksSkipped,
            fullBuildChecksExecuted: postEditSanity.metrics.fullBuildChecksExecuted,
            earlyInScopeFailures: postEditSanity.metrics.earlyInScopeFailures,
            retryReason: retryDecision.reason,
            failureHypothesis: retryDecision.hypothesis,
            changedFromPrevious: retryDecision.changedFromPrevious,
          },
        });
        break;
      }
      output.filesChanged = unique([...output.filesChanged, ...repairApplied.changedFiles]);
      output.changesMade = unique([
        ...output.changesMade,
        `Quality repair pass ${qualityRepairAttempts}/${maxQualityRepairAttempts}: attempted to resolve pre-handover lint/type/syntax blockers.`,
        ...repairOutput.changesMade,
      ]);
      output.risks = uniqueNormalized([
        ...output.risks,
        ...repairOutput.risks,
        ...repairApplied.warnings,
      ]);
      postEditSanity = await runPostEditSanityChecks({
        workspaceRoot,
        changedFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
        scopeFiles: stageScopeFiles.length ? stageScopeFiles : output.filesChanged,
        timeoutMsPerCheck: 120_000,
        requireLintScript: true,
        requireBuildScript: true,
        enforceCleanProject: true,
        detectHiddenLogBlockers: true,
      });
      const retryDurationMs = Date.now() - retryStartedAt;
      const blockingAfterCount = postEditSanity.blockingFailureSummaries.length;
      const blockingAfterSignature = buildFailureSignature(postEditSanity.blockingFailureSummaries);
      const progressed = blockingAfterCount < blockingBeforeCount;
      retryStats.attempted += 1;
      retryStats.additionalTimeMs += retryDurationMs;
      if (progressed) {
        retryStats.productive += 1;
        noProgressStreak = 0;
      } else {
        retryStats.unproductive += 1;
        noProgressStreak += 1;
      }
      if (previousRetryState && previousRetryState.strategy === retryDecision.strategy) {
        retryStats.repeatedStrategy += 1;
      }
      previousRetryState = {
        strategy: retryDecision.strategy,
        signature: blockingAfterSignature || blockingSignature,
        blockingCount: blockingAfterCount,
        category: retryDecision.category,
      };
      await this.note({
        taskId,
        stage: "bug-fixer",
        message: "quality_repair_attempt_result",
        details: {
          attempt: qualityRepairAttempts,
          strategy: retryDecision.strategy,
          changedFiles: repairApplied.changedFiles.slice(0, 8),
          blockingFailuresBefore: blockingBeforeCount,
          blockingFailures: postEditSanity.blockingFailureSummaries.length,
          outOfScopeFailures: postEditSanity.outOfScopeFailureSummaries.length,
          progressed,
          sameSignatureAfter: blockingAfterSignature === blockingSignature,
          retryDurationMs,
          noProgressStreak,
          cheapChecksExecuted: postEditSanity.metrics.cheapChecksExecuted,
          heavyChecksExecuted: postEditSanity.metrics.heavyChecksExecuted,
          heavyChecksSkipped: postEditSanity.metrics.heavyChecksSkipped,
          fullBuildChecksExecuted: postEditSanity.metrics.fullBuildChecksExecuted,
          earlyInScopeFailures: postEditSanity.metrics.earlyInScopeFailures,
          retryReason: retryDecision.reason,
          failureHypothesis: retryDecision.hypothesis,
          changedFromPrevious: retryDecision.changedFromPrevious,
        },
      });
    }

    if (postEditSanity.blockingFailureSummaries.length) {
      output.risks = uniqueNormalized([...output.risks, ...postEditSanity.blockingFailureSummaries]);
    }
    if (postEditSanity.outOfScopeFailureSummaries.length) {
      output.risks = uniqueNormalized([
        ...output.risks,
        `Ignored ${postEditSanity.outOfScopeFailureSummaries.length} out-of-scope quality failures not linked to files changed in this stage.`,
      ]);
    }
    if (postEditSanity.blockingFailureSummaries.length) {
      await this.note({
        taskId,
        stage: "bug-fixer",
        message: "quality_gate_blocked",
        details: {
          attempts: qualityRepairAttempts,
          blockingFailures: postEditSanity.blockingFailureSummaries.slice(0, 3),
          retryAttempts: retryStats.attempted,
          retryProductive: retryStats.productive,
          retryUnproductive: retryStats.unproductive,
          retryRepeatedStrategy: retryStats.repeatedStrategy,
          retryAdditionalTimeMs: retryStats.additionalTimeMs,
          retryAbortedEarly: retryStats.abortedEarly,
          retryAbortReason: retryStats.abortReason,
        },
      });
      throw new Error(
        `Pre-handover quality gate blocked Bug Fixer handoff (${qualityRepairAttempted ? `after ${qualityRepairAttempts} remediation attempt(s)` : "no remediation attempt"}): ${postEditSanity.blockingFailureSummaries[0]}`,
      );
    }
    await this.note({
      taskId,
      stage: "bug-fixer",
      message: "quality_gate_passed",
      details: {
        attempts: qualityRepairAttempts,
        checksExecuted: postEditSanity.checks.length,
        filesChanged: output.filesChanged.length,
        retryAttempts: retryStats.attempted,
        retryProductive: retryStats.productive,
        retryUnproductive: retryStats.unproductive,
        retryRepeatedStrategy: retryStats.repeatedStrategy,
        retryAdditionalTimeMs: retryStats.additionalTimeMs,
        retryAbortedEarly: retryStats.abortedEarly,
        retryAbortReason: retryStats.abortReason,
        cheapChecksExecuted: postEditSanity.metrics.cheapChecksExecuted,
        heavyChecksExecuted: postEditSanity.metrics.heavyChecksExecuted,
        heavyChecksSkipped: postEditSanity.metrics.heavyChecksSkipped,
        fullBuildChecksExecuted: postEditSanity.metrics.fullBuildChecksExecuted,
        earlyInScopeFailures: postEditSanity.metrics.earlyInScopeFailures,
      },
    });
    const sanityCheckLines = postEditSanity.checks.map((check) => {
      const detail = check.diagnostics?.[0] ? ` | diag=${trimText(check.diagnostics[0], 120)}` : "";
      return `- ${check.status.toUpperCase()} | ${check.command} | exit=${check.exitCode ?? "null"} | ${check.durationMs}ms${detail}`;
    });
    const sanityMetricsLine = `- planned=${postEditSanity.metrics.plannedChecks} | executed=${postEditSanity.metrics.executedChecks} | cheap=${postEditSanity.metrics.cheapChecksExecuted} | heavy=${postEditSanity.metrics.heavyChecksExecuted} | heavy_skipped=${postEditSanity.metrics.heavyChecksSkipped} | full_build=${postEditSanity.metrics.fullBuildChecksExecuted} | early_in_scope_failures=${postEditSanity.metrics.earlyInScopeFailures}`;
    const retryMetricsLine = `- attempts=${retryStats.attempted} | productive=${retryStats.productive} | unproductive=${retryStats.unproductive} | repeated_strategy=${retryStats.repeatedStrategy} | additional_time_ms=${retryStats.additionalTimeMs} | aborted_early=${retryStats.abortedEarly ? "yes" : "no"}${retryStats.abortReason ? ` | abort_reason=${trimText(retryStats.abortReason, 120)}` : ""}`;

    const view = `# HANDOFF

## Agent
Bug Fixer

## Implementation Summary
${output.implementationSummary}

## Files Changed
${output.filesChanged.length ? output.filesChanged.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changes Made
${output.changesMade.length ? output.changesMade.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Code Quality Bootstrap
${qualityBootstrap.notes.length ? qualityBootstrap.notes.map((x) => `- ${x}`).join("\n") : "- [none]"}
${qualityBootstrap.warnings.length ? qualityBootstrap.warnings.map((x) => `- WARNING: ${x}`).join("\n") : ""}

## QA Context Received (Latest Return)
${formatQaFindingsForView(latestQaFindings)}

## Upstream Symbol Contracts
${Array.isArray(symbolContracts) && symbolContracts.length
  ? (symbolContracts as Array<{ expectedImportShape?: string; mismatchSummary?: string }>)
    .slice(0, 6)
    .map((item) => `- ${item.expectedImportShape || "[unknown import shape]"} | ${item.mismatchSummary || "[no mismatch summary]"}`)
    .join("\n")
  : "- [none]"}

## Unit Tests Added/Updated
${output.unitTestsAdded.length ? output.unitTestsAdded.map((x) => `- ${x}`).join("\n") : "- [none reported]"}

## Tests To Run
${output.testsToRun.length ? output.testsToRun.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Risks
${output.risks.length ? output.risks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Post-Edit Sanity Checks
${sanityCheckLines.length ? sanityCheckLines.join("\n") : "- [not run]"}
${sanityCheckLines.length ? `\n## Post-Edit Sanity Metrics\n${sanityMetricsLine}` : ""}

## Retry Metrics
${retryMetricsLine}

## Applied Edits
${output.edits.length ? output.edits.map((x) => `- ${x.action.toUpperCase()} ${x.path}`).join("\n") : "- [none]"}

## Next
Reviewer
`;

    await this.finishStage({
      taskId,
      stage: "bug-fixer",
      doneFileName: DONE_FILE_NAMES.bugFixer,
      viewFileName: "04b-bug-fixer.md",
      viewContent: view,
      output,
      nextAgent: "Reviewer",
      nextStage: "reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.reviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.bugFixer}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
      providerAttempts: result.providerAttempts,
      providerBackoffRetries: result.providerBackoffRetries,
      providerBackoffWaitMs: result.providerBackoffWaitMs,
      providerRateLimitWaitMs: result.providerRateLimitWaitMs,
    });
  }
}
