import path from "node:path";
import { writeJson } from "../lib/fs.js";
import { loadPipelineDefinition } from "../lib/pipeline-registry.js";
import { loadPipelineState, savePipelineState, advancePipelineState, PIPELINE_STATE_FILE } from "../lib/pipeline-state.js";
import { resolveStepProviderChain } from "../lib/pipeline-provider.js";
import { resolveStepPrompt } from "../lib/pipeline-prompt.js";
import { genericAgentOutputSchema } from "../lib/schema.js";
import type { PipelineStepResult, StageEnvelope } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { taskDir } from "../lib/paths.js";
import { createProvider } from "../providers/factory.js";
import { WorkerBase } from "./base.js";

export const PIPELINE_EXECUTOR_REQUEST_FILE = "pipeline-executor.request.json";
export const PIPELINE_EXECUTOR_WORKING_FILE = "pipeline-executor.working.json";

export class PipelineExecutor extends WorkerBase {
  readonly agent = "Pipeline Executor" as const;
  readonly requestFileName = PIPELINE_EXECUTOR_REQUEST_FILE;
  readonly workingFileName = PIPELINE_EXECUTOR_WORKING_FILE;

  protected async processTask(taskId: string, _request: StageEnvelope): Promise<void> {
    const startedAt = nowIso();

    const state = await loadPipelineState(taskId);
    const pipeline = await loadPipelineDefinition(state.pipelineId);

    const currentStepIndex = state.currentStep;
    const baseInput = await this.loadTaskInput(taskId);
    const stage = "pipeline-executor";

    // All steps complete
    if (currentStepIndex >= pipeline.steps.length) {
      await this.finishStage({
        taskId,
        stage,
        doneFileName: "pipeline-executor.done.json",
        viewFileName: "pipeline-executor.md",
        viewContent: `# Pipeline Complete\n\nPipeline **${pipeline.name}** completed all ${pipeline.steps.length} steps.`,
        output: { pipelineId: state.pipelineId, completedSteps: state.completedSteps },
        humanApprovalRequired: true,
        startedAt,
      });
      return;
    }

    const currentStep = pipeline.steps[currentStepIndex];

    const [prompt, providerChain] = await Promise.all([
      resolveStepPrompt(currentStep.agent),
      resolveStepProviderChain(currentStep),
    ]);

    const input = {
      task: baseInput,
      pipelineContext: {
        pipelineId: state.pipelineId,
        pipelineName: pipeline.name,
        routing: pipeline.routing,
        currentStep: currentStepIndex,
        totalSteps: pipeline.steps.length,
        currentAgent: currentStep.agent,
        previousSteps: state.completedSteps,
      },
    };

    const request = {
      agent: this.agent as any,
      taskType: baseInput.typeHint,
      taskId,
      stage: `${stage}-step-${currentStepIndex}`,
      systemPrompt: prompt,
      input,
      expectedJsonSchemaDescription:
        'JSON object with: summary (string), result (optional object with any fields), nextAgent (optional string)',
    };

    let result = null;
    let lastError: unknown = null;
    for (const config of providerChain) {
      try {
        result = await createProvider(config).generateStructured(request);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!result) throw lastError;

    const parsed = genericAgentOutputSchema.parse(result.parsed);

    // Save individual step output
    const stepDoneFile = `pipeline-step-${currentStepIndex}.done.json`;
    await writeJson(path.join(taskDir(taskId), "done", stepDoneFile), {
      taskId,
      stage: `pipeline-step-${currentStepIndex}`,
      status: "done",
      createdAt: nowIso(),
      agent: currentStep.agent,
      output: parsed,
    });

    const stepResult: PipelineStepResult = {
      stepIndex: currentStepIndex,
      agent: currentStep.agent,
      output: parsed as Record<string, unknown>,
    };

    // Resolve next step index
    const nextStepIndex = resolveNextStep({
      pipeline,
      currentIndex: currentStepIndex,
      output: parsed,
      routing: pipeline.routing,
    });

    const updatedState = advancePipelineState(state, nextStepIndex, stepResult);
    await savePipelineState(taskId, updatedState);

    const moreSteps = nextStepIndex < pipeline.steps.length;

    await this.finishStage({
      taskId,
      stage: `${stage}-step-${currentStepIndex}`,
      doneFileName: `pipeline-executor-step-${currentStepIndex}.done.json`,
      viewFileName: `pipeline-executor-step-${currentStepIndex}.md`,
      viewContent: `# Pipeline Step ${currentStepIndex + 1}: ${currentStep.agent}\n\n${parsed.summary}`,
      output: parsed,
      nextAgent: moreSteps ? this.agent : undefined,
      nextStage: moreSteps ? stage : undefined,
      nextRequestFileName: moreSteps ? PIPELINE_EXECUTOR_REQUEST_FILE : undefined,
      nextInputRef: moreSteps ? PIPELINE_STATE_FILE : undefined,
      humanApprovalRequired: !moreSteps,
      startedAt,
      provider: result.provider,
      model: result.model,
      parseRetries: result.parseRetries,
      validationPassed: result.validationPassed,
      providerAttempts: result.providerAttempts,
      providerBackoffRetries: result.providerBackoffRetries,
      providerBackoffWaitMs: result.providerBackoffWaitMs,
      estimatedInputTokens: result.estimatedInputTokens,
      estimatedOutputTokens: result.estimatedOutputTokens,
      estimatedTotalTokens: result.estimatedTotalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    });
  }
}

function resolveNextStep(args: {
  pipeline: { steps: Array<{ agent: string; defaultNextStep?: number; condition?: string }> };
  currentIndex: number;
  output: { nextAgent?: string };
  routing: string;
}): number {
  const { pipeline, currentIndex, output, routing } = args;

  if (routing === "sequential") {
    return currentIndex + 1;
  }

  if (routing === "dynamic" && output.nextAgent) {
    const nextIdx = pipeline.steps.findIndex((s) => s.agent === output.nextAgent);
    if (nextIdx !== -1) return nextIdx;
  }

  if (routing === "conditional") {
    const step = pipeline.steps[currentIndex];
    if (step.defaultNextStep !== undefined) return step.defaultNextStep;
  }

  // Default: advance sequentially
  return currentIndex + 1;
}
