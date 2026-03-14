import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { builderOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class BuilderWorker extends WorkerBase {
  readonly agent = "Feature Builder" as const;
  readonly requestFileName = STAGE_FILE_NAMES.builder;
  readonly workingFileName = "04-builder.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("feature-builder.md");
    const provider = createProvider(config.providers.planner);
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "Feature Builder",
      systemPrompt,
      input: request,
      expectedJsonSchemaDescription:
        '{ "implementationSummary": "string", "filesChanged": ["string"], "changesMade": ["string"], "testsToRun": ["string"], "risks": ["string"], "nextAgent": "Reviewer" }',
    });
    const output = builderOutputSchema.parse(result.parsed);

    const view = `# HANDOFF

## Agent
Feature Builder

## Implementation Summary
${output.implementationSummary}

## Files Changed
${output.filesChanged.length ? output.filesChanged.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Changes Made
${output.changesMade.length ? output.changesMade.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Tests To Run
${output.testsToRun.length ? output.testsToRun.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Risks
${output.risks.length ? output.risks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Next
Reviewer
`;

    await this.finishStage({
      taskId,
      stage: "builder",
      doneFileName: DONE_FILE_NAMES.builder,
      viewFileName: "04-implementation.md",
      viewContent: view,
      output,
      nextAgent: "Reviewer",
      nextStage: "reviewer",
      nextRequestFileName: STAGE_FILE_NAMES.reviewer,
      nextInputRef: `done/${DONE_FILE_NAMES.builder}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
