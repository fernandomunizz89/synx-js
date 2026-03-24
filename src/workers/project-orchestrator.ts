import path from "node:path";
import { readJson } from "../lib/fs.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { loadResolvedProjectConfig, resolveProviderConfigForAgent } from "../lib/config.js";
import { taskDir } from "../lib/paths.js";
import { createProvider } from "../providers/factory.js";
import { createTaskService } from "../lib/services/task-services.js";
import { logDaemon, logRuntimeEvent, logTaskEvent } from "../lib/logging.js";
import { nowIso } from "../lib/utils.js";
import { WorkerBase } from "./base.js";
import type { NewTaskInput, StageEnvelope, TaskType } from "../lib/types.js";
import { z } from "zod";
import { loadTaskMeta, saveTaskMeta } from "../lib/task.js";

const ORCHESTRATOR_AGENT = "Project Orchestrator" as const;
const MAX_SUBTASKS = 10;

const subtaskSchema = z.object({
  title: z.string().min(1),
  typeHint: z.enum(["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed"]),
  rawRequest: z.string().min(1),
});

const orchestratorOutputSchema = z.object({
  projectSummary: z.string(),
  tasks: z.array(subtaskSchema).min(1).max(MAX_SUBTASKS),
});

type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>;

function buildSystemPrompt(input: NewTaskInput): string {
  return `You are the Project Orchestrator for SYNX, a multi-agent software development system.

Your job is to receive a high-level project or feature request and decompose it into a list of concrete, independent subtasks that can be worked on in parallel by specialized agents.

Available agents:
- Synx Front Expert: Next.js App Router, React, TailwindCSS, WCAG 2.1, server components
- Synx Mobile Expert: Expo, React Native, Reanimated, EAS
- Synx Back Expert: NestJS, Fastify, Prisma ORM, REST/GraphQL APIs, TypeScript
- Synx SEO Specialist: Core Web Vitals, JSON-LD, Next.js Metadata API, Lighthouse

Rules for decomposition:
1. Each subtask must be independently executable — no subtask should depend on another being done first.
2. Each subtask must be concrete and specific enough that a single expert can implement it without needing to clarify scope.
3. Include enough context in rawRequest so the agent knows exactly what to build (endpoints, component names, data models, file paths, etc.).
4. Do not create more than ${MAX_SUBTASKS} subtasks. Aim for 3–7 focused tasks.
5. Do not create subtasks for QA or testing — the QA Engineer runs automatically after each expert.
6. Use typeHint "Feature" for new functionality, "Bug" for fixes, "Refactor" for code improvements.

Project request:
Title: ${input.title}
Description: ${input.rawRequest}

Respond with a JSON object matching this schema exactly:
{
  "projectSummary": "Brief one-sentence summary of the project",
  "tasks": [
    {
      "title": "Short actionable title",
      "typeHint": "Feature",
      "rawRequest": "Detailed description with specifics: file paths, component names, API endpoints, data models, acceptance criteria"
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
        '{ "projectSummary": "string", "tasks": [{ "title": "string", "typeHint": "Feature|Bug|Refactor|Research|Documentation|Mixed", "rawRequest": "string" }] }',
    });

    const output = orchestratorOutputSchema.parse(result.parsed) as OrchestratorOutput;

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: creating ${output.tasks.length} subtask(s)...`);

    const createdIds: string[] = [];
    for (const [index, subtask] of output.tasks.entries()) {
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
            `Subtask ${index + 1} of ${output.tasks.length}`,
          ],
          qaPreferences: {
            e2ePolicy: "auto",
            e2eFramework: "auto",
            objective: "",
          },
        },
      };
      const created = await createTaskService(subtaskInput);
      createdIds.push(created.taskId);
      await logTaskEvent(taskDir(taskId), `Created subtask: ${subtask.title} → ${created.taskId}`);
    }

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
        ...output.tasks.map((t, i) => `${i + 1}. **[${t.typeHint}]** ${t.title} → \`${createdIds[i]}\``),
      ].join("\n"),
      output: {
        ...output,
        createdTaskIds: createdIds,
      },
      // No nextAgent — the orchestrator task itself is done after creating subtasks
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

    // Intake tasks are complete once decomposition succeeds and child tasks are queued.
    const meta = await loadTaskMeta(taskId);
    meta.status = "done";
    await saveTaskMeta(taskId, meta);
    await logRuntimeEvent({
      event: "task.updated",
      source: "project-orchestrator",
      taskId,
      stage: "project-orchestrator",
      agent: ORCHESTRATOR_AGENT,
      payload: {
        status: meta.status,
        currentStage: meta.currentStage,
        currentAgent: String(meta.currentAgent || ""),
        nextAgent: String(meta.nextAgent || ""),
      },
    });

    await logTaskEvent(taskDir(taskId), `Project Orchestrator: done. ${createdIds.length} subtask(s) are now queued and running in parallel.`);
  }
}
