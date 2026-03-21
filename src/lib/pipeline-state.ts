// Manages pipeline execution state stored in input/pipeline-state.json

import path from "node:path";
import { readJsonValidated, writeJson } from "./fs.js";
import { taskDir } from "./paths.js";
import { pipelineStateSchema } from "./schema.js";
import type { PipelineState, PipelineStepResult } from "./types.js";

export const PIPELINE_STATE_FILE = "input/pipeline-state.json";

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
  stepResult: PipelineStepResult,
): PipelineState {
  return {
    ...state,
    currentStep: nextStep,
    completedSteps: [...state.completedSteps, stepResult],
  };
}
