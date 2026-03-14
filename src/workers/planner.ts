import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile } from "../lib/config.js";
import { createProvider } from "../providers/factory.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import { plannerOutputSchema } from "../lib/schema.js";

export class PlannerWorker extends WorkerBase {
  readonly agent = "Spec Planner" as const;
  readonly requestFileName = STAGE_FILE_NAMES.planner;
  readonly workingFileName = "02-planner.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("spec-planner.md");
    const provider = createProvider(config.providers.planner);

    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "Spec Planner",
      systemPrompt,
      input: request,
      expectedJsonSchemaDescription:
        '{ "technicalContext": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "requiresHumanInput": false, "conditionalPlan": ["string"], "edgeCases": ["string"], "risks": ["string"], "validationCriteria": ["string"], "nextAgent": "Feature Builder" }',
    });

    const output = plannerOutputSchema.parse(result.parsed);

    const view = `# HANDOFF

## Agent
Spec Planner

## Technical Context
${output.technicalContext}

## Known Facts
${output.knownFacts.length ? output.knownFacts.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Unknowns
${output.unknowns.length ? output.unknowns.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Assumptions
${output.assumptions.length ? output.assumptions.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Requires Human Input
${output.requiresHumanInput ? "Yes" : "No"}

## Conditional Plan
${output.conditionalPlan.map((x, index) => `${index + 1}. ${x}`).join("\n")}

## Edge Cases
${output.edgeCases.length ? output.edgeCases.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Risks
${output.risks.length ? output.risks.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Validation Criteria
${output.validationCriteria.length ? output.validationCriteria.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Next
Feature Builder
`;

    await this.finishStage({
      taskId,
      stage: "planner",
      doneFileName: DONE_FILE_NAMES.planner,
      viewFileName: "02-planner.md",
      viewContent: view,
      output,
      nextAgent: "Feature Builder",
      nextStage: "builder",
      nextRequestFileName: STAGE_FILE_NAMES.builder,
      nextInputRef: `done/${DONE_FILE_NAMES.planner}`,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
    });
  }
}
