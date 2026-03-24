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
  typeHint: TaskMeta["type"];
  project: string;
  status: TaskMeta["status"];
  currentStage: string;
  stage: string;
  currentAgent: string;
  nextAgent: string;
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  parentTaskId?: string;
  rootProjectId: string;
  sourceKind: TaskMeta["sourceKind"];
  childTaskIds: string[];
  consumption: TaskConsumptionDto;
}

export interface ReviewQueueItemDto extends TaskSummaryDto {
  waitingSinceAt: string;
}

export interface TaskDetailDto extends TaskSummaryDto {
  rawRequest?: string;
  history: TaskMetaHistoryItem[];
  recentEvents: string[];
  views: string[];
  artifacts: string[];
  doneArtifacts: string[];
  humanArtifacts: string[];
  childTasks: Array<{
    taskId: string;
    title: string;
    status: TaskMeta["status"];
    type: TaskMeta["type"];
  }>;
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
