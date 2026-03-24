import { describe, expect, it } from "vitest";
import {
  agentNameSchema,
  agentDefinitionSchema,
  dispatcherOutputSchema,
  fallbackModelSchema,
  localProjectConfigSchema,
  providerStageConfigSchema,
  qaOutputSchema,
  taskMetaSchema,
  taskTypeSchema,
} from "./schema.js";

describe("schema", () => {
  it("accepts valid task and agent enums", () => {
    expect(taskTypeSchema.parse("Feature")).toBe("Feature");
    expect(taskTypeSchema.parse("Bug")).toBe("Bug");
    expect(agentNameSchema.parse("Synx QA Engineer")).toBe("Synx QA Engineer");
    expect(agentNameSchema.parse("Human Review")).toBe("Human Review");
    expect(agentNameSchema.parse("Project Orchestrator")).toBe("Project Orchestrator");
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
      updatedAt: "2026-03-16T10:01:00:000Z",
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
      priority: 5,
      dependsOn: ["task-1"],
      blockedBy: ["task-1"],
      parallelizable: false,
    });
    expect(parsedNormal.currentAgent).toBe("Dispatcher");
    expect(parsedNormal.priority).toBe(5);
    expect(parsedNormal.blockedBy).toEqual(["task-1"]);
    expect(parsedNormal.parallelizable).toBe(false);
  });

  it("parses fallbackModelSchema", () => {
    const valid = fallbackModelSchema.parse({ type: "anthropic", model: "claude-3-5-sonnet" });
    expect(valid.type).toBe("anthropic");
    expect(valid.model).toBe("claude-3-5-sonnet");

    const withExtras = fallbackModelSchema.parse({
      type: "openai-compatible",
      model: "gpt-4o",
      baseUrlEnv: "MY_BASE_URL",
      apiKeyEnv: "MY_API_KEY",
      baseUrl: "http://localhost:8080",
      apiKey: "sk-test",
    });
    expect(withExtras.baseUrl).toBe("http://localhost:8080");

    expect(() => fallbackModelSchema.parse({ type: "unsupported-type", model: "m" })).toThrow();
  });

  it("parses providerStageConfigSchema with fallbackModels", () => {
    const config = providerStageConfigSchema.parse({
      type: "mock",
      model: "primary",
      fallbackModels: [
        { type: "anthropic", model: "claude-3-5-sonnet" },
        { type: "openai-compatible", model: "gpt-4o", baseUrl: "http://localhost" },
      ],
    });
    expect(config.fallbackModels).toHaveLength(2);
    expect(config.fallbackModels?.[0]?.type).toBe("anthropic");
  });

  it("parses localProjectConfigSchema with autoApproveThreshold", () => {
    const base = {
      projectName: "test",
      language: "TypeScript",
      framework: "Next.js",
      humanReviewer: "Alice",
      tasksDir: ".tasks",
    };

    const withThreshold = localProjectConfigSchema.parse({ ...base, autoApproveThreshold: 0.9 });
    expect(withThreshold.autoApproveThreshold).toBe(0.9);

    const withoutThreshold = localProjectConfigSchema.parse(base);
    expect(withoutThreshold.autoApproveThreshold).toBeUndefined();

    expect(() => localProjectConfigSchema.parse({ ...base, autoApproveThreshold: 1.5 })).toThrow();
    expect(() => localProjectConfigSchema.parse({ ...base, autoApproveThreshold: -0.1 })).toThrow();
  });

  it("parses agent capabilities in custom agent definitions", () => {
    const parsed = agentDefinitionSchema.parse({
      id: "backend-specialist",
      name: "Backend Specialist",
      prompt: ".ai-agents/prompts/backend-specialist.md",
      provider: { type: "mock", model: "static-mock" },
      outputSchema: "builder",
      capabilities: {
        domain: ["backend", "api"],
        frameworks: ["Node"],
        languages: ["TypeScript"],
        taskTypes: ["Feature", "Bug", "Refactor"],
        riskProfile: "high",
        preferredVerificationModes: ["integration_tests", "security_checks"],
      },
    });

    expect(parsed.capabilities?.domain).toEqual(["backend", "api"]);
    expect(parsed.capabilities?.riskProfile).toBe("high");
  });

  it("accepts dispatcher nextAgent as a generic specialist name", () => {
    const parsed = dispatcherOutputSchema.parse({
      type: "Feature",
      goal: "Implement API endpoint",
      context: "Backend work",
      knownFacts: [],
      unknowns: [],
      assumptions: [],
      constraints: [],
      requiresHumanInput: false,
      nextAgent: "Backend Specialist",
    });
    expect(parsed.nextAgent).toBe("Backend Specialist");
  });

  it("parses QA output with defaults and optional handoff context", () => {
    const passParsed = qaOutputSchema.parse({
      mainScenarios: ["User can start timer"],
      acceptanceChecklist: ["Timer starts when clicking start"],
      failures: [],
      verdict: "pass",
      nextAgent: "Synx Release Manager",
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
        returnedTo: "Synx Front Expert",
        summary: "Need correction in timer state update",
        latestFindings: [],
        cumulativeFindings: [],
        history: [],
      },
      nextAgent: "Synx Front Expert",
    });
    expect(failParsed.qaHandoffContext?.returnedTo).toBe("Synx Front Expert");
    expect(failParsed.returnContext[0]?.issue).toBe("Timer logic broken");
  });
});
