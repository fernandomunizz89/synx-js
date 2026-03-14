import path from "node:path";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { exists, readJson } from "../lib/fs.js";
import { taskDir } from "../lib/paths.js";
import { qaOutputSchema } from "../lib/schema.js";
import type { AgentName, StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { detectTestCapabilities, getGitChangedFiles, runProjectChecks } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
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
    const workspaceRoot = process.cwd();
    const testCapabilities = await detectTestCapabilities(workspaceRoot);
    const reportedUnitTests = await loadReportedUnitTests(taskId);
    const changedFiles = await getGitChangedFiles(workspaceRoot);
    const executedChecks = await runProjectChecks({ workspaceRoot, timeoutMsPerCheck: 150_000 });

    const hardFailures: string[] = [];
    if (!changedFiles.length) {
      hardFailures.push("No code changes detected in git diff.");
    }

    const failedChecks = executedChecks.filter((x) => x.status === "failed");
    for (const check of failedChecks) {
      hardFailures.push(`Check failed: ${check.command} (exit ${check.exitCode ?? "unknown"})`);
    }

    const requiresE2E = ["Feature", "Bug", "Refactor", "Mixed"].includes(baseInput.task.typeHint);
    const requiresUnitTests = requiresE2E;
    const e2eChecks = executedChecks.filter((x) => /\be2e\b|playwright|cypress/i.test(x.command));
    if (requiresE2E && !e2eChecks.length) {
      hardFailures.push("No E2E check was executed. Add an e2e script and a main-flow E2E test.");
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
      validationEvidence: {
        changedFiles,
        executedChecks,
        reportedUnitTests,
      },
    };

    const strictContract = `
MANDATORY VALIDATION CONTRACT:
- Use "validationEvidence.changedFiles" and "validationEvidence.executedChecks" as primary evidence.
- Use "validationEvidence.reportedUnitTests" as additional evidence from implementation stages.
- If any check failed, verdict must be "fail".
- If changedFiles is empty, verdict must be "fail".
- If task type is Feature/Bug/Refactor/Mixed and no E2E check was executed, verdict must be "fail".
- If verdict is "fail", set "nextAgent" to "${remediationAgent}".
- If verdict is "pass", set "nextAgent" to "PR Writer".
- Keep failures specific and actionable.
`;

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "QA Validator",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "failures": ["string"], "verdict": "pass | fail", "e2ePlan": ["string"], "changedFiles": ["string"], "executedChecks": [{ "command": "string", "status": "passed | failed | skipped", "exitCode": 0, "timedOut": false, "durationMs": 0, "stdoutPreview": "string", "stderrPreview": "string" }], "nextAgent": "PR Writer | Feature Builder | Bug Fixer" }',
    });
    const output = qaOutputSchema.parse(result.parsed);
    output.changedFiles = unique([...output.changedFiles, ...changedFiles]);
    output.executedChecks = executedChecks;
    output.failures = unique([...output.failures, ...hardFailures]);
    if (output.failures.length) {
      output.verdict = "fail";
    }

    output.nextAgent = output.verdict === "pass" ? "PR Writer" : remediationAgent;
    const nextStage = output.nextAgent === "PR Writer" ? "pr" : output.nextAgent === "Bug Fixer" ? "bug-fixer" : "builder";
    const nextRequestFileName = output.nextAgent === "PR Writer"
      ? STAGE_FILE_NAMES.pr
      : output.nextAgent === "Bug Fixer"
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

## Failures
${output.failures.length ? output.failures.map((x) => `- ${x}`).join("\n") : "- [none]"}

## QA Verdict
${output.verdict}

## E2E Plan
${output.e2ePlan.length ? output.e2ePlan.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changed Files (git diff)
${output.changedFiles.length ? output.changedFiles.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Unit Tests Reported By Implementation
${reportedUnitTests.length ? reportedUnitTests.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Executed Checks
${output.executedChecks.length ? output.executedChecks.map((x) => `- ${x.status.toUpperCase()} | ${x.command} | exit=${x.exitCode ?? "null"} | ${x.durationMs}ms`).join("\n") : "- [none]"}

## Next
${output.nextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "qa",
      doneFileName: DONE_FILE_NAMES.qa,
      viewFileName: "06-qa.md",
      viewContent: view,
      output,
      nextAgent: output.nextAgent,
      nextStage,
      nextRequestFileName,
      nextInputRef,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
