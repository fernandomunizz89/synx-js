import { z } from "zod";

export const taskTypeSchema = z.enum(["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed", "Project"]);
export const providerTypeSchema = z.enum(["mock", "openai-compatible", "lmstudio", "google", "anthropic"]);
export const taskStatusSchema = z.enum([
  "new",
  "in_progress",
  "waiting_agent",
  "waiting_human",
  "blocked",
  "failed",
  "done",
  "archived",
]);
export const agentNameSchema = z.enum([
  // Orchestration layer
  "Dispatcher",
  "Human Review",
  "Project Orchestrator",
  // Expert Squad
  "Synx Front Expert",
  "Synx Mobile Expert",
  "Synx Back Expert",
  "Synx QA Engineer",
  "Synx SEO Specialist",
  "Synx Code Reviewer",
  "Synx DevOps Expert",
  "Synx Security Auditor",
  "Synx Documentation Writer",
]);
const legacyHistoryAgentSchema = z
  .union([agentNameSchema, z.literal("System"), z.string()])
  .transform<z.infer<typeof agentNameSchema> | string>((value) => (value === "System" ? "Human Review" : value));
const taskMetaCurrentAgentSchema = z
  .union([agentNameSchema, z.literal(""), z.literal("System"), z.literal("[none]"), z.string()])
  .transform<z.infer<typeof agentNameSchema> | string>((value) => {
    if (value === "System" || value === "[none]") return "";
    return value;
  });
export const e2ePolicySchema = z.enum(["auto", "required", "skip"]);
export const e2eFrameworkSchema = z.enum(["auto", "playwright", "other"]);

export const fallbackModelSchema = z.object({
  type: providerTypeSchema,
  model: z.string(),
  baseUrlEnv: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

export const providerStageConfigSchema = z.object({
  type: providerTypeSchema,
  model: z.string(),
  baseUrlEnv: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  fallbackModel: z.string().optional(),
  fallbackModels: z.array(fallbackModelSchema).optional(),
  autoDiscoverModel: z.boolean().optional(),
});

export const agentOutputSchemaSchema = z.enum(["generic", "builder"]);

export const agentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  provider: providerStageConfigSchema,
  outputSchema: agentOutputSchemaSchema,
  defaultNextAgent: z.string().optional(),
});

export const pipelineRoutingSchema = z.enum(["sequential", "dynamic", "conditional"]);

export const pipelineStepSchema = z.object({
  agent: z.string().min(1),
  providerOverride: z.string().optional(),
  providerFallbacks: z.array(z.string()).optional(),
  condition: z.string().optional(),
  defaultNextStep: z.number().int().nonnegative().optional(),
});

export const pipelineDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  routing: pipelineRoutingSchema.default("sequential"),
  steps: z.array(pipelineStepSchema).min(1),
});

export const pipelineStepResultSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  agent: z.string(),
  output: z.record(z.unknown()),
});

export const pipelineStepContextSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  agent: z.string(),
  summary: z.string(),
  keyOutputs: z.record(z.unknown()),
  provider: z.string().optional(),
  model: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const pipelineStateSchema = z.object({
  pipelineId: z.string().min(1),
  currentStep: z.number().int().nonnegative(),
  completedSteps: z.array(pipelineStepContextSchema),
});

export const learningEntrySchema = z.object({
  timestamp: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  summary: z.string(),
  outcome: z.enum(["approved", "reproved"]),
  reproveReason: z.string().optional(),
  pipelineId: z.string().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const genericAgentOutputSchema = z.object({
  summary: z.string(),
  result: z.record(z.unknown()).optional(),
  nextAgent: z.string().optional(),
});

export const globalConfigSchema = z.object({
  providers: z.object({
    dispatcher: providerStageConfigSchema,
    planner: providerStageConfigSchema.optional(),
  }),
  agentProviders: z.record(agentNameSchema, providerStageConfigSchema).optional(),
  defaults: z.object({
    humanReviewer: z.string(),
  }),
});

export const localProjectConfigSchema = z.object({
  projectName: z.string(),
  language: z.string(),
  framework: z.string(),
  humanReviewer: z.string(),
  tasksDir: z.string(),
  autoApproveThreshold: z.number().min(0).max(1).optional(),
  providerOverrides: z.object({
    dispatcher: providerStageConfigSchema.partial().optional(),
    planner: providerStageConfigSchema.partial().optional(),
    agents: z.record(agentNameSchema, providerStageConfigSchema.partial()).optional(),
  }).optional(),
});

export const newTaskInputSchema = z.object({
  title: z.string(),
  typeHint: taskTypeSchema,
  project: z.string(),
  rawRequest: z.string(),
  extraContext: z.object({
    relatedFiles: z.array(z.string()),
    logs: z.array(z.string()),
    notes: z.array(z.string()),
    qaPreferences: z.object({
      e2ePolicy: e2ePolicySchema.optional(),
      e2eFramework: e2eFrameworkSchema.optional(),
      objective: z.string().optional(),
    }).optional(),
  }),
});

export const stageEnvelopeSchema = z.object({
  taskId: z.string(),
  stage: z.string(),
  status: z.enum(["request", "done", "failed"]),
  createdAt: z.string(),
  agent: z.string(),
  inputRef: z.string().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export const taskMetaHistoryItemSchema = z.object({
  stage: z.string(),
  agent: legacyHistoryAgentSchema,
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number(),
  status: z.enum(["done", "failed"]),
  provider: z.string().optional(),
  model: z.string().optional(),
  parseRetries: z.number().optional(),
  validationPassed: z.boolean().optional(),
  providerAttempts: z.number().optional(),
  providerBackoffRetries: z.number().optional(),
  providerBackoffWaitMs: z.number().optional(),
  providerRateLimitWaitMs: z.number().optional(),
  estimatedInputTokens: z.number().optional(),
  estimatedOutputTokens: z.number().optional(),
  estimatedTotalTokens: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
});

export const taskMetaSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  type: taskTypeSchema,
  project: z.string(),
  status: taskStatusSchema,
  currentStage: z.string(),
  currentAgent: taskMetaCurrentAgentSchema,
  nextAgent: taskMetaCurrentAgentSchema,
  humanApprovalRequired: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  history: z.array(taskMetaHistoryItemSchema),
});

export const dispatcherOutputSchema = z.object({
  type: taskTypeSchema,
  goal: z.string(),
  context: z.string(),
  knownFacts: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  constraints: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1).optional(),
  requiresHumanInput: z.boolean(),
  // Conditional Planning – Dream Stack 2026
  // When nextAgent === "Spec Planner", targetExpert tells the planner
  // which domain expert to hand off to after decomposing the task.
  targetExpert: z.union([
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
  ]).optional(),
  securityAuditRequired: z.boolean().optional(),
  nextAgent: z.union([
    // Dream Stack 2026 – Expert Squad routing
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx QA Engineer"),
    z.literal("Synx SEO Specialist"),
    z.literal("Synx DevOps Expert"),
    z.literal("Synx Documentation Writer"),
  ]),
});

export const plannerOutputSchema = z.object({
  technicalContext: z.string(),
  knownFacts: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1).optional(),
  requiresHumanInput: z.boolean(),
  conditionalPlan: z.array(z.string()),
  edgeCases: z.array(z.string()),
  risks: z.array(z.string()),
  validationCriteria: z.array(z.string()),
  // Planner routes to the specific expert identified by Dispatcher
  nextAgent: z.union([
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
  ]),
});

const riskLevelSchema = z.enum(["low", "medium", "high", "unknown"]);

const investigationRiskAssessmentSchema = z.object({
  buildRisk: riskLevelSchema.default("unknown"),
  syntaxRisk: riskLevelSchema.default("unknown"),
  logicRisk: riskLevelSchema.default("unknown"),
  integrationRisk: riskLevelSchema.default("unknown"),
  regressionRisk: riskLevelSchema.default("unknown"),
});

const implementationRiskAssessmentSchema = z.object({
  buildRisk: riskLevelSchema.default("unknown"),
  syntaxRisk: riskLevelSchema.default("unknown"),
  importExportRisk: riskLevelSchema.default("unknown"),
  typingRisk: riskLevelSchema.default("unknown"),
  logicRisk: riskLevelSchema.default("unknown"),
  integrationRisk: riskLevelSchema.default("unknown"),
  regressionRisk: riskLevelSchema.default("unknown"),
});

const qaTechnicalRiskSummarySchema = z.object({
  buildRisk: riskLevelSchema.default("unknown"),
  syntaxRisk: riskLevelSchema.default("unknown"),
  importExportRisk: riskLevelSchema.default("unknown"),
  referenceRisk: riskLevelSchema.default("unknown"),
  logicRisk: riskLevelSchema.default("unknown"),
  regressionRisk: riskLevelSchema.default("unknown"),
});

export const bugInvestigatorOutputSchema = z.object({
  symptomSummary: z.string(),
  knownFacts: z.array(z.string()),
  likelyCauses: z.array(z.string()),
  investigationSteps: z.array(z.string()),
  unknowns: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1).optional(),
  suspectFiles: z.array(z.string()).optional().default([]),
  suspectAreas: z.array(z.string()).optional().default([]),
  primaryHypothesis: z.string().optional().default(""),
  secondaryHypotheses: z.array(z.string()).optional().default([]),
  riskAssessment: investigationRiskAssessmentSchema.optional().default({
    buildRisk: "unknown",
    syntaxRisk: "unknown",
    logicRisk: "unknown",
    integrationRisk: "unknown",
    regressionRisk: "unknown",
  }),
  builderChecks: z.array(z.string()).optional().default([]),
  handoffNotes: z.array(z.string()).optional().default([]),
  nextAgent: z.union([
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
    z.literal("Bug Investigator"),
    z.literal("Human Review"),
  ]),
});

export const researcherOutputSchema = z.object({
  summary: z.string(),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
  })).optional().default([]),
  confidence_score: z.number().min(0).max(1),
  recommended_action: z.string(),
  is_breaking_change: z.boolean(),
});

export const builderEditSchema = z.object({
  path: z.string().min(1),
  action: z.enum(["create", "replace", "replace_snippet", "delete"]),
  content: z.string().optional(),
  find: z.string().optional(),
  replace: z.string().optional(),
}).superRefine((value, context) => {
  if ((value.action === "create" || value.action === "replace") && typeof value.content !== "string") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "content is required for create/replace actions",
      path: ["content"],
    });
  }

  if (value.action === "replace_snippet") {
    if (typeof value.find !== "string" || !value.find.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "find is required for replace_snippet",
        path: ["find"],
      });
    }
    if (typeof value.replace !== "string") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "replace is required for replace_snippet",
        path: ["replace"],
      });
    }
  }
});

export const builderOutputSchema = z.object({
  implementationSummary: z.string(),
  filesChanged: z.array(z.string()),
  impactedFiles: z.array(z.string()).optional().default([]),
  changesMade: z.array(z.string()),
  unitTestsAdded: z.array(z.string()).optional().default([]),
  testsToRun: z.array(z.string()),
  technicalRisks: z.array(z.string()).optional().default([]),
  riskAssessment: implementationRiskAssessmentSchema.optional().default({
    buildRisk: "unknown",
    syntaxRisk: "unknown",
    importExportRisk: "unknown",
    typingRisk: "unknown",
    logicRisk: "unknown",
    integrationRisk: "unknown",
    regressionRisk: "unknown",
  }),
  reviewFocus: z.array(z.string()).optional().default([]),
  manualValidationNeeded: z.array(z.string()).optional().default([]),
  residualRisks: z.array(z.string()).optional().default([]),
  verificationMode: z.enum(["static_review", "executed_checks", "mixed"]).optional().default("static_review"),
  risks: z.array(z.string()),
  edits: z.array(builderEditSchema).min(1),
  nextAgent: agentNameSchema,
});

export const validationCheckResultSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  stdoutPreview: z.string(),
  stderrPreview: z.string(),
  diagnostics: z.array(z.string()).optional().default([]),
  qaConfigNotes: z.array(z.string()).optional().default([]),
  artifacts: z.array(z.string()).optional().default([]),
});

export const qaTestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  scenario: z.string(),
  expected: z.string(),
  status: z.enum(["pending", "passed", "failed", "skipped"]),
});

export const qaReturnContextItemSchema = z.object({
  issue: z.string(),
  expectedResult: z.string(),
  receivedResult: z.string(),
  evidence: z.array(z.string()).optional().default([]),
  recommendedAction: z.string(),
});

export const qaReturnHistoryEntrySchema = z.object({
  attempt: z.number().int().positive(),
  returnedAt: z.string(),
  returnedTo: z.union([
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
    z.literal("Human Review"),
  ]),
  summary: z.string(),
  failures: z.array(z.string()).optional().default([]),
  findings: z.array(qaReturnContextItemSchema).optional().default([]),
});

export const qaCumulativeFindingSchema = qaReturnContextItemSchema.extend({
  firstSeenAttempt: z.number().int().positive(),
  lastSeenAttempt: z.number().int().positive(),
  occurrences: z.number().int().positive(),
});

export const qaHandoffContextSchema = z.object({
  attempt: z.number().int().positive(),
  maxRetries: z.number().int().positive(),
  returnedTo: z.union([
    z.literal("Human Review"),
    // Expert Squad
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
  ]),
  summary: z.string(),
  latestFindings: z.array(qaReturnContextItemSchema).optional().default([]),
  cumulativeFindings: z.array(qaCumulativeFindingSchema).optional().default([]),
  history: z.array(qaReturnHistoryEntrySchema).optional().default([]),
});

export const qaOutputSchema = z.object({
  mainScenarios: z.array(z.string()),
  acceptanceChecklist: z.array(z.string()),
  testCases: z.array(qaTestCaseSchema).optional().default([]),
  failures: z.array(z.string()),
  verdict: z.enum(["pass", "fail"]),
  e2ePlan: z.array(z.string()).optional().default([]),
  changedFiles: z.array(z.string()).optional().default([]),
  filesReviewed: z.array(z.string()).optional().default([]),
  validationMode: z.enum(["static_review", "executed_checks", "mixed"]).optional().default("executed_checks"),
  technicalRiskSummary: qaTechnicalRiskSummarySchema.optional().default({
    buildRisk: "unknown",
    syntaxRisk: "unknown",
    importExportRisk: "unknown",
    referenceRisk: "unknown",
    logicRisk: "unknown",
    regressionRisk: "unknown",
  }),
  recommendedChecks: z.array(z.string()).optional().default([]),
  manualValidationNeeded: z.array(z.string()).optional().default([]),
  residualRisks: z.array(z.string()).optional().default([]),
  executedChecks: z.array(validationCheckResultSchema).optional().default([]),
  returnContext: z.array(qaReturnContextItemSchema).optional().default([]),
  qaHandoffContext: qaHandoffContextSchema.optional(),
  nextAgent: z.union([
    z.literal("Human Review"),
    // Expert Squad return routing
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
  ]),
});

export const codeReviewIssueSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  rule: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const codeReviewOutputSchema = z.object({
  reviewPassed: z.boolean(),
  issues: z.array(codeReviewIssueSchema).default([]),
  summary: z.string(),
  blockedReason: z.string().optional(),
});

export type CodeReviewOutput = z.infer<typeof codeReviewOutputSchema>;

export const securityAuditVulnerabilitySchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  cve: z.string().optional(),
  category: z.string().optional(),
  description: z.string(),
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  fix: z.string(),
});

export const securityAuditOutputSchema = z.object({
  auditPassed: z.boolean(),
  vulnerabilities: z.array(securityAuditVulnerabilitySchema).default([]),
  summary: z.string(),
  blockedReason: z.string().optional(),
  owaspCategories: z.array(z.string()).default([]),
});

export type SecurityAuditOutput = z.infer<typeof securityAuditOutputSchema>;

// Legacy agent output schemas were removed.
