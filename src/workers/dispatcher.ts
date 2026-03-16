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
import { WorkerBase } from "./base.js";
import { dispatcherOutputSchema } from "../lib/schema.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

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
        '{ "type": "...", "goal": "string", "context": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "constraints": ["string"], "requiresHumanInput": false, "nextAgent": "Bug Investigator | Spec Planner" }',
    });

    const output = dispatcherOutputSchema.parse(result.parsed);
    output.knownFacts = unique([...output.knownFacts, ...projectProfileFactLines(projectProfile)]);
    const nextAgent = output.nextAgent;
    const nextStage = nextAgent === "Bug Investigator" ? "bug-investigator" : "planner";
    const nextFileName = nextAgent === "Bug Investigator" ? STAGE_FILE_NAMES.bugInvestigator : STAGE_FILE_NAMES.planner;

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
