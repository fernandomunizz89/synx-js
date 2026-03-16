import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile } from "../../lib/config.js";
import { buildAgentRoleContract } from "../../lib/agent-role-contract.js";
import { ensureCodeQualityBootstrap } from "../../lib/code-quality-bootstrap.js";
import { exists, readJson, writeJson } from "../../lib/fs.js";
import { taskDir } from "../../lib/paths.js";
import { qaOutputSchema } from "../../lib/schema.js";
import { loadTaskMeta } from "../../lib/task.js";
import type { AgentName, StageEnvelope } from "../../lib/types.js";
import {
  buildFallbackQaReturnContextItems,
  buildQaCumulativeFindings,
  compactQaReturnContextItems,
  compactQaReturnHistoryEntries,
  normalizeQaReturnContextItems,
  normalizeQaReturnHistoryEntries,
  type QaHandoffContext,
  type QaRemediationAgent,
  type QaReturnContextItem,
  type QaReturnHistoryEntry,
} from "../../lib/qa-context.js";
import { resolveTaskQaPreferences } from "../../lib/qa-preferences.js";
import { deriveQaRootCauseFocus } from "../../lib/root-cause-intelligence.js";
import { createProvider } from "../../providers/factory.js";
import { nowIso } from "../../lib/utils.js";
import { trimText } from "../../lib/text-utils.js";

import { detectTestCapabilities, getGitChangedFiles } from "../../lib/workspace-tools.js";
import { runProjectChecks } from "../../lib/validation-checks.js";
import { WorkerBase } from "../base.js";

function sinxQaReturnHistoryPath(taskId: string): string {
  return path.join(taskDir(taskId), "artifacts", "sinx-qa-return-context-history.json");
}

async function loadSinxQaReturnHistory(taskId: string): Promise<QaReturnHistoryEntry[]> {
  const historyPath = sinxQaReturnHistoryPath(taskId);
  if (!(await exists(historyPath))) return [];
  try {
    const payload = await readJson<{ entries?: unknown }>(historyPath);
    return compactQaReturnHistoryEntries(normalizeQaReturnHistoryEntries(payload.entries));
  } catch {
    return [];
  }
}

async function saveSinxQaReturnHistory(taskId: string, entries: QaReturnHistoryEntry[]): Promise<void> {
  await writeJson(sinxQaReturnHistoryPath(taskId), {
    taskId,
    updatedAt: nowIso(),
    entries,
  });
}

function isExpertAgent(name: string): name is QaRemediationAgent {
  return (
    name === "Sinx Front Expert"
    || name === "Sinx Mobile Expert"
    || name === "Sinx Back Expert"
    || name === "Sinx SEO Specialist"
    || name === "Feature Builder"
    || name === "Bug Fixer"
  );
}

/**
 * Sinx QA Engineer – Dream Stack 2026
 *
 * High-Voltage Execution Arbiter for the expert squad.
 * Validates software produced by domain experts. Chooses contextually
 * between Playwright (full Web E2E) and Vitest (unit isolation).
 * Routes failures back to the originating domain expert automatically.
 */
export class SinxQAEngineer extends WorkerBase {
  readonly agent = "Sinx QA Engineer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.sinxQaEngineer;
  readonly workingFileName = "06-sinx-qa-engineer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("sinx-qa-engineer.md");
    const provider = createProvider(config.providers.planner);
    const workspaceRoot = process.cwd();
    const baseInput = await this.buildAgentInput(taskId, request);
    const qaPreferences = resolveTaskQaPreferences(baseInput.task);
    await ensureCodeQualityBootstrap({ workspaceRoot });
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const returnHistory = await loadSinxQaReturnHistory(taskId);

    await this.note({
      taskId,
      stage: "sinx-qa-engineer",
      message: "execution_context",
      details: { testCapabilities, returnHistoryCount: returnHistory.length, qaPreferences },
    });

    // Run automated project checks
    const gitChangedFiles = await getGitChangedFiles(workspaceRoot);
    const checks = await runProjectChecks({
      workspaceRoot,
      includeE2E: qaPreferences.e2eRequired,
      changedFiles: gitChangedFiles,
    });

    const failedChecks = checks.filter((c) => c.status === "failed");
    const allPassed = failedChecks.length === 0;

    // Build return context from failed checks
    const checkFailureStrings = failedChecks.flatMap((c) =>
      (c.diagnostics ?? []).length > 0 ? c.diagnostics ?? [] : [`Check failed: ${c.command} (exit ${c.exitCode ?? "null"})`],
    );
    const fallbackReturnContext: QaReturnContextItem[] = allPassed ? [] : buildFallbackQaReturnContextItems({
      failures: checkFailureStrings,
      changedFiles: gitChangedFiles,
      executedChecks: failedChecks,
    });

    // Determine which expert to return to on failure
    const taskMeta = await loadTaskMeta(taskId);
    const previousExpert: QaRemediationAgent | "Human Review" = (() => {
      const history = taskMeta.history ?? [];
      const expertNames = ["Sinx Front Expert", "Sinx Mobile Expert", "Sinx Back Expert"] as const;
      for (let i = history.length - 1; i >= 0; i--) {
        const agentName = history[i].agent as string;
        if (expertNames.some((n) => n === agentName) && isExpertAgent(agentName)) {
          return agentName as QaRemediationAgent;
        }
      }
      return "Human Review";
    })();

    const roleContract = buildAgentRoleContract("Sinx QA Engineer", {
      stage: "sinx-qa-engineer",
      taskTypeHint: baseInput.task.typeHint,
    });

    const qaContract = `
SINX QA ENGINEER – EXECUTION CONTRACT (Dream Stack 2026):
- Mission: validate ALL behavior against acceptance criteria. You are the last quality gate.
- Strategy: choose Playwright for full Web E2E; Vitest for isolated logic units. Never mix coverage signals.
- Destructive Mindset: probe edge cases, race conditions, missing guards, and type boundaries.
- Evidence: every finding must include: returnContext[] with issue, expectedResult, receivedResult, evidence[], recommendedAction.
- Verdict: "pass" only if ALL acceptance criteria + automated checks pass.
- Stack: validate mechanical integrity of Next.js, Expo/React Native, Fastify/NestJS.
- nextAgent must be one of: "PR Writer" | "Feature Builder" | "Bug Fixer" | "Sinx Front Expert" | "Sinx Mobile Expert" | "Sinx Back Expert" | "Human Review".
  Use the expert that built the failing feature. Use "PR Writer" on pass.
`;

    const modelInput = {
      ...baseInput,
      executedChecks: checks.map((c) => ({
        command: c.command,
        status: c.status,
        exitCode: c.exitCode,
        timedOut: c.timedOut,
        durationMs: c.durationMs,
        stdoutPreview: trimText(c.stdoutPreview, 500),
        stderrPreview: trimText(c.stderrPreview, 500),
        diagnostics: (c.diagnostics ?? []).map((d) => trimText(d, 220)).slice(0, 8),
        qaConfigNotes: (c.qaConfigNotes ?? []).map((d) => trimText(d, 180)).slice(0, 4),
        artifacts: (c.artifacts ?? []).map((d) => trimText(d, 160)).slice(0, 4),
      })),
      returnHistory: compactQaReturnHistoryEntries(returnHistory),
      gitChangedFiles,
      qaPreferences,
      testCapabilities,
      previousExpert,
    };

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}\n\n${qaContract}`;

    const result = await provider.generateStructured({
      agent: "Sinx QA Engineer",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "testCases": [{ "id": "string", "title": "string", "type": "functional | regression | integration | e2e | unit | config", "steps": ["string"], "expectedResult": "string", "actualResult": "string", "status": "pass | fail | blocked", "evidence": ["string"] }], "failures": ["string"], "verdict": "pass | fail", "returnContext": [{ "issue": "string", "expectedResult": "string", "receivedResult": "string", "evidence": ["string"], "recommendedAction": "string" }], "nextAgent": "PR Writer | Feature Builder | Bug Fixer | Sinx Front Expert | Sinx Mobile Expert | Sinx Back Expert | Human Review" }',
    });

    const output = qaOutputSchema.parse(result.parsed);
    const verdict = output.verdict;

    // Merge model returnContext with fallback context derived from checks
    const modelReturnContext = normalizeQaReturnContextItems(output.returnContext);
    const mergedReturnContext = compactQaReturnContextItems([...modelReturnContext, ...fallbackReturnContext]);
    const cumulativeFindings = buildQaCumulativeFindings([
      ...returnHistory,
      {
        attempt: returnHistory.length + 1,
        returnedAt: nowIso(),
        returnedTo: isExpertAgent(String(previousExpert)) ? (previousExpert as QaRemediationAgent) : "Feature Builder",
        summary: output.failures.slice(0, 2).join("; ") || "[no failures]",
        failures: output.failures,
        findings: mergedReturnContext,
      },
    ]);

    const qaHandoffContext: QaHandoffContext = {
      attempt: returnHistory.length + 1,
      maxRetries: 3,
      returnedTo: verdict === "pass"
        ? "PR Writer"
        : (isExpertAgent(String(previousExpert)) ? (previousExpert as QaRemediationAgent) : "Feature Builder"),
      summary: output.failures.slice(0, 2).join("; ") || (verdict === "pass" ? "All checks passed." : "[no summary]"),
      latestFindings: mergedReturnContext,
      cumulativeFindings: cumulativeFindings.slice(0, 8),
      history: returnHistory,
    };

    // Persist history for next QA iteration
    if (verdict !== "pass" && isExpertAgent(String(previousExpert))) {
      const newEntry: QaReturnHistoryEntry = {
        attempt: qaHandoffContext.attempt,
        returnedAt: nowIso(),
        returnedTo: previousExpert as QaRemediationAgent,
        summary: qaHandoffContext.summary,
        failures: output.failures,
        findings: mergedReturnContext,
      };
      await saveSinxQaReturnHistory(taskId, [...returnHistory, newEntry]);
    }

    const rootCauseFocus = deriveQaRootCauseFocus({
      qaFailures: output.failures,
      findings: mergedReturnContext,
    });

    const expertStageMap: Record<string, { stage: string; fileName: string }> = {
      "Sinx Front Expert":    { stage: "sinx-front-expert",    fileName: STAGE_FILE_NAMES.sinxFrontExpert },
      "Sinx Mobile Expert":   { stage: "sinx-mobile-expert",   fileName: STAGE_FILE_NAMES.sinxMobileExpert },
      "Sinx Back Expert":     { stage: "sinx-back-expert",     fileName: STAGE_FILE_NAMES.sinxBackExpert },
      "Sinx SEO Specialist":  { stage: "sinx-seo-specialist",  fileName: STAGE_FILE_NAMES.sinxSeoSpecialist },
      "Feature Builder":      { stage: "builder",              fileName: STAGE_FILE_NAMES.builder },
      "Bug Fixer":            { stage: "bug-fixer",            fileName: STAGE_FILE_NAMES.bugFixer },
    };

    const findingsView = mergedReturnContext
      .map((f, i) => `${i + 1}. ${f.issue}\n   Expected: ${f.expectedResult}\n   Received: ${f.receivedResult}\n   Action: ${f.recommendedAction}`)
      .join("\n") || "- [none]";

    const view = `# HANDOFF\n\n## Agent\nSinx QA Engineer (Dream Stack 2026)\n\n## Verdict\n${verdict.toUpperCase()}\n\n## Summary\n${qaHandoffContext.summary}\n\n## Failures\n${output.failures.map((f) => `- ${f}`).join("\n") || "- [none]"}\n\n## Findings\n${findingsView}\n\n## Root Cause Focus\n${rootCauseFocus.sourceHints.length ? rootCauseFocus.sourceHints.map((h) => `- ${h}`).join("\n") : "- [none]"}\n\n## Next\n${verdict === "pass" ? "Human Review (PR Writer)" : String(previousExpert)}\n`;

    const effectiveNextAgent: AgentName = verdict === "pass"
      ? "PR Writer"
      : (isExpertAgent(String(previousExpert)) ? (previousExpert as AgentName) : "Human Review");

    const expertInfo = expertStageMap[String(effectiveNextAgent)];

    await this.finishStage({
      taskId,
      stage: "sinx-qa-engineer",
      doneFileName: DONE_FILE_NAMES.sinxQaEngineer,
      viewFileName: "06-sinx-qa-engineer.md",
      viewContent: view,
      output: { ...output, qaHandoffContext },
      ...(verdict === "pass"
        ? { humanApprovalRequired: true }
        : expertInfo
          ? {
              nextAgent: effectiveNextAgent,
              nextStage: expertInfo.stage,
              nextRequestFileName: expertInfo.fileName,
              nextInputRef: `done/${DONE_FILE_NAMES.sinxQaEngineer}`,
            }
          : { humanApprovalRequired: true }),
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
