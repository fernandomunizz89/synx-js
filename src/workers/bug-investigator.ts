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
    const modelInput = await this.buildAgentInput(taskId, request);
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2));
    const result = await provider.generateStructured({
      agent: "Bug Investigator",
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "symptomSummary": "string", "knownFacts": ["string"], "likelyCauses": ["string"], "investigationSteps": ["string"], "unknowns": ["string"], "nextAgent": "Bug Fixer" }',
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
Bug Fixer
`;

    await this.finishStage({
      taskId,
      stage: "bug-investigator",
      doneFileName: DONE_FILE_NAMES.bugInvestigator,
      viewFileName: "02b-bug-investigator.md",
      viewContent: view,
      output,
      nextAgent: "Bug Fixer",
      nextStage: "bug-fixer",
      nextRequestFileName: STAGE_FILE_NAMES.bugFixer,
      nextInputRef: `done/${DONE_FILE_NAMES.bugInvestigator}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
