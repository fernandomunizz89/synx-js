import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { collectProjectProfile, projectProfileFactLines, type ProjectProfile } from "../lib/project-handoff.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../lib/task-artifacts.js";
import { createProvider } from "../providers/factory.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import { plannerOutputSchema } from "../lib/schema.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

export class PlannerWorker extends WorkerBase {
  readonly agent = "Spec Planner" as const;
  readonly requestFileName = STAGE_FILE_NAMES.planner;
  readonly workingFileName = "02-planner.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("spec-planner.md");
    const provider = createProvider(config.providers.planner);
    const baseInput = await this.buildAgentInput(taskId, request);
    let projectProfile = await loadTaskArtifact<ProjectProfile>(taskId, ARTIFACT_FILES.projectProfile);
    if (!projectProfile) {
      projectProfile = await collectProjectProfile({
        workspaceRoot: process.cwd(),
        taskTitle: baseInput.task.title,
        taskType: baseInput.task.typeHint,
        config,
      });
    }
    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectProfile, projectProfile);
    const modelInput = {
      ...baseInput,
      projectProfile,
    };

    const roleContract = buildAgentRoleContract("Spec Planner", {
      stage: "planner",
      taskTypeHint: baseInput.task.typeHint,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "Spec Planner",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "technicalContext": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "requiresHumanInput": false, "conditionalPlan": ["string"], "edgeCases": ["string"], "risks": ["string"], "validationCriteria": ["string"], "nextAgent": "Feature Builder" }',
    });

    const output = plannerOutputSchema.parse(result.parsed);
    output.knownFacts = unique([...output.knownFacts, ...projectProfileFactLines(projectProfile)]);
    await saveTaskArtifact(taskId, ARTIFACT_FILES.featureBrief, {
      generatedAt: nowIso(),
      technicalContext: output.technicalContext,
      knownFacts: output.knownFacts,
      validationCriteria: output.validationCriteria,
      risks: output.risks,
      projectProfile,
    });

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

## Project Profile Snapshot
${projectProfileFactLines(projectProfile).map((x) => `- ${x}`).join("\n")}

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
      providerAttempts: result.providerAttempts,
      providerBackoffRetries: result.providerBackoffRetries,
      providerBackoffWaitMs: result.providerBackoffWaitMs,
      providerRateLimitWaitMs: result.providerRateLimitWaitMs,
    });
  }
}
