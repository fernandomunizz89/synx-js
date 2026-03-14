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
