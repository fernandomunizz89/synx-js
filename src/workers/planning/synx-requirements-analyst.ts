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

const AGENT = "Synx Requirements Analyst" as const;

const outputSchema = z.object({
  functionalRequirements: z.array(z.string().min(1)).min(1),
  nonFunctionalRequirements: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  edgeCases: z.array(z.string().min(1)).default([]),
  dataEntities: z.array(z.string().min(1)).default([]),
  openQuestions: z.array(z.string().min(1)).default([]),
});

function buildSystemPrompt(
  title: string,
  rawRequest: string,
  productBrief: unknown,
  learningsSection: string,
): string {
  const briefSection = productBrief
    ? `\nProduct brief from Product Strategist:\n${JSON.stringify(productBrief, null, 2)}\n`
    : "";
  return `You are the Requirements Analyst / PRD Writer for the SYNX pre-build planning squad.

You receive the product brief from the Product Strategist and expand it into formal requirements.

Responsibilities:
- Define functional requirements (what the system must do)
- Define non-functional requirements (performance, security, reliability)
- Write testable acceptance criteria — each must be verifiable by QA
- Identify edge cases and error conditions
- Name the key data entities (domain models, tables, API resources)
- Surface any open questions that remain unanswered

Rules:
- Acceptance criteria must be concrete and testable, not vague
- Functional requirements must be specific enough to implement without clarification
- Edge cases should be real failure modes, not hypothetical extremes
- Data entities should use the project's domain vocabulary

Request:
Title: ${title}
Description: ${rawRequest}
${briefSection}
${learningsSection ? `Recent learning feedback:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "functionalRequirements": ["string — at least 1"],
  "nonFunctionalRequirements": ["string"],
  "acceptanceCriteria": ["string — at least 1, testable"],
  "edgeCases": ["string"],
  "dataEntities": ["string"],
  "openQuestions": ["string"]
}`;
}

export class SynxRequirementsAnalyst extends WorkerBase {
  readonly agent = AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.synxRequirementsAnalyst;
  readonly workingFileName = "02-synx-requirements-analyst.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, AGENT));
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Synx Requirements Analyst: writing requirements for "${input.title}"...`);
    await logDaemon(`SynxRequirementsAnalyst: started for ${taskId}`);

    const productBrief = await loadTaskArtifact(taskId, ARTIFACT_FILES.projectBrief);
    const recentLearnings = await loadRecentLearnings(AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildSystemPrompt(input.title, input.rawRequest, productBrief, learningsSection),
      input,
      expectedJsonSchemaDescription:
        '{ "functionalRequirements": ["string"], "nonFunctionalRequirements": ["string"], "acceptanceCriteria": ["string"], "edgeCases": ["string"], "dataEntities": ["string"], "openQuestions": ["string"] }',
    });

    const output = outputSchema.parse(result.parsed);

    await Promise.all([
      // Rich format for downstream planning workers
      saveTaskArtifact(taskId, ARTIFACT_FILES.requirementsPrd, {
        projectTaskId: taskId,
        createdAt: nowIso(),
        ...output,
      }),
      // Canonical format consumed by the decomposer and UI
      saveTaskArtifact(taskId, ARTIFACT_FILES.acceptanceCriteria, {
        projectTaskId: taskId,
        createdAt: nowIso(),
        acceptanceCriteria: output.acceptanceCriteria,
      }),
    ]);

    const view = [
      "# HANDOFF",
      "",
      "## Agent",
      "Synx Requirements Analyst",
      "",
      "## Functional Requirements",
      ...output.functionalRequirements.map((r) => `- ${r}`),
      "",
      "## Acceptance Criteria",
      ...output.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
      "",
      output.edgeCases.length ? `## Edge Cases\n${output.edgeCases.map((e) => `- ${e}`).join("\n")}\n` : "",
      output.openQuestions.length ? `## Open Questions\n${output.openQuestions.map((q) => `- ${q}`).join("\n")}` : "",
      "",
      "## Next",
      "Synx UX Flow Designer",
    ].join("\n");

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.synxRequirementsAnalyst,
      viewFileName: "02-synx-requirements-analyst.view.md",
      viewContent: view,
      output,
      nextAgent: "Synx UX Flow Designer",
      nextStage: "synx-ux-flow-designer",
      nextRequestFileName: STAGE_FILE_NAMES.synxUxFlowDesigner,
      nextInputRef: `done/${DONE_FILE_NAMES.synxRequirementsAnalyst}`,
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
      summary: `Requirements written: ${output.functionalRequirements.length} functional, ${output.acceptanceCriteria.length} acceptance criteria.`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(taskDir(taskId), "Synx Requirements Analyst: requirements complete.");
  }
}
