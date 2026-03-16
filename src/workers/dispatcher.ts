import path from "node:path";
import { readJson } from "../lib/fs.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile } from "../lib/config.js";
import { taskDir } from "../lib/paths.js";
import { collectProjectProfile, projectProfileFactLines } from "../lib/project-handoff.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../lib/task-artifacts.js";
import { createProvider } from "../providers/factory.js";
import type { NewTaskInput, StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { unique } from "../lib/text-utils.js";
import { WorkerBase } from "./base.js";
import { dispatcherOutputSchema } from "../lib/schema.js";

export class DispatcherWorker extends WorkerBase {
  readonly agent = "Dispatcher" as const;
  readonly requestFileName = STAGE_FILE_NAMES.dispatcher;
  readonly workingFileName = "00-dispatcher.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const prompt = await loadPromptFile("dispatcher.md");
    const provider = createProvider(config.providers.dispatcher);
    const input = await readJson<NewTaskInput>(path.join(taskDir(taskId), "input", "new-task.json"));
    const projectProfile = await collectProjectProfile({
      workspaceRoot: process.cwd(),
      taskTitle: input.title,
      taskType: input.typeHint,
      config,
    });
    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectProfile, projectProfile);

    const modelInput = {
      ...input,
      projectProfile,
    };
    const roleContract = buildAgentRoleContract("Dispatcher", {
      stage: "dispatcher",
      taskTypeHint: input.typeHint,
    });
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "Dispatcher",
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "type": "...", "goal": "string", "context": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "constraints": ["string"], "confidenceScore": 0.0, "requiresHumanInput": false, "nextAgent": "Bug Investigator | Spec Planner | Sinx Front Expert | Sinx Mobile Expert | Sinx Back Expert | Sinx SEO Specialist", "targetExpert": "Sinx Front Expert | Sinx Mobile Expert | Sinx Back Expert | Sinx SEO Specialist | Feature Builder (only when nextAgent is Spec Planner, identifies the expert to use after planning)" }',
    });

    const output = dispatcherOutputSchema.parse(result.parsed);
    output.knownFacts = unique([...output.knownFacts, ...projectProfileFactLines(projectProfile)]);
    const nextAgent = output.nextAgent;

    // Dream Stack 2026 routing
    const stageMap: Record<string, { stage: string; fileName: string }> = {
      "Bug Investigator":  { stage: "bug-investigator",  fileName: STAGE_FILE_NAMES.bugInvestigator },
      "Spec Planner":      { stage: "planner",           fileName: STAGE_FILE_NAMES.planner },
      "Sinx Front Expert": { stage: "sinx-front-expert",  fileName: STAGE_FILE_NAMES.sinxFrontExpert },
      "Sinx Mobile Expert":{ stage: "sinx-mobile-expert", fileName: STAGE_FILE_NAMES.sinxMobileExpert },
      "Sinx Back Expert":  { stage: "sinx-back-expert",   fileName: STAGE_FILE_NAMES.sinxBackExpert },
      "Sinx QA Engineer":  { stage: "sinx-qa-engineer",   fileName: STAGE_FILE_NAMES.sinxQaEngineer },
      "Sinx SEO Specialist": { stage: "sinx-seo-specialist", fileName: STAGE_FILE_NAMES.sinxSeoSpecialist },
    };
    const routing = stageMap[nextAgent] ?? { stage: "planner", fileName: STAGE_FILE_NAMES.planner };
    const nextStage = routing.stage;
    const nextFileName = routing.fileName;

    const view = `# HANDOFF

## Agent
Dispatcher

## Type
${output.type}

## Goal
${output.goal}

## Context
${output.context}

## Known Facts
${output.knownFacts.length ? output.knownFacts.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Unknowns
${output.unknowns.length ? output.unknowns.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Assumptions
${output.assumptions.length ? output.assumptions.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Constraints
${output.constraints.length ? output.constraints.map((x) => `- ${x}`).join("\n") : "- [none]"}

## Confidence Score
${typeof output.confidenceScore === "number" ? output.confidenceScore.toFixed(2) : "[not provided]"}

## Project Profile Snapshot
${projectProfileFactLines(projectProfile).map((x) => `- ${x}`).join("\n")}

## Requires Human Input
${output.requiresHumanInput ? "Yes" : "No"}

## Next
${nextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "dispatcher",
      doneFileName: DONE_FILE_NAMES.dispatcher,
      viewFileName: "01-dispatcher.md",
      viewContent: view,
      output,
      nextAgent,
      nextStage,
      nextRequestFileName: nextFileName,
      nextInputRef: `done/${DONE_FILE_NAMES.dispatcher}`,
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
