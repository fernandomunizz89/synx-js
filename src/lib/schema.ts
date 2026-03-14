import { z } from "zod";

export const taskTypeSchema = z.enum(["Feature", "Bug", "Refactor", "Research", "Documentation", "Mixed"]);
export const providerTypeSchema = z.enum(["mock", "openai-compatible"]);

export const providerStageConfigSchema = z.object({
  type: providerTypeSchema,
  model: z.string(),
  baseUrlEnv: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
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

export const dispatcherOutputSchema = z.object({
  type: taskTypeSchema,
  goal: z.string(),
  context: z.string(),
  knownFacts: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  constraints: z.array(z.string()),
  requiresHumanInput: z.boolean(),
  nextAgent: z.union([z.literal("Bug Investigator"), z.literal("Spec Planner")]),
});

export const plannerOutputSchema = z.object({
  technicalContext: z.string(),
  knownFacts: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  requiresHumanInput: z.boolean(),
  conditionalPlan: z.array(z.string()),
  edgeCases: z.array(z.string()),
  risks: z.array(z.string()),
  validationCriteria: z.array(z.string()),
  nextAgent: z.literal("Feature Builder"),
});

export const bugInvestigatorOutputSchema = z.object({
  symptomSummary: z.string(),
  knownFacts: z.array(z.string()),
  likelyCauses: z.array(z.string()),
  investigationSteps: z.array(z.string()),
  unknowns: z.array(z.string()),
  nextAgent: z.literal("Bug Fixer"),
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
  changesMade: z.array(z.string()),
  unitTestsAdded: z.array(z.string()).optional().default([]),
  testsToRun: z.array(z.string()),
  risks: z.array(z.string()),
  edits: z.array(builderEditSchema).min(1),
  nextAgent: z.literal("Reviewer"),
});

export const bugFixerOutputSchema = z.object({
  implementationSummary: z.string(),
  filesChanged: z.array(z.string()),
  changesMade: z.array(z.string()),
  unitTestsAdded: z.array(z.string()).optional().default([]),
  testsToRun: z.array(z.string()),
  risks: z.array(z.string()),
  edits: z.array(builderEditSchema).min(1),
  nextAgent: z.literal("Reviewer"),
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
  type: z.enum(["functional", "regression", "integration", "e2e", "unit", "config"]),
  steps: z.array(z.string()).optional().default([]),
  expectedResult: z.string(),
  actualResult: z.string(),
  status: z.enum(["pass", "fail", "blocked"]),
  evidence: z.array(z.string()).optional().default([]),
});

export const qaReturnContextItemSchema = z.object({
  issue: z.string(),
  expectedResult: z.string(),
  receivedResult: z.string(),
  evidence: z.array(z.string()).optional().default([]),
  recommendedAction: z.string().optional().default(""),
});

export const qaReturnHistoryEntrySchema = z.object({
  attempt: z.number().int().positive(),
  returnedAt: z.string(),
  returnedTo: z.union([z.literal("Feature Builder"), z.literal("Bug Fixer")]),
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
  returnedTo: z.union([z.literal("PR Writer"), z.literal("Feature Builder"), z.literal("Bug Fixer")]),
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
  executedChecks: z.array(validationCheckResultSchema).optional().default([]),
  returnContext: z.array(qaReturnContextItemSchema).optional().default([]),
  qaHandoffContext: qaHandoffContextSchema.optional(),
  nextAgent: z.union([z.literal("PR Writer"), z.literal("Feature Builder"), z.literal("Bug Fixer")]),
});

export const prWriterOutputSchema = z.object({
  summary: z.string(),
  whatWasDone: z.array(z.string()),
  testPlan: z.array(z.string()),
  rolloutNotes: z.array(z.string()),
  nextAgent: z.literal("Human Review"),
});
