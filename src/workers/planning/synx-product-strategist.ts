import { z } from "zod";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../../lib/constants.js";
import { nowIso } from "../../lib/utils.js";
import { WorkerBase } from "../base.js";
import type { StageEnvelope } from "../../lib/types.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../../lib/config.js";
import { createProvider } from "../../providers/factory.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../../lib/task-artifacts.js";
import { buildLearningsPromptSection, inferCapabilityTagsForAgent, loadRecentLearnings, recordLearning } from "../../lib/learnings.js";
import { logDaemon, logTaskEvent } from "../../lib/logging.js";
import { taskDir } from "../../lib/paths.js";

const AGENT = "Synx Product Strategist" as const;

const outputSchema = z.object({
  problemStatement: z.string().min(1),
  targetUsers: z.array(z.string().min(1)).min(1),
  productGoals: z.array(z.string().min(1)).min(1),
  inScope: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  unknowns: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

function buildSystemPrompt(title: string, rawRequest: string, learningsSection: string): string {
  return `You are the Product Strategist for the SYNX pre-build planning squad.

Your role is the first step in a five-stage planning chain. You transform a raw request into a product brief that the rest of the planning squad will build on.

Responsibilities:
- Define the core problem being solved
- Identify target users and their primary needs
- Set clear product goals (outcome-oriented, not feature-oriented)
- Declare explicit scope boundaries (in-scope and out-of-scope)
- Surface assumptions and unknowns that could affect the plan
- Rate your confidence in the framing (0.0–1.0)

Rules:
- Favor MVP scope when uncertain
- Be specific — avoid vague goals like "improve user experience"
- Explicitly name what is OUT of scope to prevent scope creep
- Surface unknowns honestly rather than assuming

Request:
Title: ${title}
Description: ${rawRequest}

${learningsSection ? `Recent learning feedback:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "problemStatement": "string — 1 to 3 sentences describing the core problem",
  "targetUsers": ["string — at least one user persona"],
  "productGoals": ["string — at least one SMART goal"],
  "inScope": ["string — at least one explicit scope item"],
  "outOfScope": ["string"],
  "assumptions": ["string"],
  "unknowns": ["string"],
  "confidence": 0.85
}`;
}

export class SynxProductStrategist extends WorkerBase {
  readonly agent = AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.synxProductStrategist;
  readonly workingFileName = "01-synx-product-strategist.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, AGENT));
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Synx Product Strategist: defining product brief for "${input.title}"...`);
    await logDaemon(`SynxProductStrategist: started for ${taskId}`);

    const recentLearnings = await loadRecentLearnings(AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildSystemPrompt(input.title, input.rawRequest, learningsSection),
      input,
      expectedJsonSchemaDescription:
        '{ "problemStatement": "string", "targetUsers": ["string"], "productGoals": ["string"], "inScope": ["string"], "outOfScope": ["string"], "assumptions": ["string"], "unknowns": ["string"], "confidence": 0.0-1.0 }',
    });

    const output = outputSchema.parse(result.parsed);

    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectBrief, {
      projectTaskId: taskId,
      createdAt: nowIso(),
      ...output,
    });

    const view = [
      "# HANDOFF",
      "",
      "## Agent",
      "Synx Product Strategist",
      "",
      "## Problem Statement",
      output.problemStatement,
      "",
      "## Target Users",
      ...output.targetUsers.map((u) => `- ${u}`),
      "",
      "## Product Goals",
      ...output.productGoals.map((g) => `- ${g}`),
      "",
      "## In Scope",
      ...output.inScope.map((s) => `- ${s}`),
      "",
      "## Out of Scope",
      output.outOfScope.length ? output.outOfScope.map((s) => `- ${s}`).join("\n") : "- (none declared)",
      "",
      `## Confidence: ${output.confidence}`,
      "",
      "## Next",
      "Synx Requirements Analyst",
    ].join("\n");

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.synxProductStrategist,
      viewFileName: "01-synx-product-strategist.view.md",
      viewContent: view,
      output,
      nextAgent: "Synx Requirements Analyst",
      nextStage: "synx-requirements-analyst",
      nextRequestFileName: STAGE_FILE_NAMES.synxRequirementsAnalyst,
      nextInputRef: `done/${DONE_FILE_NAMES.synxProductStrategist}`,
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
      summary: `Product brief completed: ${output.productGoals.length} goal(s), confidence ${output.confidence}.`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(taskDir(taskId), "Synx Product Strategist: product brief complete.");
  }
}
