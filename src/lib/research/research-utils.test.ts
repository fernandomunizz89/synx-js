import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveResearchWebProvider, normalizeConfidence, normalizeSearchResults, buildSearchQueries, collectSearchResults, buildSourceList } from "./research-utils.js";
import { searchWithDuckDuckGo, searchWithTavily } from "./search-engines.js";

vi.mock("./search-engines.js", () => ({
  normalizeUrl: vi.fn((url) => url),
  searchWithDuckDuckGo: vi.fn(),
  searchWithTavily: vi.fn(),
}));

describe("lib/research/research-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_AGENTS_RESEARCH_WEB_PROVIDER;
  });

  describe("resolveResearchWebProvider", () => {
    it("defaults to duckduckgo", () => {
      expect(resolveResearchWebProvider()).toBe("duckduckgo");
    });
    it("can be set to tavily", () => {
      process.env.AI_AGENTS_RESEARCH_WEB_PROVIDER = "tavily";
      expect(resolveResearchWebProvider()).toBe("tavily");
    });
  });

  describe("normalizeConfidence", () => {
    it("clamps value between 0 and 1", () => {
      expect(normalizeConfidence(0.5)).toBe(0.5);
      expect(normalizeConfidence(1.5)).toBe(1);
      expect(normalizeConfidence(-0.5)).toBe(0);
      expect(normalizeConfidence("invalid")).toBe(0.5);
    });
  });

  describe("normalizeSearchResults", () => {
    it("removes duplicates and trims text", () => {
      const results = [
        { title: "A", url: "http://a.com", snippet: "S1" },
        { title: "A", url: "http://a.com", snippet: "S2" },
        { title: "B", url: "http://b.com", snippet: "S3" },
      ] as any;
      const normalized = normalizeSearchResults(results, 5);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].url).toBe("http://a.com");
    });
  });

  describe("buildSearchQueries", () => {
    it("creates queries from tech and context", () => {
      const queries = buildSearchQueries({
        targetTechnology: "React",
        specificQuestion: "How to use hooks?",
        errorContext: "Invalid hook call",
        maxSearches: 2,
      });
      expect(queries).toHaveLength(2);
      expect(queries).toContain("React How to use hooks?");
    });
  });

  describe("collectSearchResults", () => {
    it("calls search provider for each query", async () => {
      vi.mocked(searchWithDuckDuckGo).mockResolvedValue([{ title: "Res", url: "http://res.com", snippet: "snip" }]);
      const data = await collectSearchResults({
        queries: ["q1", "q2"],
        maxSearches: 2,
        targetTechnology: "Node",
      });
      expect(data.queriesUsed).toHaveLength(2);
      expect(data.results).toHaveLength(1); // dupe removed by url
    });
  });
});
