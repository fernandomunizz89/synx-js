import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadResolvedProjectConfig: vi.fn(),
  loadPromptFile: vi.fn(),
  createProvider: vi.fn(),
  generateStructured: vi.fn(),
}));

vi.mock("../lib/config.js", () => ({
  loadResolvedProjectConfig: mocks.loadResolvedProjectConfig,
  loadPromptFile: mocks.loadPromptFile,
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: mocks.createProvider,
}));

import { ResearcherWorker } from "./researcher.js";

describe("workers/researcher", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    delete process.env.AI_AGENTS_RESEARCH_WEB_PROVIDER;
    delete process.env.AI_AGENTS_RESEARCH_TAVILY_API_KEY;

    mocks.loadResolvedProjectConfig.mockResolvedValue({
      projectName: "repo",
      language: "TypeScript",
      framework: "React",
      humanReviewer: "Fernando",
      tasksDir: ".ai-agents/tasks",
      providers: {
        dispatcher: { type: "mock", model: "mock-dispatcher" },
        planner: { type: "mock", model: "mock-planner" },
      },
    });
    mocks.loadPromptFile.mockResolvedValue("Research prompt {{INPUT_JSON}}");
    mocks.generateStructured.mockResolvedValue({
      parsed: {
        summary: "Use official docs first.",
        sources: [],
        confidence_score: 0.86,
        recommended_action: "Align API usage with documented hook signature.",
        is_breaking_change: false,
      },
      provider: "mock",
      model: "mock-research",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCostUsd: 0,
    });
    mocks.createProvider.mockReturnValue({
      generateStructured: mocks.generateStructured,
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        AbstractText: "Official guide for hook exports.",
        AbstractURL: "https://example.com/official-doc",
        AbstractSource: "Official Docs",
        RelatedTopics: [
          {
            Text: "StackOverflow discussion about export mismatch",
            FirstURL: "https://stackoverflow.com/questions/1",
          },
          {
            Text: "GitHub issue for module export mismatch",
            FirstURL: "https://github.com/org/repo/issues/1",
          },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects web evidence and returns structured research artifact", async () => {
    const worker = new ResearcherWorker();
    const artifact = await worker.run({
      taskId: "task-1",
      stage: "builder",
      requesterAgent: "Feature Builder",
      taskType: "Feature",
      errorContext: "Import/export mismatch around useTimer hook",
      targetTechnology: "TypeScript React",
      specificQuestion: "What is the correct export/import shape for this hook in current React+TS patterns?",
      maxSearches: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const providerRequest = mocks.generateStructured.mock.calls[0]?.[0];
    expect(providerRequest.agent).toBe("Researcher");
    expect(providerRequest.stage).toBe("builder:research");

    expect(artifact.searchesUsed).toBe(1);
    expect(artifact.queries.length).toBe(1);
    expect(artifact.searchResults.length).toBeGreaterThan(0);
    expect(artifact.output.summary).toContain("official docs");
    expect(artifact.output.sources.length).toBeGreaterThan(0);
    expect(artifact.output.sources[0]?.url).toMatch(/^https:\/\//);
    expect(artifact.output.confidence_score).toBe(0.86);
    expect(artifact.provider).toBe("mock");
  });

  it("falls back to conservative recommendation when provider fields are sparse", async () => {
    mocks.generateStructured.mockResolvedValueOnce({
      parsed: {
        summary: "",
        sources: [],
        confidence_score: 0.1,
        recommended_action: "",
        is_breaking_change: false,
      },
      provider: "mock",
      model: "mock-research",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCostUsd: 0,
    });

    const worker = new ResearcherWorker();
    const artifact = await worker.run({
      taskId: "task-2",
      stage: "bug-fixer",
      requesterAgent: "Bug Fixer",
      taskType: "Bug",
      errorContext: "runtime error",
      targetTechnology: "TypeScript",
      specificQuestion: "How should this runtime error be debugged?",
      maxSearches: 1,
    });

    expect(artifact.output.summary.length).toBeGreaterThan(0);
    expect(artifact.output.recommended_action.length).toBeGreaterThan(0);
  });
});
