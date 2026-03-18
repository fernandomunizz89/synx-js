// @ts-nocheck -- Legacy worker, not registered in workers/index.ts
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { reviewerOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class ReviewerWorker extends WorkerBase {
  readonly agent = "Reviewer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.reviewer;
  readonly workingFileName = "05-reviewer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("reviewer.md");
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
    const modelInput = await this.buildAgentInput(taskId, request);
    const roleContract = buildAgentRoleContract("Reviewer", {
      stage: "reviewer",
      taskTypeHint: modelInput.task.typeHint,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "Reviewer",
      taskId,
      stage: request.stage,
      taskType: modelInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "whatLooksGood": ["string"], "issuesFound": ["string"], "requiredChanges": ["string"], "verdict": "approved | needs_changes", "nextAgent": "QA Validator" }',
    });
    const output = reviewerOutputSchema.parse(result.parsed);

    const view = `# HANDOFF

## Agent
Reviewer

## What Looks Good
${output.whatLooksGood.length ? output.whatLooksGood.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Issues Found
${output.issuesFound.length ? output.issuesFound.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Required Changes
${output.requiredChanges.length ? output.requiredChanges.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Review Verdict
${output.verdict}

## Next
QA Validator
`;

    await this.finishStage({
      taskId,
      stage: "reviewer",
      doneFileName: DONE_FILE_NAMES.reviewer,
      viewFileName: "05-review.md",
      viewContent: view,
      output,
      nextAgent: "QA Validator",
      nextStage: "qa",
      nextRequestFileName: STAGE_FILE_NAMES.qa,
      nextInputRef: `done/${DONE_FILE_NAMES.reviewer}`,
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
