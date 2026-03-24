import path from "node:path";
import { readJson } from "../lib/fs.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../lib/config.js";
import { taskDir } from "../lib/paths.js";
import { createProvider } from "../providers/factory.js";
import { createTaskService } from "../lib/services/task-services.js";
import { logDaemon, logTaskEvent } from "../lib/logging.js";
import { ARTIFACT_FILES, saveTaskArtifact } from "../lib/task-artifacts.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import type { NewTaskInput, StageEnvelope, TaskType } from "../lib/types.js";
import { z } from "zod";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";

const ORCHESTRATOR_AGENT = "Project Orchestrator" as const;
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

const orchestratorOutputSchema = z.object({
  projectSummary: z.string(),
  tasks: z.array(subtaskSchema).min(1).max(MAX_SUBTASKS),
});

type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>;

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

function buildSystemPrompt(input: NewTaskInput): string {
  return `You are the Project Orchestrator for SYNX, a multi-agent software development system.

Your job is to receive a high-level project or feature request and decompose it into a concrete execution plan of subtasks for specialized agents.

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

export class ProjectOrchestrator extends WorkerBase {
  readonly agent = ORCHESTRATOR_AGENT;
  readonly requestFileName = STAGE_FILE_NAMES.projectOrchestrator;
  readonly workingFileName = "00-project-orchestrator.working.json";

  protected async processTask(taskId: string, request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();
    const config = await loadResolvedProjectConfig();

    // Use Dispatcher provider for the orchestrator (it's a routing/planning agent)
    const provider = createProvider(resolveProviderConfigForAgent(config, "Dispatcher"));

    const input = await readJson<NewTaskInput>(path.join(taskDir(taskId), "input", "new-task.json"));
    const parentMeta = await loadTaskMeta(taskId);
    const rootProjectId = parentMeta.rootProjectId || taskId;

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: analysing request "${input.title}"...`);
    await logDaemon(`ProjectOrchestrator: decomposing task ${taskId}`);

    const systemPrompt = buildSystemPrompt(input);

    const result = await provider.generateStructured({
      agent: ORCHESTRATOR_AGENT,
      taskId,
      stage: request.stage,
      taskType: input.typeHint,
      systemPrompt,
      input,
      expectedJsonSchemaDescription:
        '{ "projectSummary": "string", "tasks": [{ "taskKey": "string", "title": "string", "typeHint": "Feature|Bug|Refactor|Research|Documentation|Mixed", "rawRequest": "string", "dependsOn": ["taskKey"], "priority": "1..5", "milestone": "string?", "parallelizable": "boolean" }] }',
    });

    const output = orchestratorOutputSchema.parse(result.parsed) as OrchestratorOutput;
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
            ...(subtask.milestone ? [`Milestone: ${subtask.milestone}`] : []),
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
        },
      });
      createdIds.push(created.taskId);
      createdByKey.set(subtask.taskKey, created.taskId);
      await logTaskEvent(taskDir(taskId), `Created subtask: [${subtask.taskKey}] ${subtask.title} → ${created.taskId}`);
    }

    for (const [index, subtask] of keyedTasks.entries()) {
      const createdTaskId = createdIds[index];
      if (!createdTaskId) continue;

      const resolvedDependencies = Array.from(new Set(
        subtask.dependsOn
          .map((dependencyKey) => createdByKey.get(dependencyKey))
          .filter((dependencyTaskId): dependencyTaskId is string => Boolean(dependencyTaskId))
          .filter((dependencyTaskId) => dependencyTaskId !== createdTaskId),
      ));
      const unresolvedDependencies = subtask.dependsOn.filter((dependencyKey) => !createdByKey.has(dependencyKey));
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
          .map((dependencyKey) => createdByKey.get(dependencyKey))
          .filter((dependencyTaskId): dependencyTaskId is string => Boolean(dependencyTaskId)),
      })),
      createdTaskIds: createdIds,
      createdAt: nowIso(),
    });

    await logDaemon(`ProjectOrchestrator: created ${createdIds.length} subtasks for ${taskId}: ${createdIds.join(", ")}`);

    await this.finishStage({
      taskId,
      stage: request.stage,
      doneFileName: "00-project-orchestrator.done.json",
      viewFileName: "00-project-orchestrator.view.md",
      viewContent: [
        `# Project: ${input.title}`,
        "",
        output.projectSummary,
        "",
        "## Subtasks created",
        ...keyedTasks.map((t, i) => {
          const dependencyKeys = t.dependsOn.length ? t.dependsOn.join(", ") : "none";
          const milestone = t.milestone ? ` | milestone: ${t.milestone}` : "";
          return `${i + 1}. **[${t.typeHint}]** ${t.title} (\`${t.taskKey}\`) → \`${createdIds[i]}\` | priority: ${t.priority}${milestone} | parallelizable: ${t.parallelizable ? "yes" : "no"} | dependsOn: ${dependencyKeys}`;
        }),
      ].join("\n"),
      output: {
        ...output,
        tasks: keyedTasks.map((task, index) => ({
          ...task,
          taskId: createdIds[index],
          dependsOnTaskIds: task.dependsOn
            .map((dependencyKey) => createdByKey.get(dependencyKey))
            .filter((dependencyTaskId): dependencyTaskId is string => Boolean(dependencyTaskId)),
        })),
        rootProjectId,
        createdTaskIds: createdIds,
      },
      // No nextAgent — intake stays open for project tracking while subtasks execute.
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

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: decomposition complete. ${createdIds.length} subtask(s) are now queued.`);
  }
}
