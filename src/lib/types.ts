export type TaskType = "Feature" | "Bug" | "Refactor" | "Research" | "Documentation" | "Mixed";
export type TaskStatus =
  | "new"
  | "in_progress"
  | "waiting_agent"
  | "waiting_human"
  | "blocked"
  | "failed"
  | "done"
  | "archived";

export type AgentName =
  | "Dispatcher"
  | "Spec Planner"
  | "Bug Investigator"
  | "Feature Builder"
  | "Reviewer"
  | "QA Validator"
  | "PR Writer"
  | "Human Review";

export type ProviderType = "mock" | "openai-compatible";

export interface ProviderStageConfig {
  type: ProviderType;
  model: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface GlobalConfig {
  providers: {
    dispatcher: ProviderStageConfig;
    planner: ProviderStageConfig;
  };
  defaults: {
    humanReviewer: string;
  };
}

export interface LocalProjectConfig {
  projectName: string;
  language: string;
  framework: string;
  humanReviewer: string;
  tasksDir: string;
  providerOverrides?: Partial<{
    dispatcher: Partial<ProviderStageConfig>;
    planner: Partial<ProviderStageConfig>;
  }>;
}

export interface ResolvedProjectConfig {
  projectName: string;
  language: string;
  framework: string;
  humanReviewer: string;
  tasksDir: string;
  providers: {
    dispatcher: ProviderStageConfig;
    planner: ProviderStageConfig;
  };
}

export interface NewTaskInput {
  title: string;
  typeHint: TaskType;
  project: string;
  rawRequest: string;
  extraContext: {
    relatedFiles: string[];
    logs: string[];
    notes: string[];
  };
}

export interface StageEnvelope<T = unknown> {
  taskId: string;
  stage: string;
  status: "request" | "done" | "failed";
  createdAt: string;
  agent: AgentName;
  inputRef?: string;
  output?: T;
  error?: string;
}

export interface TaskMetaHistoryItem {
  stage: string;
  agent: AgentName;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "done" | "failed";
  provider?: string;
  model?: string;
  parseRetries?: number;
  validationPassed?: boolean;
}

export interface TaskMeta {
  taskId: string;
  title: string;
  type: TaskType;
  project: string;
  status: TaskStatus;
  currentStage: string;
  currentAgent: AgentName | "";
  nextAgent: AgentName | "";
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  history: TaskMetaHistoryItem[];
}

export interface TimingEntry {
  taskId: string;
  stage: string;
  agent: AgentName;
  provider?: string;
  model?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "done" | "failed";
  parseRetries?: number;
  validationPassed?: boolean;
}

export interface ProviderRequest {
  agent: AgentName;
  systemPrompt: string;
  input: unknown;
  expectedJsonSchemaDescription: string;
}

export interface ProviderResult {
  rawText: string;
  parsed: unknown;
  provider: string;
  model: string;
  parseRetries: number;
  validationPassed: boolean;
}

export interface DoctorCheck {
  label: string;
  ok: boolean;
  message: string;
}

export interface ProviderHealth {
  reachable: boolean;
  message: string;
  modelFound?: boolean;
  listedModels?: string[];
}
