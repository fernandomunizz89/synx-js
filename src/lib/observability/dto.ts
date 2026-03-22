import type { PipelineState, TaskMeta, TaskMetaHistoryItem } from "../types.js";
import type { TaskCancelRequest } from "../task-cancel.js";

export interface RuntimeStatusDto {
  isAlive: boolean;
  pid?: number;
  lastHeartbeatAt?: string;
  loop?: number;
  taskCount?: number;
  activeTaskCount?: number;
  workerCount?: number;
}

export interface TaskConsumptionDto {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
}

export interface TaskSummaryDto {
  taskId: string;
  title: string;
  type: TaskMeta["type"];
  project: string;
  status: TaskMeta["status"];
  currentStage: string;
  currentAgent: string;
  nextAgent: string;
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  consumption: TaskConsumptionDto;
}

export interface ReviewQueueItemDto extends TaskSummaryDto {
  waitingSinceAt: string;
}

export interface TaskDetailDto extends TaskSummaryDto {
  history: TaskMetaHistoryItem[];
  recentEvents: string[];
  views: string[];
  artifacts: string[];
  doneArtifacts: string[];
  humanArtifacts: string[];
  pipelineState: PipelineState | null;
  cancelRequest: TaskCancelRequest | null;
}

export interface OverviewDto {
  runtime: RuntimeStatusDto;
  counts: {
    total: number;
    active: number;
    waitingHuman: number;
    failed: number;
    done: number;
  };
  reviewQueueCount: number;
  consumption: TaskConsumptionDto;
  updatedAt: string;
}
