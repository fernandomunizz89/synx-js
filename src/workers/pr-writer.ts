import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
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
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "PR Writer",
      systemPrompt,
      input: request,
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
    });

    await finalizeForHumanReview(taskId);
  }
}
