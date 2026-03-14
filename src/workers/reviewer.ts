import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
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
    const provider = createProvider(config.providers.planner);
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "Reviewer",
      systemPrompt,
      input: request,
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
    });
  }
}
