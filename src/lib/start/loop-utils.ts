import { envNumber } from "../env.js";
import { POLL_INTERVAL_MS } from "../constants.js";
import type { AgentName } from "../types.js";

export function resolvePollIntervalMs(): number {
  return envNumber("AI_AGENTS_POLL_INTERVAL_MS", POLL_INTERVAL_MS, {
    integer: true,
    min: 200,
    max: 120_000,
  });
}

export function resolveMaxImmediateCycles(): number {
  return envNumber("AI_AGENTS_MAX_IMMEDIATE_CYCLES", 3, {
    integer: true,
    min: 0,
    max: 20,
  });
}

export function resolveTaskConcurrency(): number {
  return envNumber("AI_AGENTS_TASK_CONCURRENCY", 3, {
    integer: true,
    min: 1,
    max: 20,
  });
}

export interface TaskProcessOutcome {
  taskId: string;
  processedStages: number;
}

export interface RemediationTarget {
  agent: AgentName;
  stage: string;
  requestFileName: string;
}

export interface StatusCounts {
  active: number;
  waitingHuman: number;
  failed: number;
  done: number;
}
