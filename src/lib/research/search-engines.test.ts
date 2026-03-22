import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeUrl, flattenDuckDuckGoTopics, searchWithDuckDuckGo, searchWithTavily } from "./search-engines.js";

// Mock global fetch
global.fetch = vi.fn();

describe("lib/research/search-engines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeUrl", () => {
    it("returns valid http/https urls", () => {
      expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
      expect(normalizeUrl("ftp://example.com")).toBe("");
      expect(normalizeUrl("not-a-url")).toBe("");
    });
  });

  describe("flattenDuckDuckGoTopics", () => {
    it("extracts nested topics", () => {
      const topics = [
        { Text: "T1", FirstURL: "U1" },
        { Topics: [{ Text: "T2", FirstURL: "U2" }] },
      ] as any;
      const flattened = flattenDuckDuckGoTopics(topics);
      expect(flattened).toEqual([
        { text: "T1", url: "U1" },
        { text: "T2", url: "U2" },
      ]);
    });
  });

  describe("searchWithDuckDuckGo", () => {
    it("fetches and parses DDG response", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AbstractText: "Summary",
          AbstractURL: "https://summary.com",
          RelatedTopics: [{ Text: "Topic", FirstURL: "https://topic.com" }],
        }),
      } as any);

      const results = await searchWithDuckDuckGo({ query: "test", maxResults: 5, timeoutMs: 1000, preferRecent: false });
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("DuckDuckGo Abstract");
      expect(results[1].url).toBe("https://topic.com/");
    });
  });

  describe("searchWithTavily", () => {
    it("skips if no api key", async () => {
      delete process.env.AI_AGENTS_RESEARCH_TAVILY_API_KEY;
      const results = await searchWithTavily({ query: "test", maxResults: 5, timeoutMs: 1000, preferRecent: false });
      expect(results).toEqual([]);
    });

    it("fetches and parses Tavily response", async () => {
      process.env.AI_AGENTS_RESEARCH_TAVILY_API_KEY = "test-key";
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: "R1", url: "https://r1.com", content: "C1" }],
        }),
      } as any);

      const results = await searchWithTavily({ query: "test", maxResults: 5, timeoutMs: 1000, preferRecent: false });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("R1");
    });
  });
});
