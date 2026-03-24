import { z } from "zod";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";
import type { StageEnvelope } from "../../lib/types.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../../lib/config.js";
import { createProvider } from "../../providers/factory.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../../lib/task-artifacts.js";
import { buildLearningsPromptSection, inferCapabilityTagsForAgent, loadRecentLearnings, recordLearning } from "../../lib/learnings.js";
import { logDaemon, logTaskEvent } from "../../lib/logging.js";
import { taskDir } from "../../lib/paths.js";

const AGENT = "Synx UX Flow Designer" as const;

const userJourneySchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  entryPoint: z.string().min(1),
  exitPoint: z.string().min(1),
});

const outputSchema = z.object({
  userJourneys: z.array(userJourneySchema).default([]),
  screenList: z.array(z.string().min(1)).default([]),
  interactionNotes: z.array(z.string().min(1)).default([]),
  accessibilityFlags: z.array(z.string().min(1)).default([]),
});

function buildSystemPrompt(
  title: string,
  rawRequest: string,
  productBrief: unknown,
  requirementsPrd: unknown,
  learningsSection: string,
): string {
  const briefSection = productBrief
    ? `\nProduct brief:\n${JSON.stringify(productBrief, null, 2)}\n`
    : "";
  const requirementsSection = requirementsPrd
    ? `\nRequirements:\n${JSON.stringify(requirementsPrd, null, 2)}\n`
    : "";
  return `You are the UX Flow Designer for the SYNX pre-build planning squad.

You receive the product brief and requirements and design the user experience flow.

Responsibilities:
- Map out user journeys — how users move through the feature from entry to exit
- List every screen or view the implementation will need
- Note key interaction patterns (forms, confirmations, error states, loading states)
- Flag accessibility requirements (WCAG, keyboard navigation, ARIA)

Rules:
- User journeys must cover both the happy path and at least one error path
- Screen names should match what developers will call components (e.g., "LoginPage", "DashboardShell")
- If the request is API-only or backend-only, return empty arrays for userJourneys and screenList
- Accessibility flags should be concrete obligations, not generic statements

Request:
Title: ${title}
Description: ${rawRequest}
${briefSection}${requirementsSection}
${learningsSection ? `Recent learning feedback:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "userJourneys": [
    {
      "name": "string",
      "steps": ["string"],
      "entryPoint": "string",
      "exitPoint": "string"
    }
  ],
  "screenList": ["string"],
  "interactionNotes": ["string"],
  "accessibilityFlags": ["string"]
}`;
}

export class SynxUxFlowDesigner extends WorkerBase {
  readonly agent = AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.synxUxFlowDesigner;
  readonly workingFileName = "03-synx-ux-flow-designer.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, AGENT));
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Synx UX Flow Designer: designing user flows for "${input.title}"...`);
    await logDaemon(`SynxUxFlowDesigner: started for ${taskId}`);

    const [productBrief, requirementsPrd] = await Promise.all([
      loadTaskArtifact(taskId, ARTIFACT_FILES.projectBrief),
      loadTaskArtifact(taskId, ARTIFACT_FILES.requirementsPrd),
    ]);
    const recentLearnings = await loadRecentLearnings(AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildSystemPrompt(input.title, input.rawRequest, productBrief, requirementsPrd, learningsSection),
      input,
      expectedJsonSchemaDescription:
        '{ "userJourneys": [{ "name": "string", "steps": ["string"], "entryPoint": "string", "exitPoint": "string" }], "screenList": ["string"], "interactionNotes": ["string"], "accessibilityFlags": ["string"] }',
    });

    const output = outputSchema.parse(result.parsed);

    await saveTaskArtifact(taskId, ARTIFACT_FILES.uxFlowSpec, {
      projectTaskId: taskId,
      createdAt: nowIso(),
      ...output,
    });

    const view = [
      "# HANDOFF",
      "",
      "## Agent",
      "Synx UX Flow Designer",
      "",
      output.userJourneys.length
        ? [
          "## User Journeys",
          ...output.userJourneys.map((j) => `### ${j.name}\n- Entry: ${j.entryPoint}\n- Steps: ${j.steps.join(" → ")}\n- Exit: ${j.exitPoint}`),
          "",
        ].join("\n")
        : "## User Journeys\n(none — API/backend task)\n",
      output.screenList.length
        ? `## Screens\n${output.screenList.map((s) => `- ${s}`).join("\n")}\n`
        : "",
      output.accessibilityFlags.length
        ? `## Accessibility\n${output.accessibilityFlags.map((f) => `- ${f}`).join("\n")}\n`
        : "",
      "## Next",
      "Synx Solution Architect",
    ].join("\n");

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.synxUxFlowDesigner,
      viewFileName: "03-synx-ux-flow-designer.view.md",
      viewContent: view,
      output,
      nextAgent: "Synx Solution Architect",
      nextStage: "synx-solution-architect",
      nextRequestFileName: STAGE_FILE_NAMES.synxSolutionArchitect,
      nextInputRef: `done/${DONE_FILE_NAMES.synxUxFlowDesigner}`,
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

    await recordLearning({
      timestamp: nowIso(),
      taskId,
      agentId: AGENT,
      summary: `UX spec complete: ${output.userJourneys.length} journey(s), ${output.screenList.length} screen(s).`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(taskDir(taskId), "Synx UX Flow Designer: UX spec complete.");
  }
}
