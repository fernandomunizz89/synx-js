import { z } from "zod";

export const taskTypeSchema = z.enum(["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed"]);
export const providerTypeSchema = z.enum(["mock", "openai-compatible", "lmstudio"]);
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
  "Dispatcher",
  "Spec Planner",
  "Bug Investigator",
  "Bug Fixer",
  "Feature Builder",
  "Researcher",
  "Reviewer",
  "QA Validator",
  "PR Writer",
  "Human Review",
  // Dream Stack 2026 – Expert Squad
  "Synx Front Expert",
  "Synx Mobile Expert",
  "Synx Back Expert",
  "Synx QA Engineer",
  "Synx SEO Specialist",
]);
const legacyHistoryAgentSchema = z
  .union([agentNameSchema, z.literal("System")])
  .transform<z.infer<typeof agentNameSchema>>((value) => (value === "System" ? "Human Review" : value));
const taskMetaCurrentAgentSchema = z
  .union([agentNameSchema, z.literal(""), z.literal("System"), z.literal("[none]")])
  .transform<z.infer<typeof agentNameSchema> | "">((value) => {
    if (value === "System" || value === "[none]") return "";
    return value;
  });
export const e2ePolicySchema = z.enum(["auto", "required", "skip"]);
export const e2eFrameworkSchema = z.enum(["auto", "playwright", "other"]);

export const providerStageConfigSchema = z.object({
  type: providerTypeSchema,
  model: z.string(),
  baseUrlEnv: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  fallbackModel: z.string().optional(),
  autoDiscoverModel: z.boolean().optional(),
});

export const globalConfigSchema = z.object({
  providers: z.object({
    dispatcher: providerStageConfigSchema,
    planner: providerStageConfigSchema,
  }),
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
  providerOverrides: z.object({
    dispatcher: providerStageConfigSchema.partial().optional(),
    planner: providerStageConfigSchema.partial().optional(),
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
  agent: agentNameSchema,
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
    z.literal("Feature Builder"),
  ]).optional(),
  nextAgent: z.union([
    z.literal("Bug Investigator"),
    z.literal("Spec Planner"),
    // Dream Stack 2026 – Expert Squad routing
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx QA Engineer"),
    z.literal("Synx SEO Specialist"),
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
  // Dream Stack 2026 – Planner routes to the specific expert identified by Dispatcher
  nextAgent: z.union([
    z.literal("Feature Builder"),
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
  nextAgent: z.literal("Bug Fixer"),
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

export const bugFixerOutputSchema = z.object({
  implementationSummary: z.string(),
  filesChanged: z.array(z.string()),
  changesMade: z.array(z.string()),
  unitTestsAdded: z.array(z.string()).optional().default([]),
  testsToRun: z.array(z.string()),
  risks: z.array(z.string()),
  edits: z.array(builderEditSchema).min(1),
  nextAgent: agentNameSchema,
});

export const reviewerOutputSchema = z.object({
  whatLooksGood: z.array(z.string()),
  issuesFound: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  verdict: z.enum(["approved", "needs_changes"]),
  nextAgent: z.literal("QA Validator"),
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
    z.literal("Feature Builder"),
    z.literal("Bug Fixer"),
    // Dream Stack 2026 – Expert Squad
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Synx SEO Specialist"),
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
    z.literal("PR Writer"),
    z.literal("Feature Builder"),
    z.literal("Bug Fixer"),
    // Dream Stack 2026 – Expert Squad
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
    z.literal("PR Writer"),
    z.literal("Feature Builder"),
    z.literal("Bug Fixer"),
    // Dream Stack 2026 – Expert Squad return routing
    z.literal("Synx Front Expert"),
    z.literal("Synx Mobile Expert"),
    z.literal("Synx Back Expert"),
    z.literal("Human Review"),
  ]),
});

export const prWriterOutputSchema = z.object({
  summary: z.string(),
  whatWasDone: z.array(z.string()),
  testPlan: z.array(z.string()),
  rolloutNotes: z.array(z.string()),
  nextAgent: z.literal("Human Review"),
});
