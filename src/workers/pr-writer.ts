import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { prWriterOutputSchema } from "../lib/schema.js";
import { finalizeForHumanReview } from "../lib/task.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class PrWriterWorker extends WorkerBase {
  readonly agent = "PR Writer" as const;
  readonly requestFileName = STAGE_FILE_NAMES.pr;
  readonly workingFileName = "07-pr.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("pr-writer.md");
    const provider = createProvider(config.providers.planner);
    const modelInput = await this.buildAgentInput(taskId, request);
    const roleContract = buildAgentRoleContract("PR Writer", {
      stage: "pr",
      taskTypeHint: modelInput.task.typeHint,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "PR Writer",
      taskId,
      stage: request.stage,
      taskType: modelInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "summary": "string", "whatWasDone": ["string"], "testPlan": ["string"], "rolloutNotes": ["string"], "nextAgent": "Human Review" }',
    });
    const output = prWriterOutputSchema.parse(result.parsed);

    const view = `# HANDOFF

## Agent
PR Writer

## Summary
${output.summary}

## What was done
${output.whatWasDone.length ? output.whatWasDone.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Test Plan
${output.testPlan.length ? output.testPlan.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Rollout Notes
${output.rolloutNotes.length ? output.rolloutNotes.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Next
Human Review
`;

    await this.finishStage({
      taskId,
      stage: "pr",
      doneFileName: DONE_FILE_NAMES.pr,
      viewFileName: "07-pr.md",
      viewContent: view,
      output,
      humanApprovalRequired: true,
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

    await finalizeForHumanReview(taskId);
  }
}
