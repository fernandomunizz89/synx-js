export type TaskStatus =
  | "new"
  | "in_progress"
  | "waiting_agent"
  | "waiting_human"
  | "blocked"
  | "failed"
  | "done"
  | "archived";

export type TaskType =
  | "Feature"
  | "Bug"
  | "Refactor"
  | "Research"
  | "Documentation"
  | "Mixed"
  | "Project";

export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export interface TaskHistoryItem {
  stage: string;
  agent: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "done" | "failed";
  estimatedCostUsd?: number;
  estimatedTotalTokens?: number;
}

export interface TaskSummary {
  taskId: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  project: string;
  priority?: TaskPriority;
  milestone?: string;
  currentAgent: string;
  nextAgent: string;
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  parentTaskId?: string;
  rootProjectId: string;
  sourceKind: "standalone" | "project-intake" | "project-subtask";
  children?: TaskSummary[];
  history: TaskHistoryItem[];
}

export interface ReviewQueueItem {
  taskId: string;
  title: string;
  type: TaskType;
  project: string;
  currentAgent: string;
  humanApprovalRequired: boolean;
  updatedAt: string;
}

export interface OverviewData {
  runtime: {
    status: string;
    uptime?: number;
  };
  updatedAt: string;
  taskCounts?: Record<TaskStatus, number>;
}

export interface StreamEvent {
  id: number;
  at: string;
  type: string;
  payload: Record<string, unknown>;
}
