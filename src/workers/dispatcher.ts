import path from "node:path";
import { readJson } from "../lib/fs.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../lib/config.js";
import { taskDir } from "../lib/paths.js";
import { collectProjectProfile, projectProfileFactLines } from "../lib/project-handoff.js";
import { loadProjectMemory, projectMemoryFactLines, formatProjectMemoryForContext } from "../lib/project-memory.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../lib/task-artifacts.js";
import { routeByCapabilities } from "../lib/capability-routing.js";
import { createProvider } from "../providers/factory.js";
import type { NewTaskInput, StageEnvelope } from "../lib/types.js";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";
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
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
    const input = await readJson<NewTaskInput>(path.join(taskDir(taskId), "input", "new-task.json"));
    const [projectProfile, projectMemory] = await Promise.all([
      collectProjectProfile({
        workspaceRoot: process.cwd(),
        taskTitle: input.title,
        taskType: input.typeHint,
        config,
      }),
      loadProjectMemory(),
    ]);
    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectProfile, projectProfile);

    const modelInput = {
      ...input,
      projectProfile,
      ...(projectMemory ? { projectMemory } : {}),
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
        '{ "type": "...", "goal": "string", "context": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "constraints": ["string"], "confidenceScore": 0.0, "requiresHumanInput": false, "securityAuditRequired": false, "suggestedChain": ["Synx Back Expert", "Synx Code Reviewer", "Synx QA Engineer"], "nextAgent": "best-fit specialist agent name (built-in or registered custom agent)" }',
    });

    const output = dispatcherOutputSchema.parse(result.parsed);
    // Merge known facts from project profile and project memory (deduped)
    const memoryFacts = projectMemory ? projectMemoryFactLines(projectMemory) : [];
    output.knownFacts = unique([...output.knownFacts, ...projectProfileFactLines(projectProfile), ...memoryFacts]);
    const routingDecision = await routeByCapabilities({
      task: input,
      projectProfile,
      modelSuggestedAgent: output.nextAgent,
    });
    const nextAgent = routingDecision.selected.agentName;
    const nextStage = routingDecision.selected.stage;
    const nextFileName = routingDecision.selected.requestFileName;

    await saveTaskArtifact(taskId, ARTIFACT_FILES.dispatcherRouting, {
      selected: routingDecision.selected,
      topCandidates: routingDecision.candidates.slice(0, 5),
      modelSuggestedAgent: output.nextAgent,
      routedAt: nowIso(),
    });

    // Phase 4.3 — persist suggested chain to TaskMeta so all agents can reference it
    if (output.suggestedChain && output.suggestedChain.length > 0) {
      const meta = await loadTaskMeta(taskId);
      meta.suggestedChain = output.suggestedChain;
      await saveTaskMeta(taskId, meta);
    }

    const memorySection = projectMemory ? formatProjectMemoryForContext(projectMemory) : "";
    const chainSection = output.suggestedChain && output.suggestedChain.length > 0
      ? `## Suggested Agent Chain\n${output.suggestedChain.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
      : "";
    const routingSection = `## Capability Routing
- Model suggested: ${output.nextAgent}
- Selected: ${nextAgent} (${routingDecision.selected.source})
- Top candidates:
${routingDecision.candidates.slice(0, 3).map((candidate, index) => {
  const total = candidate.score.total.toFixed(3);
  const capability = candidate.score.capabilityMatch.toFixed(2);
  const stack = candidate.score.projectStackMatch.toFixed(2);
  const taskType = candidate.score.taskTypeMatch.toFixed(2);
  const quality = candidate.score.approvalRate.toFixed(2);
  const capQuality = candidate.score.capabilityApprovalRate.toFixed(2);
  const failure = candidate.score.recentFailurePattern.toFixed(2);
  return `  ${index + 1}. ${candidate.agentName} — total=${total} (cap=${capability}, stack=${stack}, type=${taskType}, approval=${quality}, capApproval=${capQuality}, failure=${failure})`;
}).join("\n")}`;

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
${memorySection ? `\n${memorySection}\n` : ""}
${chainSection ? `\n${chainSection}\n` : ""}
${routingSection}

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
