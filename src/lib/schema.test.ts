import { describe, expect, it } from "vitest";
import {
  agentNameSchema,
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
    });
    expect(parsedNormal.currentAgent).toBe("Dispatcher");
  });

  it("parses QA output with defaults and optional handoff context", () => {
    const passParsed = qaOutputSchema.parse({
      mainScenarios: ["User can start timer"],
      acceptanceChecklist: ["Timer starts when clicking start"],
      failures: [],
      verdict: "pass",
      nextAgent: "Human Review",
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
