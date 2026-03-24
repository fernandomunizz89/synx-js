export type TaskType = "Feature" | "Bug" | "Refactor" | "Research" | "Documentation" | "Mixed" | "Project";
export type TaskSourceKind = "standalone" | "project-intake" | "project-subtask";
export type TaskPriority = 1 | 2 | 3 | 4 | 5;
export type TaskMergeStrategy = "auto-rebase" | "manual-review";
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
  // Orchestration layer
  | "Dispatcher"
  | "Human Review"
  | "Project Orchestrator"
  // Expert Squad
  | "Synx Front Expert"
  | "Synx Mobile Expert"
  | "Synx Back Expert"
  | "Synx QA Engineer"
  | "Synx SEO Specialist"
  | "Synx Code Reviewer"
  | "Synx DevOps Expert"
  | "Synx Security Auditor"
  | "Synx Documentation Writer"
  | "Synx DB Architect"
  | "Synx Performance Optimizer"
  | "Synx Release Manager"
  | "Synx Incident Triage"
  | "Synx Customer Feedback Synthesizer"
  // Phase 4 – Pre-build Planning Squad
  | "Synx Product Strategist"
  | "Synx Requirements Analyst"
  | "Synx UX Flow Designer"
  | "Synx Solution Architect"
  | "Synx Delivery Planner";

export type ProviderType = "mock" | "openai-compatible" | "lmstudio" | "google" | "anthropic";

export interface FallbackModel {
  type: ProviderType;
  model: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  apiKey?: string;
}
export type E2EPolicy = "auto" | "required" | "skip";
export type E2EFramework = "auto" | "playwright" | "other";

export type AgentOutputSchema = "generic" | "builder";
export type AgentRiskProfile = "low" | "medium" | "high";
export type AgentVerificationMode =
  | "static_review"
  | "unit_tests"
  | "integration_tests"
  | "e2e_tests"
  | "security_checks"
  | "performance_checks"
  | "manual_review";

export interface AgentCapabilities {
  domain: string[];
  frameworks: string[];
  languages: string[];
  taskTypes: TaskType[];
  riskProfile: AgentRiskProfile;
  preferredVerificationModes: AgentVerificationMode[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  prompt: string;
  provider: ProviderStageConfig;
  outputSchema: AgentOutputSchema;
  defaultNextAgent?: string;
  capabilities?: AgentCapabilities;
}

export type PipelineRouting = "sequential" | "dynamic" | "conditional";

export interface PipelineStep {
  agent: string;                    // agent name or custom agent id
  providerOverride?: string;        // shorthand "provider/model" e.g. "openai/gpt-4o"
  providerFallbacks?: string[];     // fallback chain e.g. ["anthropic/claude-sonnet-4-6", "openai/gpt-4o"]
  condition?: string;               // optional condition expression
  defaultNextStep?: number;         // index of default next step (for conditional routing)
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  routing: PipelineRouting;
  steps: PipelineStep[];
}

export interface PipelineStepResult {
  stepIndex: number;
  agent: string;
  output: Record<string, unknown>;
}

export type LearningOutcome = "approved" | "reproved";
export type LearningWorkflow = "pipeline" | "standalone" | "project-intake" | "project-subtask";

// ── Phase 4.1 — Project Memory ────────────────────────────────────────────────

export interface ProjectMemoryEntry {
  fact: string;
  /** "manual" or the taskId that produced this fact */
  source: string;
  addedAt: string;
}

export interface ProjectMemory {
  version: 1;
  patterns: ProjectMemoryEntry[];
  decisions: ProjectMemoryEntry[];
  knownIssues: ProjectMemoryEntry[];
  updatedAt: string;
}

/**
 * A single recorded outcome for one agent step.
 * Appended to .ai-agents/learnings/<agentId>.jsonl after task resolution.
 * Injected back into future prompts so the agent learns from past performance.
 */
export interface LearningEntry {
  timestamp: string;
  taskId: string;
  agentId: string;
  /** Short description of what the agent produced (from output.summary) */
  summary: string;
  outcome: LearningOutcome;
  workflow?: LearningWorkflow;
  taskType?: TaskType;
  sourceKind?: TaskSourceKind;
  project?: string;
  rootProjectId?: string;
  parentTaskId?: string;
  stage?: string;
  capabilities?: string[];
  /** Set when the task was reproved; contains the human's feedback */
  reproveReason?: string;
  pipelineId?: string;
  stepIndex?: number;
  provider?: string;
  model?: string;
}

/**
 * Compact context stored in pipeline-state.json and forwarded to subsequent steps.
 * Verbose fields (e.g. `edits` from builder agents) are stripped to avoid token bloat.
 */
export interface PipelineStepContext {
  stepIndex: number;
  agent: string;
  /** Extracted from output.summary or output.implementationSummary */
  summary: string;
  /** Full output minus stripped verbose fields (e.g. edits) */
  keyOutputs: Record<string, unknown>;
  provider?: string;
  model?: string;
  durationMs?: number;
}

export interface PipelineState {
  pipelineId: string;
  currentStep: number;
  completedSteps: PipelineStepContext[];
}

export interface ProviderStageConfig {
  type: ProviderType;
  model: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  apiKey?: string;
  /** @deprecated Use fallbackModels instead */
  fallbackModel?: string;
  fallbackModels?: FallbackModel[];
  autoDiscoverModel?: boolean;
}

export interface GlobalConfig {
  providers: {
    dispatcher: ProviderStageConfig;
    planner?: ProviderStageConfig;
  };
  agentProviders?: Partial<Record<AgentName, ProviderStageConfig>>;
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
  autoApproveThreshold?: number;
  providerOverrides?: Partial<{
    dispatcher: Partial<ProviderStageConfig>;
    planner: Partial<ProviderStageConfig>;
    agents: Partial<Record<AgentName, Partial<ProviderStageConfig>>>;
  }>;
  /** Phase 5 — Webhook delivery configuration */
  webhooks?: {
    enabled: boolean;
    url?: string;
    /** If set, only these event types are delivered */
    events?: string[];
  };
}

export interface ResolvedProjectConfig {
  projectName: string;
  language: string;
  framework: string;
  humanReviewer: string;
  tasksDir: string;
  providers: {
    dispatcher: ProviderStageConfig;
    planner?: ProviderStageConfig;
  };
  agentProviders: Partial<Record<AgentName, ProviderStageConfig>>;
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
    qaPreferences?: {
      e2ePolicy?: E2EPolicy;
      e2eFramework?: E2EFramework;
      objective?: string;
    };
  };
}

export interface TaskCreationMetadata {
  parentTaskId?: string;
  rootProjectId?: string;
  sourceKind?: TaskSourceKind;
  dependsOn?: string[];
  blockedBy?: string[];
  priority?: TaskPriority;
  milestone?: string;
  parallelizable?: boolean;
  ownershipBoundaries?: string[];
  mergeStrategy?: TaskMergeStrategy;
}

export interface StageEnvelope<T = unknown> {
  taskId: string;
  stage: string;
  status: "request" | "done" | "failed";
  createdAt: string;
  agent: AgentName | string;
  inputRef?: string;
  output?: T;
  error?: string;
}

export interface TaskMetaHistoryItem {
  stage: string;
  agent: AgentName | string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "done" | "failed";
  provider?: string;
  model?: string;
  parseRetries?: number;
  validationPassed?: boolean;
  providerAttempts?: number;
  providerBackoffRetries?: number;
  providerBackoffWaitMs?: number;
  providerRateLimitWaitMs?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedCostUsd?: number;
}

export interface TaskMeta {
  taskId: string;
  title: string;
  type: TaskType;
  project: string;
  status: TaskStatus;
  currentStage: string;
  currentAgent: AgentName | string;
  nextAgent: AgentName | string;
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  parentTaskId?: string;
  rootProjectId: string;
  sourceKind: TaskSourceKind;
  dependsOn?: string[];
  blockedBy?: string[];
  priority?: TaskPriority;
  milestone?: string;
  parallelizable?: boolean;
  ownershipBoundaries?: string[];
  mergeStrategy?: TaskMergeStrategy;
  history: TaskMetaHistoryItem[];
  securityAuditRequired?: boolean;
  /** Phase 4.3 — ordered list of agents the Dispatcher suggests for this task */
  suggestedChain?: string[];
}

export interface TimingEntry {
  taskId: string;
  stage: string;
  agent: AgentName | string;
  provider?: string;
  model?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "done" | "failed";
  parseRetries?: number;
  validationPassed?: boolean;
  providerAttempts?: number;
  providerBackoffRetries?: number;
  providerBackoffWaitMs?: number;
  providerRateLimitWaitMs?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedCostUsd?: number;
}

export interface ProviderRequest {
  agent: AgentName | string;
  taskType?: TaskType;
  taskId?: string;
  stage?: string;
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
  providerAttempts: number;
  providerBackoffRetries: number;
  providerBackoffWaitMs: number;
  providerRateLimitWaitMs: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
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
  latencyMs?: number;
}
