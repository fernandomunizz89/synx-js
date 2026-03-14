import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { qaOutputSchema } from "../lib/schema.js";
import type { StageEnvelope } from "../lib/types.js";
import { createProvider } from "../providers/factory.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";

export class QaWorker extends WorkerBase {
  readonly agent = "QA Validator" as const;
  readonly requestFileName = STAGE_FILE_NAMES.qa;
  readonly workingFileName = "06-qa.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("qa-validator.md");
    const provider = createProvider(config.providers.planner);
    const systemPrompt = prompt.replace("{{INPUT_JSON}}", JSON.stringify(request, null, 2));
    const result = await provider.generateStructured({
      agent: "QA Validator",
      systemPrompt,
      input: request,
      expectedJsonSchemaDescription:
        '{ "mainScenarios": ["string"], "acceptanceChecklist": ["string"], "failures": ["string"], "verdict": "pass | fail", "nextAgent": "PR Writer" }',
    });
    const output = qaOutputSchema.parse(result.parsed);

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
