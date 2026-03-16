import { describe, expect, it } from "vitest";
import {
  agentNameSchema,
  bugFixerOutputSchema,
  bugInvestigatorOutputSchema,
  builderOutputSchema,
  plannerOutputSchema,
  qaOutputSchema,
  taskMetaSchema,
  taskTypeSchema,
} from "./schema.js";

describe("schema", () => {
  it("accepts valid task and agent enums", () => {
    expect(taskTypeSchema.parse("Feature")).toBe("Feature");
    expect(taskTypeSchema.parse("Bug")).toBe("Bug");
    expect(agentNameSchema.parse("QA Validator")).toBe("QA Validator");
  });

  it("rejects invalid task enum value", () => {
    expect(() => taskTypeSchema.parse("InvalidType")).toThrow();
  });

  it("normalizes legacy system agent values in taskMeta", () => {
    const parsed = taskMetaSchema.parse({
      taskId: "task-20260316-abcd-sample",
      title: "Sample",
      type: "Feature",
      project: "sample-project",
      status: "in_progress",
      currentStage: "qa",
      currentAgent: "[none]",
      nextAgent: "System",
      humanApprovalRequired: false,
      createdAt: "2026-03-16T10:00:00.000Z",
      updatedAt: "2026-03-16T10:01:00.000Z",
      history: [
        {
          stage: "human-review",
          agent: "System",
          startedAt: "2026-03-16T10:00:00.000Z",
          endedAt: "2026-03-16T10:01:00.000Z",
          durationMs: 60_000,
          status: "done",
        },
      ],
    });

    expect(parsed.currentAgent).toBe("");
    expect(parsed.nextAgent).toBe("");
    expect(parsed.history[0]?.agent).toBe("Human Review");

    const parsedNormal = taskMetaSchema.parse({
      ...parsed,
      currentAgent: "Dispatcher",
    });
    expect(parsedNormal.currentAgent).toBe("Dispatcher");
  });

  it("validates builder output for create and replace_snippet edit actions", () => {
    const createParsed = builderOutputSchema.parse({
      implementationSummary: "Created feature file",
      filesChanged: ["src/feature.ts"],
      changesMade: ["Added src/feature.ts"],
      testsToRun: ["npm run check"],
      risks: [],
      edits: [
        {
          path: "src/feature.ts",
          action: "create",
          content: "export const feature = true;\n",
        },
      ],
      nextAgent: "Reviewer",
    });
    expect(createParsed.edits[0]?.action).toBe("create");

    const snippetParsed = builderOutputSchema.parse({
      implementationSummary: "Adjusted snippet",
      filesChanged: ["src/feature.ts"],
      changesMade: ["Replaced snippet"],
      testsToRun: ["npm run check"],
      risks: [],
      edits: [
        {
          path: "src/feature.ts",
          action: "replace_snippet",
          find: "feature = false",
          replace: "feature = true",
        },
      ],
      nextAgent: "Reviewer",
    });
    expect(snippetParsed.edits[0]?.action).toBe("replace_snippet");
  });

  it("rejects invalid replace_snippet builder edit without find", () => {
    expect(() => builderOutputSchema.parse({
      implementationSummary: "Broken edit",
      filesChanged: ["src/feature.ts"],
      changesMade: ["Attempted replace"],
      testsToRun: ["npm run check"],
      risks: [],
      edits: [
        {
          path: "src/feature.ts",
          action: "replace_snippet",
          replace: "feature = true",
        },
      ],
      nextAgent: "Reviewer",
    })).toThrow();
  });

  it("parses QA output with defaults and optional handoff context", () => {
    const passParsed = qaOutputSchema.parse({
      mainScenarios: ["User can start timer"],
      acceptanceChecklist: ["Timer starts when clicking start"],
      failures: [],
      verdict: "pass",
      nextAgent: "PR Writer",
    });
    expect(passParsed.validationMode).toBe("executed_checks");
    expect(passParsed.testCases).toEqual([]);

    const failParsed = qaOutputSchema.parse({
      mainScenarios: ["User can start timer"],
      acceptanceChecklist: ["Timer starts when clicking start"],
      failures: ["Timer does not decrement"],
      verdict: "fail",
      returnContext: [
        {
          issue: "Timer logic broken",
          expectedResult: "Timer should decrement every second",
          receivedResult: "Timer stays static",
          evidence: ["src/hooks/useTimer.ts:42"],
          recommendedAction: "Fix interval update logic",
        },
      ],
      qaHandoffContext: {
        attempt: 1,
        maxRetries: 3,
        returnedTo: "Feature Builder",
        summary: "Need correction in timer state update",
        latestFindings: [],
        cumulativeFindings: [],
        history: [],
      },
      nextAgent: "Feature Builder",
    });
    expect(failParsed.qaHandoffContext?.returnedTo).toBe("Feature Builder");
    expect(failParsed.returnContext[0]?.issue).toBe("Timer logic broken");
  });

  it("validates planner output schema correctly", () => {
    const valid = plannerOutputSchema.parse({
      technicalContext: "Next.js app",
      knownFacts: ["Uses React"],
      unknowns: [],
      assumptions: [],
      requiresHumanInput: false,
      conditionalPlan: ["Build it"],
      edgeCases: [],
      risks: [],
      validationCriteria: ["Looks good"],
      nextAgent: "Feature Builder",
    });
    expect(valid.nextAgent).toBe("Feature Builder");

    expect(() => plannerOutputSchema.parse({
      technicalContext: "Next.js app",
      // Missing knownFacts
      unknowns: [],
      assumptions: [],
      requiresHumanInput: false,
      conditionalPlan: ["Build it"],
      edgeCases: [],
      risks: [],
      validationCriteria: ["Looks good"],
      nextAgent: "Feature Builder",
    })).toThrow();
  });

  it("validates bug investigator output schema correctly", () => {
    const defaultRisk = bugInvestigatorOutputSchema.parse({
      symptomSummary: "Crash on load",
      knownFacts: [],
      likelyCauses: ["Null pointer"],
      investigationSteps: ["Check logs"],
      unknowns: [],
      nextAgent: "Bug Fixer",
    });
    expect(defaultRisk.riskAssessment.buildRisk).toBe("unknown"); // Checks default applies
    expect(defaultRisk.nextAgent).toBe("Bug Fixer");
  });

  it("validates bug fixer output schema correctly", () => {
    const valid = bugFixerOutputSchema.parse({
      implementationSummary: "Fixed null check",
      filesChanged: ["src/app.ts"],
      changesMade: ["Added if(var)"],
      testsToRun: ["npm test"],
      risks: [],
      edits: [
        {
          path: "src/app.ts",
          action: "replace",
          content: "if(val) {}",
        },
      ],
      nextAgent: "Reviewer",
    });
    expect(valid.edits[0].action).toBe("replace");

    expect(() => bugFixerOutputSchema.parse({
      implementationSummary: "Forgot edits array",
      filesChanged: ["src/app.ts"],
      changesMade: [],
      testsToRun: [],
      risks: [],
      edits: [], // Must be min 1
      nextAgent: "Reviewer",
    })).toThrow();
  });

  it("rejects invalid create builder edit without content", () => {
    expect(() => builderOutputSchema.parse({
      implementationSummary: "Broken create",
      filesChanged: ["src/feature.ts"],
      changesMade: ["Attempted create"],
      testsToRun: [],
      risks: [],
      edits: [
        {
          path: "src/feature.ts",
          action: "create",
        },
      ],
      nextAgent: "Reviewer",
    })).toThrow();
  });

  it("rejects invalid replace_snippet builder edit without replace", () => {
    expect(() => builderOutputSchema.parse({
      implementationSummary: "Broken replace",
      filesChanged: ["src/feature.ts"],
      changesMade: ["Attempted replace"],
      testsToRun: [],
      risks: [],
      edits: [
        {
          path: "src/feature.ts",
          action: "replace_snippet",
          find: "old snippet",
        },
      ],
      nextAgent: "Reviewer",
    })).toThrow();
  });
});
