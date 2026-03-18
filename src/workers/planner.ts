import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, loadPromptFile, resolveProviderConfigForAgent } from "../lib/config.js";
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { formatResearchContextTag, requestResearchContext } from "../lib/orchestrator.js";
import { collectProjectProfile, projectProfileFactLines, type ProjectProfile } from "../lib/project-handoff.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../lib/task-artifacts.js";
import { createProvider } from "../providers/factory.js";
import type { StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { unique } from "../lib/text-utils.js";
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
    const provider = createProvider(resolveProviderConfigForAgent(config, this.agent));
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
    const dispatcherOutput = (
      baseInput.previousStage
      && typeof baseInput.previousStage === "object"
      && "output" in baseInput.previousStage
      && baseInput.previousStage.output
      && typeof baseInput.previousStage.output === "object"
    )
      ? baseInput.previousStage.output as { unknowns?: unknown; targetExpert?: unknown }
      : null;
    const dispatcherUnknowns = Array.isArray(dispatcherOutput?.unknowns)
      ? dispatcherOutput.unknowns.filter((item): item is string => typeof item === "string")
      : [];
    // Conditional Planning – read the targetExpert hint from the Dispatcher
    const targetExpert =
      typeof dispatcherOutput?.targetExpert === "string" && dispatcherOutput.targetExpert
        ? dispatcherOutput.targetExpert
        : "Synx Front Expert";
    const researchDecision = await requestResearchContext({
      taskId,
      stage: "planner",
      requesterAgent: this.agent,
      taskType: baseInput.task.typeHint,
      previousStage: baseInput.previousStage,
      errorContext: [
        baseInput.task.rawRequest,
        ...dispatcherUnknowns.slice(0, 4),
      ].join(" | "),
      targetTechnology: `${config.language || "unknown"} ${config.framework || ""}`.trim(),
      specificQuestion: `What is the safest technical plan to implement: ${baseInput.task.title}?`,
      repeatedIssues: [],
    });

    if (researchDecision.status === "abort_to_human") {
      const escalationOutput = {
        decision: "research_loop_detected",
        reason: researchDecision.abortReason || "Research anti-loop guard triggered.",
        triggerReasons: researchDecision.triggerReasons,
        researchContext: researchDecision.context,
      };
      const escalationView = `# HANDOFF

## Agent
Spec Planner

## Decision
Escalated to human review before planning because Researcher loop guard was triggered.

## Reason
${researchDecision.abortReason || "Research recommendation repeated while uncertainty persisted."}

## Trigger Reasons
${researchDecision.triggerReasons.length ? researchDecision.triggerReasons.map((item) => `- ${item}`).join("\n") : "- [none]"}

## Research Context
${researchDecision.context ? formatResearchContextTag(researchDecision.context).split("\n").map((line) => `- ${line}`).join("\n") : "- [none]"}

## Next
Human Review
`;

      await this.finishStage({
        taskId,
        stage: "planner",
        doneFileName: DONE_FILE_NAMES.planner,
        viewFileName: "02-planner.md",
        viewContent: escalationView,
        output: escalationOutput,
        humanApprovalRequired: true,
        startedAt,
      });
      return;
    }

    const researchContextTag = researchDecision.context
      ? `[RESEARCH_CONTEXT]:\n${formatResearchContextTag(researchDecision.context)}`
      : "";
    const modelInput = {
      ...baseInput,
      projectProfile,
      researchContext: researchDecision.context,
    };

    const roleContract = buildAgentRoleContract("Spec Planner", {
      stage: "planner",
      taskTypeHint: baseInput.task.typeHint,
    });
    const targetExpertHint = `\n\n[PLANNING DIRECTIVE]: After decomposing this task, route to "${targetExpert}" (identified by the Dispatcher as the domain expert for this task). Set nextAgent to "${targetExpert}"."`;  
    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}${researchContextTag ? `\n\n${researchContextTag}` : ""}${targetExpertHint}`;
    const result = await provider.generateStructured({
      agent: "Spec Planner",
      taskId,
      stage: request.stage,
      taskType: baseInput.task.typeHint,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        `{ "technicalContext": "string", "knownFacts": ["string"], "unknowns": ["string"], "assumptions": ["string"], "confidenceScore": 0.0, "requiresHumanInput": false, "conditionalPlan": ["string"], "edgeCases": ["string"], "risks": ["string"], "validationCriteria": ["string"], "nextAgent": "${targetExpert}" }`,
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

    // Dream Stack 2026 – resolve target expert routing
    const expertStageMap: Record<string, { stage: string; fileName: string }> = {
      "Synx Front Expert":   { stage: "synx-front-expert",   fileName: STAGE_FILE_NAMES.synxFrontExpert },
      "Synx Mobile Expert":  { stage: "synx-mobile-expert",  fileName: STAGE_FILE_NAMES.synxMobileExpert },
      "Synx Back Expert":    { stage: "synx-back-expert",    fileName: STAGE_FILE_NAMES.synxBackExpert },
      "Synx SEO Specialist": { stage: "synx-seo-specialist", fileName: STAGE_FILE_NAMES.synxSeoSpecialist },
    };
    const resolvedNext = expertStageMap[output.nextAgent] ?? expertStageMap["Synx Front Expert"];
     
    const resolvedNextAgent = output.nextAgent as any;

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

## Confidence Score
${typeof output.confidenceScore === "number" ? output.confidenceScore.toFixed(2) : "[not provided]"}

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

## Research Context
${researchDecision.context
    ? `- Trigger reasons: ${researchDecision.triggerReasons.join(", ") || "[none]"}
- Reused context: ${researchDecision.reusedContext ? "yes" : "no"}
- Summary: ${researchDecision.context.summary}
- Recommended action: ${researchDecision.context.recommendedAction}
- Confidence: ${researchDecision.context.confidenceScore.toFixed(2)}
${researchDecision.context.sources.length ? researchDecision.context.sources.slice(0, 4).map((item) => `- Source: ${item.title} (${item.url})`).join("\n") : "- Source: [none]"}` : "- [none]"}

## Next
${resolvedNextAgent}
`;

    await this.finishStage({
      taskId,
      stage: "planner",
      doneFileName: DONE_FILE_NAMES.planner,
      viewFileName: "02-planner.md",
      viewContent: view,
      output,
      nextAgent: resolvedNextAgent,
      nextStage: resolvedNext.stage,
      nextRequestFileName: resolvedNext.fileName,
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
      estimatedInputTokens: result.estimatedInputTokens,
      estimatedOutputTokens: result.estimatedOutputTokens,
      estimatedTotalTokens: result.estimatedTotalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    });
  }
}
