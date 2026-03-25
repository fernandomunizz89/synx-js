const BASE = "";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const json = (await res.json()) as { ok: boolean; data: T; error?: string };
  if (!json.ok) throw new Error(json.error ?? "API error");
  return json.data;
}

export interface MetricsOverview {
  taskMetrics: {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    inProgressTasks: number;
    successRate: number;
    avgTotalMs: number;
    estimatedCostUsdTotal: number;
    qaReturnRate: number;
  };
  stageSummary: Array<{
    stage: string;
    count: number;
    avgMs: number;
    totalMs: number;
  }>;
  learningQuality: {
    agents: Array<{
      agent: string;
      total: number;
      approved: number;
      reproved: number;
      approvalRate: number;
    }>;
  };
  projectQuality: {
    projects: Array<{
      project: string;
      taskCount: number;
      reworkRate: number;
      qaReturnRate: number;
      humanInterventionRate: number;
    }>;
  };
  bottlenecks: {
    topStage: string;
    topStageAvgMs: number;
  };
  operationalCost: {
    throttleEvents: number;
    retryWaitMs: number;
  };
}

export interface TimelinePoint {
  date: string;
  taskCount: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  totalDurationMs: number;
}

export interface AgentRow {
  agent: string;
  stageCount: number;
  avgDurationMs: number;
  estimatedCostUsd: number;
  approvalRate: number;
  approvedCount: number;
  reprovedCount: number;
}

export interface ProjectRow {
  project: string;
  taskCount: number;
  activeCount: number;
  doneCount: number;
  failedCount: number;
  waitingHumanCount: number;
  estimatedCostUsd: number;
}

export async function fetchMetricsOverview(): Promise<MetricsOverview> {
  return apiFetch<MetricsOverview>("/api/metrics/overview");
}

export async function fetchTimeline(days = 30): Promise<TimelinePoint[]> {
  return apiFetch<TimelinePoint[]>(`/api/metrics/timeline?days=${days}`);
}

export async function fetchAgents(): Promise<AgentRow[]> {
  return apiFetch<AgentRow[]>("/api/metrics/agents");
}

export async function fetchProjects(): Promise<ProjectRow[]> {
  return apiFetch<ProjectRow[]>("/api/metrics/projects");
}
