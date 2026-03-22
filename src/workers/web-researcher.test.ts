import { describe, expect, it, vi, beforeEach } from "vitest";
import { ResearcherWorker, researchEnabled } from "./web-researcher.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { createProvider } from "../providers/factory.js";
import { collectSearchResults } from "../lib/research/research-utils.js";
import { envBoolean } from "../lib/env.js";

vi.mock("../lib/config.js", () => ({
  loadPromptFile: vi.fn(),
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("../providers/factory.js", () => ({
  createProvider: vi.fn(),
}));

vi.mock("../lib/research/research-utils.js", () => ({
  buildSearchQueries: vi.fn(() => ["query"]),
  collectSearchResults: vi.fn(),
  resolveResearchWebProvider: vi.fn(() => "duckduckgo"),
  buildSourceList: vi.fn(() => []),
  normalizeConfidence: vi.fn((v) => Number(v)),
  JS_TS_STACK_PATTERN: /js|ts/i,
}));

vi.mock("../lib/env.js", () => ({
  envBoolean: vi.fn(),
}));

vi.mock("../lib/schema.js", () => ({
  researcherOutputSchema: {
    parse: vi.fn((v) => v),
  },
}));

describe("workers/web-researcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("researchEnabled", () => {
    it("delegates to envBoolean", () => {
      vi.mocked(envBoolean).mockReturnValue(true);
      expect(researchEnabled()).toBe(true);
    });
  });

  describe("ResearcherWorker", () => {
    it("runs research flow and returns artifact", async () => {
      const mockProvider = {
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            summary: "Extracted summary",
            sources: [],
            confidence_score: 0.9,
            recommended_action: "Action",
            is_breaking_change: false,
          },
          provider: "openai",
          model: "gpt-4",
        }),
      };
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);
      vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
        providers: { planner: { type: "openai-compatible" } },
      } as any);
      vi.mocked(loadPromptFile).mockResolvedValue("Researcher prompt");
      vi.mocked(collectSearchResults).mockResolvedValue({
        queriesUsed: ["q1"],
        results: [],
      });

      const worker = new ResearcherWorker();
      const artifact = await worker.run({
        taskId: "t1",
        stage: "research",
        requesterAgent: "Dispatcher",
        taskType: "Bug",
        errorContext: "ctx",
        targetTechnology: "ts",
        specificQuestion: "ques",
        maxSearches: 1,
      });

      expect(artifact.stage).toBe("research");
      expect(artifact.output.summary).toBe("Extracted summary");
      expect(mockProvider.generateStructured).toHaveBeenCalled();
    });
  });
});
