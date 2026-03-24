import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskMeta } from "./types.js";

const mocks = vi.hoisted(() => ({
  loadTaskArtifact: vi.fn(),
  saveTaskArtifact: vi.fn(),
  loadTaskMeta: vi.fn(),
  saveTaskMeta: vi.fn(),
  logTaskEvent: vi.fn(),
  logDaemon: vi.fn(),
  researcherRun: vi.fn(),
  researchEnabled: vi.fn(),
}));

vi.mock("./task-artifacts.js", () => ({
  ARTIFACT_FILES: {
    projectProfile: "project-profile.json",
    bugBrief: "bug-brief.json",
    featureBrief: "feature-brief.json",
    symbolContract: "symbol-contract.json",
    researchLog: "research-log.json",
    researchContext: "research-context.json",
  },
  loadTaskArtifact: mocks.loadTaskArtifact,
  saveTaskArtifact: mocks.saveTaskArtifact,
}));

vi.mock("./task.js", () => ({
  loadTaskMeta: mocks.loadTaskMeta,
  saveTaskMeta: mocks.saveTaskMeta,
}));

vi.mock("./logging.js", () => ({
  logTaskEvent: mocks.logTaskEvent,
  logDaemon: mocks.logDaemon,
}));

vi.mock("../workers/web-researcher.js", () => ({
  ResearcherWorker: class {
    run = mocks.researcherRun;
  },
  researchEnabled: mocks.researchEnabled,
}));

import { requestResearchContext, formatResearchContextTag } from "./orchestrator.js";

function buildMeta(): TaskMeta {
  return {
    taskId: "task-1",
    title: "Task",
    type: "Bug",
    project: "repo",
    status: "in_progress",
    currentStage: "synx-back-expert",
    currentAgent: "Synx Back Expert",
    nextAgent: "Synx QA Engineer",
    humanApprovalRequired: false,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
    rootProjectId: "task-1",
    sourceKind: "standalone",
    history: [],
  };
}

describe("orchestrator research coordination", () => {
  const artifacts = new Map<string, unknown>();
  const meta = buildMeta();

  beforeEach(() => {
    vi.clearAllMocks();
    artifacts.clear();

    mocks.researchEnabled.mockReturnValue(true);
    mocks.loadTaskArtifact.mockImplementation(async (taskId: string, fileName: string) => {
      const key = `${taskId}:${fileName}`;
      return artifacts.has(key) ? artifacts.get(key) : null;
    });
    mocks.saveTaskArtifact.mockImplementation(async (taskId: string, fileName: string, payload: unknown) => {
      artifacts.set(`${taskId}:${fileName}`, payload);
    });

    mocks.loadTaskMeta.mockImplementation(async () => ({ ...meta }));
    mocks.saveTaskMeta.mockResolvedValue(undefined);
    mocks.logTaskEvent.mockResolvedValue(undefined);
    mocks.logDaemon.mockResolvedValue(undefined);

    mocks.researcherRun.mockResolvedValue({
      requestedAt: "2026-03-16T00:00:00.000Z",
      finishedAt: "2026-03-16T00:00:01.000Z",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      triggerQuestion: "question",
      searchesUsed: 1,
      queries: ["query"],
      searchResults: [
        {
          title: "Official docs",
          url: "https://example.com/docs",
          snippet: "details",
        },
      ],
      output: {
        summary: "Use documented import/export shape.",
        sources: [
          {
            title: "Official docs",
            url: "https://example.com/docs",
          },
        ],
        confidence_score: 0.81,
        recommended_action: "Align named export and re-run typecheck.",
        is_breaking_change: false,
      },
      provider: "mock",
      model: "mock-research",
    });
  });

  it("skips research when triggers are not present", async () => {
    const result = await requestResearchContext({
      taskId: "task-1",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      previousStage: { output: { confidenceScore: 0.9 } },
      errorContext: "some context",
      targetTechnology: "TypeScript",
      specificQuestion: "what should we do",
      repeatedIssues: [],
    });

    expect(result.status).toBe("not_triggered");
    expect(result.context).toBeNull();
    expect(mocks.researcherRun).not.toHaveBeenCalled();
  });

  it("runs researcher when confidence is below threshold and stores context", async () => {
    const result = await requestResearchContext({
      taskId: "task-1",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      previousStage: { output: { confidenceScore: 0.42 } },
      errorContext: "Uncaught SyntaxError export mismatch",
      targetTechnology: "TypeScript React",
      specificQuestion: "How to fix import/export mismatch in React hook?",
      repeatedIssues: [],
    });

    expect(result.status).toBe("provided");
    expect(result.reusedContext).toBe(false);
    expect(result.context?.recommendedAction).toContain("Align named export");
    expect(mocks.researcherRun).toHaveBeenCalledTimes(1);

    const savedLog = artifacts.get("task-1:research-log.json") as { entries: unknown[] };
    expect(Array.isArray(savedLog.entries)).toBe(true);
    expect(savedLog.entries.length).toBe(1);

    const savedContext = artifacts.get("task-1:research-context.json") as { summary: string };
    expect(savedContext.summary).toContain("Use documented import/export shape.");
  });

  it("reuses last context when budget is exhausted for the same stage", async () => {
    artifacts.set("task-1:research-log.json", {
      version: 1,
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-16T00:00:00.000Z",
          stage: "synx-back-expert",
          requesterAgent: "Synx Back Expert",
          taskType: "Bug",
          triggerReasons: ["low_confidence:0.50"],
          errorSignature: "sig",
          searchesUsed: 2,
          queries: ["q1", "q2"],
          output: {
            summary: "existing context",
            sources: [{ title: "Doc", url: "https://example.com/doc" }],
            confidence_score: 0.7,
            recommended_action: "existing action",
            is_breaking_change: false,
          },
          provider: "mock",
          model: "mock",
          repeatedRecommendationDetected: false,
        },
      ],
    });
    artifacts.set("task-1:research-context.json", {
      summary: "existing context",
      sources: [{ title: "Doc", url: "https://example.com/doc" }],
      confidenceScore: 0.7,
      recommendedAction: "existing action",
      isBreakingChange: false,
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      triggerReasons: ["low_confidence:0.50"],
    });

    const result = await requestResearchContext({
      taskId: "task-1",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      previousStage: { output: { confidenceScore: 0.5 } },
      errorContext: "same",
      targetTechnology: "TypeScript",
      specificQuestion: "same",
      repeatedIssues: [],
    });

    expect(result.status).toBe("provided");
    expect(result.reusedContext).toBe(true);
    expect(result.context?.recommendedAction).toBe("existing action");
    expect(mocks.researcherRun).not.toHaveBeenCalled();
  });

  it("triggers anti-loop abort when recommendation repeats with recurring issue", async () => {
    const first = await requestResearchContext({
      taskId: "task-1",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      previousStage: { output: { confidenceScore: 0.4 } },
      errorContext: "same error signature",
      targetTechnology: "TypeScript",
      specificQuestion: "how to resolve this recurring issue",
      repeatedIssues: ["hook export mismatch"],
    });
    expect(first.status).toBe("provided");

    const second = await requestResearchContext({
      taskId: "task-1",
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      taskType: "Bug",
      previousStage: { output: { confidenceScore: 0.4 } },
      errorContext: "same error signature",
      targetTechnology: "TypeScript",
      specificQuestion: "how to resolve this recurring issue",
      repeatedIssues: ["hook export mismatch"],
    });

    expect(second.status).toBe("abort_to_human");
    expect(second.abortReason).toContain("same recommendation");
    expect(second.context?.recommendedAction).toContain("Align named export");
    expect(mocks.researcherRun).toHaveBeenCalledTimes(2);
  });

  it("formats research context tag for prompt handoff", () => {
    const tag = formatResearchContextTag({
      summary: "Summary",
      sources: [{ title: "Doc", url: "https://example.com/doc" }],
      confidenceScore: 0.62,
      recommendedAction: "Do action",
      isBreakingChange: true,
      stage: "synx-back-expert",
      requesterAgent: "Synx Back Expert",
      triggerReasons: ["low_confidence:0.58"],
    });

    expect(tag).toContain("Summary: Summary");
    expect(tag).toContain("Confidence: 0.62");
    expect(tag).toContain("https://example.com/doc");
  });
});
