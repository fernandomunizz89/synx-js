import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { qaOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { getGitChangedFiles, runProjectChecks } from "../lib/workspace-tools.js";
import { WorkerBase } from "./base.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
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

    const skippedChecks = executedChecks.filter((x) => x.status === "skipped");
    if (skippedChecks.length === executedChecks.length) {
      hardFailures.push("No automated checks were executed (check/test/lint scripts not found).");
    }

    const modelInput = {
      ...baseInput,
      validationEvidence: {
        changedFiles,
        executedChecks,
      },
    };

    const strictContract = `
MANDATORY VALIDATION CONTRACT:
- Use "validationEvidence.changedFiles" and "validationEvidence.executedChecks" as primary evidence.
- If any check failed, verdict must be "fail".
- If changedFiles is empty, verdict must be "fail".
- Keep failures specific and actionable.
`;

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${strictContract}`;
    const result = await provider.generateStructured({
      agent: "QA Validator",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "failures": ["string"], "verdict": "pass | fail", "changedFiles": ["string"], "executedChecks": [{ "command": "string", "status": "passed | failed | skipped", "exitCode": 0, "timedOut": false, "durationMs": 0, "stdoutPreview": "string", "stderrPreview": "string" }], "nextAgent": "PR Writer" }',
    });
    const output = qaOutputSchema.parse(result.parsed);
    output.changedFiles = unique([...output.changedFiles, ...changedFiles]);
    output.executedChecks = executedChecks;
    output.failures = unique([...output.failures, ...hardFailures]);
    if (output.failures.length) {
      output.verdict = "fail";
    }

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

## Changed Files (git diff)
${output.changedFiles.length ? output.changedFiles.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Executed Checks
${output.executedChecks.length ? output.executedChecks.map((x) => `- ${x.status.toUpperCase()} | ${x.command} | exit=${x.exitCode ?? "null"} | ${x.durationMs}ms`).join("\n") : "- [none]"}

## Next
PR Writer
`;

    await this.finishStage({
      taskId,
      stage: "qa",
      doneFileName: DONE_FILE_NAMES.qa,
      viewFileName: "06-qa.md",
      viewContent: view,
      output,
      nextAgent: "PR Writer",
      nextStage: "pr",
      nextRequestFileName: STAGE_FILE_NAMES.pr,
      nextInputRef: `done/${DONE_FILE_NAMES.qa}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
