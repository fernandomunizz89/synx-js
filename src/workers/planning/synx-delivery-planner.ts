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

const AGENT = "Synx Delivery Planner" as const;

const milestoneSchema = z.object({
  milestone: z.string().min(1).max(120),
  objective: z.string().min(1),
  deliverables: z.array(z.string().min(1)).min(1),
  priority: z.number().int().min(1).max(5).default(3),
});

const clarificationSchema = z.object({
  required: z.boolean().default(false),
  rationale: z.string().optional(),
  questions: z.array(z.string().min(1)).default([]),
});

const outputSchema = z.object({
  milestones: z.array(milestoneSchema).min(1),
  parallelismConstraints: z.array(z.string().min(1)).default([]),
  clarification: clarificationSchema,
});

function buildSystemPrompt(
  title: string,
  rawRequest: string,
  productBrief: unknown,
  requirementsPrd: unknown,
  uxFlowSpec: unknown,
  solutionArchitecture: unknown,
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
  const architectureSection = solutionArchitecture
    ? `\nSolution architecture:\n${JSON.stringify(solutionArchitecture, null, 2)}\n`
    : "";
  return `You are the Delivery Planner for the SYNX pre-build planning squad.

You are the final planning stage before implementation begins. You synthesize everything produced by the other planners into a delivery plan.

Responsibilities:
- Define milestones (MVP first, then later iterations)
- Assign deliverables to each milestone
- Identify parallelism constraints — which pieces of work must be sequential vs. parallel
- Decide if the request needs clarification before implementation can start safely

Rules:
- Always start with MVP — identify the smallest set of work that delivers real value
- Priority 5 = must ship in MVP, priority 1 = future iteration
- Parallelism constraints should describe concrete risks (e.g., "auth API must be complete before dashboard components can be wired")
- Set clarification.required = true only if implementation would genuinely stall without an answer

Request:
Title: ${title}
Description: ${rawRequest}
${briefSection}${requirementsSection}${uxSection}${architectureSection}
${learningsSection ? `Recent learning feedback:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "milestones": [
    {
      "milestone": "string — e.g. 'MVP', 'Beta', 'Hardening'",
      "objective": "string",
      "deliverables": ["string — at least 1"],
      "priority": 5
    }
  ],
  "parallelismConstraints": ["string"],
  "clarification": {
    "required": false,
    "rationale": "string?",
    "questions": ["string"]
  }
}`;
}

export class SynxDeliveryPlanner extends WorkerBase {
  readonly agent = AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.synxDeliveryPlanner;
  readonly workingFileName = "05-synx-delivery-planner.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, AGENT));
    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Synx Delivery Planner: building delivery plan for "${input.title}"...`);
    await logDaemon(`SynxDeliveryPlanner: started for ${taskId}`);

    const [productBrief, requirementsPrd, uxFlowSpec, solutionArchitecture] = await Promise.all([
      loadTaskArtifact(taskId, ARTIFACT_FILES.projectBrief),
      loadTaskArtifact(taskId, ARTIFACT_FILES.requirementsPrd),
      loadTaskArtifact(taskId, ARTIFACT_FILES.uxFlowSpec),
      loadTaskArtifact(taskId, ARTIFACT_FILES.solutionArchitecture),
    ]);
    const recentLearnings = await loadRecentLearnings(AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildSystemPrompt(
        input.title, input.rawRequest,
        productBrief, requirementsPrd, uxFlowSpec, solutionArchitecture,
        learningsSection,
      ),
      input,
      expectedJsonSchemaDescription:
        '{ "milestones": [{ "milestone": "string", "objective": "string", "deliverables": ["string"], "priority": 1-5 }], "parallelismConstraints": ["string"], "clarification": { "required": false, "rationale": "string?", "questions": ["string"] } }',
    });

    const output = outputSchema.parse(result.parsed);

    const saveTasks: Promise<void>[] = [
      // Rich delivery plan artifact
      saveTaskArtifact(taskId, ARTIFACT_FILES.deliveryPlan, {
        projectTaskId: taskId,
        createdAt: nowIso(),
        ...output,
      }),
      // Canonical milestone-plan.json consumed by the decomposer
      saveTaskArtifact(taskId, ARTIFACT_FILES.milestonePlan, {
        projectTaskId: taskId,
        createdAt: nowIso(),
        milestones: output.milestones.map(({ milestone, objective, deliverables }) => ({
          milestone, objective, deliverables,
        })),
      }),
    ];

    if (output.clarification.required || output.clarification.questions.length > 0) {
      saveTasks.push(
        saveTaskArtifact(taskId, ARTIFACT_FILES.clarificationRequest, {
          projectTaskId: taskId,
          createdAt: nowIso(),
          required: output.clarification.required,
          rationale: output.clarification.rationale,
          questions: output.clarification.questions,
        }),
      );
    }

    await Promise.all(saveTasks);

    if (output.clarification.required || output.clarification.questions.length > 0) {
      await logTaskEvent(
        taskDir(taskId),
        "Synx Delivery Planner: clarification questions generated before decomposition.",
      );
    }

    const view = [
      "# HANDOFF",
      "",
      "## Agent",
      "Synx Delivery Planner",
      "",
      "## Milestones",
      ...output.milestones.map((m) =>
        `### ${m.milestone} (priority ${m.priority})\n${m.objective}\n${m.deliverables.map((d) => `- ${d}`).join("\n")}`
      ),
      "",
      output.parallelismConstraints.length
        ? `## Parallelism Constraints\n${output.parallelismConstraints.map((c) => `- ${c}`).join("\n")}\n`
        : "",
      output.clarification.required
        ? `## Clarification Required\n${output.clarification.rationale || ""}\n${output.clarification.questions.map((q) => `- ${q}`).join("\n")}\n`
        : "## Clarification: not required\n",
      "## Next",
      "Project Orchestrator (decompose)",
    ].join("\n");

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.synxDeliveryPlanner,
      viewFileName: "05-synx-delivery-planner.view.md",
      viewContent: view,
      output,
      nextAgent: "Project Orchestrator",
      nextStage: "project-orchestrator-decompose",
      nextRequestFileName: STAGE_FILE_NAMES.projectDecomposer,
      nextInputRef: `done/${DONE_FILE_NAMES.synxDeliveryPlanner}`,
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
      summary: `Delivery plan complete: ${output.milestones.length} milestone(s), clarification required: ${output.clarification.required}.`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(taskDir(taskId), "Synx Delivery Planner: delivery plan complete.");
  }
}
