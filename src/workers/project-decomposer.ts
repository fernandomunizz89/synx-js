import path from "node:path";
import { z } from "zod";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../lib/config.js";
import { taskDir } from "../lib/paths.js";
import { createProvider } from "../providers/factory.js";
import { createTaskService } from "../lib/services/task-services.js";
import { logDaemon, logTaskEvent } from "../lib/logging.js";
import { ARTIFACT_FILES, loadTaskArtifact, saveTaskArtifact } from "../lib/task-artifacts.js";
import { buildLearningsPromptSection, inferCapabilityTagsForAgent, loadRecentLearnings, recordLearning } from "../lib/learnings.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import type { NewTaskInput, StageEnvelope, TaskType } from "../lib/types.js";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";

const DECOMPOSER_AGENT = "Project Orchestrator" as const;
const MAX_SUBTASKS = 10;

const subtaskSchema = z.object({
  taskKey: z.string().min(1).max(80).optional(),
  title: z.string().min(1),
  typeHint: z.enum(["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed"]),
  rawRequest: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5).default(3),
  milestone: z.string().max(120).optional(),
  parallelizable: z.boolean().default(true),
});

const decomposerOutputSchema = z.object({
  projectSummary: z.string(),
  tasks: z.array(subtaskSchema).min(1).max(MAX_SUBTASKS),
});

type DecomposerOutput = z.infer<typeof decomposerOutputSchema>;

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTaskKey(value: string | undefined, fallbackLabel: string, index: number): string {
  const fromField = normalizeKey(String(value || ""));
  if (fromField) return fromField;
  const fromFallbackLabel = normalizeKey(fallbackLabel);
  if (fromFallbackLabel) return fromFallbackLabel;
  return `task-${index + 1}`;
}

function normalizeOwnershipBoundary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/[),.;:]+$/g, "")
    .replace(/\/+$/, "");
  if (!normalized) return undefined;
  if (normalized === ".") return undefined;
  return normalized;
}

function extractOwnershipBoundaries(rawRequest: string): string[] {
  const matches = rawRequest.match(/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?:\.[A-Za-z0-9._-]+)?/g) || [];
  const normalized = matches
    .map((value) => normalizeOwnershipBoundary(value))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized)).slice(0, 12);
}

function buildDecompositionPrompt(
  input: NewTaskInput,
  projectBrief: Record<string, unknown> | null,
  acceptanceCriteria: string[],
  milestonePlan: Array<{ milestone: string; objective: string; deliverables: string[] }>,
  clarification: { required: boolean; rationale?: string; questions: string[] },
  learningsSection: string,
): string {
  const briefJson = projectBrief ? JSON.stringify(projectBrief, null, 2) : "(not available)";
  const acList = acceptanceCriteria.length
    ? acceptanceCriteria.map((item, i) => `${i + 1}. ${item}`).join("\n")
    : "(not available)";
  const milestoneList = milestonePlan.length
    ? milestonePlan
      .map((item, i) => `${i + 1}. ${item.milestone}: ${item.objective} | Deliverables: ${item.deliverables.join("; ")}`)
      .join("\n")
    : "(not available)";

  return `You are the Project Orchestrator for SYNX, a multi-agent software development system.

Your job is to decompose a planned project into a concrete execution plan of subtasks for specialized agents.

Available agents:
- Synx Front Expert: Next.js App Router, React, TailwindCSS, WCAG 2.1, server components
- Synx Mobile Expert: Expo, React Native, Reanimated, EAS
- Synx Back Expert: NestJS, Fastify, Prisma ORM, REST/GraphQL APIs, TypeScript
- Synx SEO Specialist: Core Web Vitals, JSON-LD, Next.js Metadata API, Lighthouse

Rules for decomposition:
1. Each subtask must have a unique kebab-case "taskKey" (example: "design-auth-model").
2. Subtasks can depend on earlier subtasks using "dependsOn" with taskKey values.
3. Set "priority" from 1 (lowest) to 5 (highest).
4. Set "parallelizable" to false when a task should run alone to avoid collisions.
5. Optionally assign a "milestone" label such as "MVP", "Beta", or "Hardening".
6. Each subtask must be concrete and specific enough that a single expert can implement it without clarifying scope.
7. Include enough context in rawRequest so the agent knows exactly what to build (endpoints, component names, data models, file paths, acceptance criteria).
8. Do not create more than ${MAX_SUBTASKS} subtasks. Aim for 3–7 focused tasks.
9. Do not create subtasks for QA or testing — the QA Engineer runs automatically after each expert.
10. Use typeHint "Feature" for new functionality, "Bug" for fixes, "Refactor" for code improvements.

Project request:
Title: ${input.title}
Description: ${input.rawRequest}

Pre-build planning context:
Project brief:
${briefJson}

Acceptance criteria:
${acList}

Milestone plan:
${milestoneList}

Clarification status:
Required: ${clarification.required ? "yes" : "no"}
${clarification.rationale ? `Rationale: ${clarification.rationale}\n` : ""}${clarification.questions.length ? `Questions:\n${clarification.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "Questions: none"}

${learningsSection ? `Recent learning feedback for decomposition quality:\n${learningsSection}\n` : ""}
Respond with a JSON object matching this schema exactly:
{
  "projectSummary": "Brief one-sentence summary of the project",
  "tasks": [
    {
      "taskKey": "unique-task-key",
      "title": "Short actionable title",
      "typeHint": "Feature",
      "rawRequest": "Detailed description with specifics: file paths, component names, API endpoints, data models, acceptance criteria",
      "dependsOn": ["task-key-this-task-needs"],
      "priority": 3,
      "milestone": "MVP",
      "parallelizable": true
    }
  ]
}`;
}

export class ProjectDecomposer extends WorkerBase {
  readonly agent = DECOMPOSER_AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.projectDecomposer;
  readonly workingFileName = "00-project-orchestrator-decompose.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const provider = createProvider(resolveProviderConfigForAgent(config, "Dispatcher"));
    const parentMeta = await loadTaskMeta(taskId);
    const rootProjectId = parentMeta.rootProjectId || taskId;

    const input = await this.loadTaskInput(taskId);

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: decomposing "${input.title}" into subtasks...`);
    await logDaemon(`ProjectDecomposer: decomposing task ${taskId}`);

    // Load all five planning artifacts
    const [projectBrief, requirementsPrd, milestonePlanArtifact, clarificationArtifact] = await Promise.all([
      loadTaskArtifact<Record<string, unknown>>(taskId, ARTIFACT_FILES.projectBrief),
      loadTaskArtifact<{ acceptanceCriteria?: string[] }>(taskId, ARTIFACT_FILES.requirementsPrd),
      loadTaskArtifact<{ milestones?: Array<{ milestone: string; objective: string; deliverables: string[] }> }>(
        taskId, ARTIFACT_FILES.milestonePlan,
      ),
      loadTaskArtifact<{ required?: boolean; rationale?: string; questions?: string[] }>(
        taskId, ARTIFACT_FILES.clarificationRequest,
      ),
    ]);

    const acceptanceCriteria = requirementsPrd?.acceptanceCriteria ?? [];
    const milestonePlan = milestonePlanArtifact?.milestones ?? [];
    const clarification = {
      required: clarificationArtifact?.required ?? false,
      rationale: clarificationArtifact?.rationale,
      questions: clarificationArtifact?.questions ?? [],
    };

    const recentLearnings = await loadRecentLearnings(DECOMPOSER_AGENT).catch(() => []);
    const learningsSection = buildLearningsPromptSection(recentLearnings);

    const result = await provider.generateStructured({
      agent: DECOMPOSER_AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt: buildDecompositionPrompt(
        input, projectBrief, acceptanceCriteria, milestonePlan, clarification, learningsSection,
      ),
      input,
      expectedJsonSchemaDescription:
        '{ "projectSummary": "string", "tasks": [{ "taskKey": "string", "title": "string", "typeHint": "Feature|Bug|Refactor|Research|Documentation|Mixed", "rawRequest": "string", "dependsOn": ["taskKey"], "priority": "1..5", "milestone": "string?", "parallelizable": "boolean" }] }',
    });

    const output = decomposerOutputSchema.parse(result.parsed) as DecomposerOutput;
    const keyedTasks = output.tasks.map((task, index) => ({
      ...task,
      taskKey: normalizeTaskKey(task.taskKey, task.title, index),
      dependsOn: Array.from(new Set((task.dependsOn || []).map((key) => normalizeKey(key)).filter(Boolean))),
      milestone: String(task.milestone || "").trim() || undefined,
      priority: Math.min(5, Math.max(1, Number(task.priority || 3))),
      parallelizable: task.parallelizable !== false,
    }));

    const seenTaskKeys = new Set<string>();
    for (const task of keyedTasks) {
      let key = task.taskKey;
      let suffix = 2;
      while (seenTaskKeys.has(key)) {
        key = `${task.taskKey}-${suffix}`;
        suffix += 1;
      }
      task.taskKey = key;
      seenTaskKeys.add(key);
    }

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: creating ${keyedTasks.length} subtask(s)...`);

    const createdIds: string[] = [];
    const createdByKey = new Map<string, string>();
    for (const [index, subtask] of keyedTasks.entries()) {
      const ownershipBoundaries = extractOwnershipBoundaries(subtask.rawRequest);
      const subtaskInput: Omit<NewTaskInput, "project"> = {
        title: subtask.title,
        typeHint: subtask.typeHint as TaskType,
        rawRequest: subtask.rawRequest,
        extraContext: {
          relatedFiles: [],
          logs: [],
          notes: [
            `Part of project: ${input.title}`,
            `Project summary: ${output.projectSummary}`,
            `Parent project intake task: ${taskId}`,
            `Root project id: ${rootProjectId}`,
            `Task key: ${subtask.taskKey}`,
            `Priority: ${subtask.priority}`,
            `Parallelizable: ${subtask.parallelizable ? "yes" : "no"}`,
            `Merge strategy: ${subtask.parallelizable ? "auto-rebase" : "manual-review"}`,
            ...(subtask.milestone ? [`Milestone: ${subtask.milestone}`] : []),
            ...(ownershipBoundaries.length ? [`Ownership boundaries: ${ownershipBoundaries.join(", ")}`] : []),
            `Acceptance criteria: ${acceptanceCriteria.slice(0, 5).join(" | ")}`,
            "Planning artifacts available: project-brief.json, requirements-prd.json, ux-flow-spec.json, solution-architecture.json, delivery-plan.json",
            `Subtask ${index + 1} of ${output.tasks.length}`,
          ],
          qaPreferences: {
            e2ePolicy: "auto",
            e2eFramework: "auto",
            objective: "",
          },
        },
      };
      const created = await createTaskService({
        ...subtaskInput,
        project: input.project,
        metadata: {
          sourceKind: "project-subtask",
          parentTaskId: taskId,
          rootProjectId,
          priority: subtask.priority as 1 | 2 | 3 | 4 | 5,
          milestone: subtask.milestone,
          parallelizable: subtask.parallelizable,
          ownershipBoundaries,
          mergeStrategy: subtask.parallelizable ? "auto-rebase" : "manual-review",
        },
      });
      createdIds.push(created.taskId);
      createdByKey.set(subtask.taskKey, created.taskId);
      await logTaskEvent(taskDir(taskId), `Created subtask: [${subtask.taskKey}] ${subtask.title} → ${created.taskId}`);
    }

    // Resolve dependency task IDs
    for (const [index, subtask] of keyedTasks.entries()) {
      const createdTaskId = createdIds[index];
      if (!createdTaskId) continue;

      const resolvedDependencies = Array.from(new Set(
        subtask.dependsOn
          .map((dependencyKey) => createdByKey.get(dependencyKey))
          .filter((id): id is string => Boolean(id))
          .filter((id) => id !== createdTaskId),
      ));
      const unresolvedDependencies = subtask.dependsOn.filter((key) => !createdByKey.has(key));
      if (unresolvedDependencies.length) {
        await logTaskEvent(
          taskDir(taskId),
          `Subtask ${createdTaskId} has unresolved dependency key(s): ${unresolvedDependencies.join(", ")}.`,
        );
      }

      if (!resolvedDependencies.length) continue;
      const childMeta = await loadTaskMeta(createdTaskId);
      childMeta.dependsOn = resolvedDependencies;
      childMeta.blockedBy = resolvedDependencies;
      await saveTaskMeta(createdTaskId, childMeta);
      await logTaskEvent(taskDir(taskId), `Subtask ${createdTaskId} depends on ${resolvedDependencies.join(", ")}.`);
    }

    await saveTaskArtifact(taskId, ARTIFACT_FILES.projectDecomposition, {
      projectTaskId: taskId,
      rootProjectId,
      projectSummary: output.projectSummary,
      tasks: keyedTasks.map((task, index) => ({
        ...task,
        taskId: createdIds[index],
        dependsOnTaskIds: task.dependsOn
          .map((key) => createdByKey.get(key))
          .filter((id): id is string => Boolean(id)),
      })),
      createdTaskIds: createdIds,
      createdAt: nowIso(),
    });

    await logDaemon(`ProjectDecomposer: created ${createdIds.length} subtasks for ${taskId}: ${createdIds.join(", ")}`);

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: DONE_FILE_NAMES.projectDecomposer,
      viewFileName: "00-project-orchestrator-decompose.view.md",
      viewContent: [
        `# Project: ${input.title}`,
        "",
        output.projectSummary,
        "",
        "## Planning artifacts",
        "- project-brief.json",
        "- requirements-prd.json",
        "- acceptance-criteria.json",
        "- ux-flow-spec.json",
        "- solution-architecture.json",
        "- delivery-plan.json",
        "- milestone-plan.json",
        ...(clarification.required || clarification.questions.length
          ? ["- clarification-request.json"]
          : []),
        "",
        clarification.required
          ? `Clarification was requested before implementation. Questions: ${clarification.questions.length}`
          : "No clarification required.",
        "",
        "## Subtasks created",
        ...keyedTasks.map((t, i) => {
          const deps = t.dependsOn.length ? t.dependsOn.join(", ") : "none";
          const ms = t.milestone ? ` | milestone: ${t.milestone}` : "";
          return `${i + 1}. **[${t.typeHint}]** ${t.title} (\`${t.taskKey}\`) → \`${createdIds[i]}\` | priority: ${t.priority}${ms} | parallelizable: ${t.parallelizable ? "yes" : "no"} | dependsOn: ${deps}`;
        }),
      ].join("\n"),
      output: {
        ...output,
        tasks: keyedTasks.map((task, index) => ({
          ...task,
          taskId: createdIds[index],
          dependsOnTaskIds: task.dependsOn
            .map((key) => createdByKey.get(key))
            .filter((id): id is string => Boolean(id)),
        })),
        rootProjectId,
        createdTaskIds: createdIds,
      },
      // No nextAgent — project task stays open while subtasks execute
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
      agentId: DECOMPOSER_AGENT,
      summary: `Project decomposition completed with ${createdIds.length} subtask(s).`,
      outcome: "approved",
      workflow: "project-intake",
      taskType: input.typeHint,
      sourceKind: parentMeta.sourceKind,
      project: input.project,
      rootProjectId,
      parentTaskId: parentMeta.parentTaskId,
      stage: request.stage,
      capabilities: inferCapabilityTagsForAgent(DECOMPOSER_AGENT),
      provider: result.provider,
      model: result.model,
    });

    await logTaskEvent(
      taskDir(taskId),
      `Project Orchestrator: decomposition complete. ${createdIds.length} subtask(s) are now queued.`,
    );
  }
}
