import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { bugInvestigatorOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class BugInvestigatorWorker extends WorkerBase {
  readonly agent = "Bug Investigator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.bugInvestigator;
  readonly workingFileName = "02b-bug-investigator.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("bug-investigator.md");
    const provider = createProvider(config.providers.planner);
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "Bug Investigator",
      systemPrompt,
      input: request,
      expectedJsonSchemaDescription:
        '{ "symptomSummary": "string", "knownFacts": ["string"], "likelyCauses": ["string"], "investigationSteps": ["string"], "unknowns": ["string"], "nextAgent": "Feature Builder" }',
    });
    const output = bugInvestigatorOutputSchema.parse(result.parsed);

    const view = `# HANDOFF

## Agent
Bug Investigator

## Symptom Summary
${output.symptomSummary}

## Known Facts
${output.knownFacts.length ? output.knownFacts.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Likely Causes
${output.likelyCauses.length ? output.likelyCauses.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Investigation Steps
${output.investigationSteps.length ? output.investigationSteps.map((x, index) => `${index + 1}. ${x}`).join("\n") : "- [none]"}

## Unknowns
${output.unknowns.length ? output.unknowns.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Next
Feature Builder
`;

    await this.finishStage({
      taskId,
      stage: "bug-investigator",
      doneFileName: DONE_FILE_NAMES.bugInvestigator,
      viewFileName: "02b-bug-investigator.md",
      viewContent: view,
      output,
      nextAgent: "Feature Builder",
      nextStage: "builder",
      nextRequestFileName: STAGE_FILE_NAMES.builder,
      nextInputRef: `done/${DONE_FILE_NAMES.bugInvestigator}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
