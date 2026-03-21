// Manages pipeline execution state stored in input/pipeline-state.json

import path from "node:path";
import { readJsonValidated, writeJson } from "./fs.js";
import { taskDir } from "./paths.js";
import { pipelineStateSchema } from "./schema.js";
import type { PipelineState, PipelineStepContext } from "./types.js";

export const PIPELINE_STATE_FILE = "input/pipeline-state.json";

/** Fields stripped from agent output before storing as context (too large or not useful for subsequent agents) */
const STRIPPED_FIELDS = new Set(["edits"]);

/**
 * Builds a compact PipelineStepContext from a step's raw output.
 * Extracts a human-readable summary and strips verbose fields (e.g. edits)
 * to prevent token bloat in subsequent steps.
 */
export function buildStepContext(
  stepIndex: number,
  agent: string,
  output: Record<string, unknown>,
  opts?: { provider?: string; model?: string; durationMs?: number },
): PipelineStepContext {
  const summary =
    typeof output.summary === "string" ? output.summary :
    typeof output.implementationSummary === "string" ? output.implementationSummary :
    JSON.stringify(output).slice(0, 300);

  const keyOutputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (!STRIPPED_FIELDS.has(key)) {
      keyOutputs[key] = value;
    }
  }

  return { stepIndex, agent, summary, keyOutputs, ...opts };
}

export async function loadPipelineState(taskId: string): Promise<PipelineState> {
  const filePath = path.join(taskDir(taskId), PIPELINE_STATE_FILE);
  return readJsonValidated(filePath, pipelineStateSchema);
}

export async function savePipelineState(taskId: string, state: PipelineState): Promise<void> {
  const filePath = path.join(taskDir(taskId), PIPELINE_STATE_FILE);
  await writeJson(filePath, state);
}

export function advancePipelineState(
  state: PipelineState,
  nextStep: number,
  stepContext: PipelineStepContext,
): PipelineState {
  return {
    ...state,
    currentStep: nextStep,
    completedSteps: [...state.completedSteps, stepContext],
  };
}
