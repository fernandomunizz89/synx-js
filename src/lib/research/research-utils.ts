import { envNumber } from "../env.js";
import { trimText, unique } from "../text-utils.js";
import { normalizeUrl, searchWithDuckDuckGo, searchWithTavily, type ResearchSearchResult } from "./search-engines.js";

export const JS_TS_STACK_PATTERN = /(javascript|typescript|node|react|next\.js|nextjs|vue|angular|svelte|vite|jest|vitest|playwright|cypress)/i;

export interface ResearchSource {
  title: string;
  url: string;
}

export function resolveResearchWebProvider(): "duckduckgo" | "tavily" {
  const value = String(process.env.AI_AGENTS_RESEARCH_WEB_PROVIDER || "").trim().toLowerCase();
  if (value === "tavily") return "tavily";
  return "duckduckgo";
}

export function resolveMaxSearchResults(): number {
  return envNumber("AI_AGENTS_RESEARCH_MAX_RESULTS", 6, {
    integer: true,
    min: 1,
    max: 12,
  });
}

export function resolveSearchTimeoutMs(): number {
  return envNumber("AI_AGENTS_RESEARCH_TIMEOUT_MS", 12_000, {
    integer: true,
    min: 2_000,
    max: 60_000,
  });
}

export function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeSearchResults(results: ResearchSearchResult[], maxResults: number): ResearchSearchResult[] {
  const seen = new Set<string>();
  const out: ResearchSearchResult[] = [];
  for (const result of results) {
    const url = normalizeUrl(result.url);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: trimText(result.title || "Untitled result", 120),
      url,
      snippet: trimText(result.snippet || "", 320),
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

export function buildSearchQueries(args: {
  targetTechnology: string;
  specificQuestion: string;
  errorContext: string;
  maxSearches: number;
}): string[] {
  const first = `${args.targetTechnology} ${args.specificQuestion}`.trim();
  const second = `${args.targetTechnology} ${args.errorContext}`.trim();
  const third = args.specificQuestion.trim();
  return unique([first, second, third]).slice(0, Math.max(1, args.maxSearches));
}

export async function collectSearchResults(args: {
  queries: string[];
  maxSearches: number;
  targetTechnology: string;
}): Promise<{ queriesUsed: string[]; results: ResearchSearchResult[] }> {
  const timeoutMs = resolveSearchTimeoutMs();
  const maxResults = resolveMaxSearchResults();
  const preferRecent = JS_TS_STACK_PATTERN.test(args.targetTechnology);
  const provider = resolveResearchWebProvider();
  const queriesUsed: string[] = [];
  const merged: ResearchSearchResult[] = [];

  for (const query of args.queries.slice(0, Math.max(1, args.maxSearches))) {
    queriesUsed.push(query);
    try {
      const batch = provider === "tavily"
        ? await searchWithTavily({ query, maxResults, timeoutMs, preferRecent })
        : await searchWithDuckDuckGo({ query, maxResults, timeoutMs, preferRecent });
      merged.push(...batch);
    } catch {
      if (provider === "tavily") {
        try {
          const fallback = await searchWithDuckDuckGo({ query, maxResults, timeoutMs, preferRecent });
          merged.push(...fallback);
        } catch {
          // keep partial results from other queries
        }
      }
    }
  }

  return {
    queriesUsed,
    results: normalizeSearchResults(merged, maxResults),
  };
}

export function buildSourceList(args: {
  modelSources: ResearchSource[];
  fallbackResults: ResearchSearchResult[];
}): ResearchSource[] {
  const modelSources = normalizeSearchResults(
    args.modelSources.map((item) => ({ title: item.title, url: item.url, snippet: "" })),
    6,
  ).map((item) => ({ title: item.title, url: item.url }));

  if (modelSources.length) return modelSources;

  return args.fallbackResults
    .slice(0, 6)
    .map((item) => ({
      title: trimText(item.title, 120),
      url: item.url,
    }));
}
