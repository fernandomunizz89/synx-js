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

const AGENT = "Synx Solution Architect" as const;

const componentSchema = z.object({
  name: z.string().min(1),
  responsibility: z.string().min(1),
  layer: z.enum(["frontend", "backend", "database", "infra", "shared"]),
});

const outputSchema = z.object({
  components: z.array(componentSchema).min(1),
  dataModelOutline: z.array(z.string().min(1)).default([]),
  integrationPoints: z.array(z.string().min(1)).default([]),
  techDecisions: z.array(z.string().min(1)).default([]),
  riskFlags: z.array(z.string().min(1)).default([]),
});

function buildSystemPrompt(
  title: string,
  rawRequest: string,
  productBrief: unknown,
  requirementsPrd: unknown,
  uxFlowSpec: unknown,
  learningsSection: string,
): string {
  const briefSection = productBrief
    ? `\nProduct brief:\n${JSON.stringify(productBrief, null, 2)}\n`
    : "";
  const requirementsSection = requirementsPrd
    ? `\nRequirements:\n${JSON.stringify(requirementsPrd, null, 2)}\n`
    : "";
  const uxSection = uxFlowSpec
    ? `\nUX flow spec:\n${JSON.stringify(uxFlowSpec, null, 2)}\n`
    : "";
  return `You are the Solution Architect for the SYNX pre-build planning squad.

You receive the product brief, requirements, and UX spec and design the technical solution.

Responsibilities:
- Identify the system components that will be built (frontend, backend, database, infra, shared)
- Sketch the data model (entities, key fields, relationships)
- Identify integration points with external systems or APIs
- Make and record key technical decisions
- Flag architectural risks or unknowns

Rules:
- Each component must have a clear single responsibility
- Data model entries should name the entity and its key fields (e.g., "User: id, email, createdAt")
- Tech decisions should explain the choice and its rationale
- Risk flags should be actionable, not just observations

Request:
Title: ${title}
Description: ${rawRequest}
${briefSection}${requirementsSection}${uxSection}
${learningsSection ? `Recent learning feedback:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "components": [
    {
      "name": "string",
      "responsibility": "string",
      "layer": "frontend | backend | database | infra | shared"
    }
  ],
  "dataModelOutline": ["string — e.g. 'User: id, email, passwordHash, createdAt'"],
  "integrationPoints": ["string"],
  "techDecisions": ["string — e.g. 'Use JWT for session tokens: stateless, easy to validate at edge'"],
  "riskFlags": ["string"]
}`;
}

export class SynxSolutionArchitect extends WorkerBase {
  readonly agent = AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.synxSolutionArchitect;
  readonly workingFileName = "04-synx-solution-architect.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, AGENT));
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Synx Solution Architect: designing technical solution for "${input.title}"...`);
    await logDaemon(`SynxSolutionArchitect: started for ${taskId}`);

    const [productBrief, requirementsPrd, uxFlowSpec] = await Promise.all([
      loadTaskArtifact(taskId, ARTIFACT_FILES.projectBrief),
      loadTaskArtifact(taskId, ARTIFACT_FILES.requirementsPrd),
      loadTaskArtifact(taskId, ARTIFACT_FILES.uxFlowSpec),
    ]);
    const recentLearnings = await loadRecentLearnings(AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildSystemPrompt(input.title, input.rawRequest, productBrief, requirementsPrd, uxFlowSpec, learningsSection),
      input,
      expectedJsonSchemaDescription:
        '{ "components": [{ "name": "string", "responsibility": "string", "layer": "frontend|backend|database|infra|shared" }], "dataModelOutline": ["string"], "integrationPoints": ["string"], "techDecisions": ["string"], "riskFlags": ["string"] }',
    });

    const output = outputSchema.parse(result.parsed);

    await saveTaskArtifact(taskId, ARTIFACT_FILES.solutionArchitecture, {
      projectTaskId: taskId,
      createdAt: nowIso(),
      ...output,
    });

    const view = [
      "# HANDOFF",
      "",
      "## Agent",
      "Synx Solution Architect",
      "",
      "## Components",
      ...output.components.map((c) => `- **[${c.layer}]** ${c.name}: ${c.responsibility}`),
      "",
      output.dataModelOutline.length
        ? `## Data Model\n${output.dataModelOutline.map((d) => `- ${d}`).join("\n")}\n`
        : "",
      output.techDecisions.length
        ? `## Tech Decisions\n${output.techDecisions.map((d) => `- ${d}`).join("\n")}\n`
        : "",
      output.riskFlags.length
        ? `## Risk Flags\n${output.riskFlags.map((r) => `- ⚠ ${r}`).join("\n")}\n`
        : "",
      "## Next",
      "Synx Delivery Planner",
    ].join("\n");

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.synxSolutionArchitect,
      viewFileName: "04-synx-solution-architect.view.md",
      viewContent: view,
      output,
      nextAgent: "Synx Delivery Planner",
      nextStage: "synx-delivery-planner",
      nextRequestFileName: STAGE_FILE_NAMES.synxDeliveryPlanner,
      nextInputRef: `done/${DONE_FILE_NAMES.synxSolutionArchitect}`,
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
      summary: `Architecture complete: ${output.components.length} component(s), ${output.riskFlags.length} risk flag(s).`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(taskDir(taskId), "Synx Solution Architect: technical design complete.");
  }
}
