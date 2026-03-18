// Researcher worker (web search + LLM synthesis)
// NOTE: This replaces the former legacy `researcher.ts` implementation.
// @ts-nocheck
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { envBoolean, envNumber } from "../lib/env.js";
import { researcherOutputSchema } from "../lib/schema.js";
import { trimText, unique } from "../lib/text-utils.js";
import type { AgentName, ProviderStageConfig, ProviderType, TaskType } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { createProvider } from "../providers/factory.js";

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearcherKnowledgeOutput {
  summary: string;
  sources: ResearchSource[];
  confidence_score: number;
  recommended_action: string;
  is_breaking_change: boolean;
}

interface ResearchSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearcherRunRequest {
  taskId: string;
  stage: string;
  requesterAgent: AgentName;
  taskType: TaskType;
  errorContext: string;
  targetTechnology: string;
  specificQuestion: string;
  maxSearches: number;
}

export interface ResearcherRunArtifact {
  requestedAt: string;
  finishedAt: string;
  stage: string;
  requesterAgent: AgentName;
  taskType: TaskType;
  triggerQuestion: string;
  searchesUsed: number;
  queries: string[];
  searchResults: Array<ResearchSearchResult>;
  output: ResearcherKnowledgeOutput;
  provider: string;
  model: string;
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Name?: string;
    Topics?: Array<{
      Text?: string;
      FirstURL?: string;
    }>;
  }>;
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
}

const JS_TS_STACK_PATTERN = /(javascript|typescript|node|react|next\.js|nextjs|vue|angular|svelte|vite|jest|vitest|playwright|cypress)/i;

function resolveResearchWebProvider(): "duckduckgo" | "tavily" {
  const value = String(process.env.AI_AGENTS_RESEARCH_WEB_PROVIDER || "").trim().toLowerCase();
  if (value === "tavily") return "tavily";
  return "duckduckgo";
}

function resolveMaxSearchResults(): number {
  return envNumber("AI_AGENTS_RESEARCH_MAX_RESULTS", 6, {
    integer: true,
    min: 1,
    max: 12,
  });
}

function resolveSearchTimeoutMs(): number {
  return envNumber("AI_AGENTS_RESEARCH_TIMEOUT_MS", 12_000, {
    integer: true,
    min: 2_000,
    max: 60_000,
  });
}

function isProviderType(value: string): value is ProviderType {
  return value === "mock" || value === "openai-compatible" || value === "lmstudio";
}

function resolveResearchProviderConfig(base: ProviderStageConfig): ProviderStageConfig {
  const envType = String(process.env.AI_AGENTS_RESEARCH_PROVIDER_TYPE || "").trim().toLowerCase();
  const envModel = String(process.env.AI_AGENTS_RESEARCH_MODEL || "").trim();
  const envBaseUrl = String(process.env.AI_AGENTS_RESEARCH_BASE_URL || "").trim();
  const envApiKey = String(process.env.AI_AGENTS_RESEARCH_API_KEY || "").trim();
  const envBaseUrlEnv = String(process.env.AI_AGENTS_RESEARCH_BASE_URL_ENV || "").trim();
  const envApiKeyEnv = String(process.env.AI_AGENTS_RESEARCH_API_KEY_ENV || "").trim();

  return {
    ...base,
    type: isProviderType(envType) ? envType : base.type,
    model: envModel || base.model,
    baseUrl: envBaseUrl || base.baseUrl,
    apiKey: envApiKey || base.apiKey,
    baseUrlEnv: envBaseUrlEnv || base.baseUrlEnv,
    apiKeyEnv: envApiKeyEnv || base.apiKeyEnv,
  };
}

function normalizeUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const next = new URL(raw);
    if (next.protocol !== "http:" && next.protocol !== "https:") return "";
    return next.toString();
  } catch {
    return "";
  }
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function flattenDuckDuckGoTopics(topics: DuckDuckGoResponse["RelatedTopics"]): Array<{ text: string; url: string }> {
  const out: Array<{ text: string; url: string }> = [];
  for (const topic of topics || []) {
    if (Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics) {
        if (typeof nested?.Text === "string" && typeof nested?.FirstURL === "string") {
          out.push({ text: nested.Text, url: nested.FirstURL });
        }
      }
      continue;
    }
    if (typeof topic?.Text === "string" && typeof topic?.FirstURL === "string") {
      out.push({ text: topic.Text, url: topic.FirstURL });
    }
  }
  return out;
}

async function searchWithDuckDuckGo(args: {
  query: string;
  maxResults: number;
  timeoutMs: number;
  preferRecent: boolean;
}): Promise<ResearchSearchResult[]> {
  const url = new URL("https://api.duckduckgo.com/");
  const yearNow = new Date().getUTCFullYear();
  const recentTail = args.preferRecent ? ` ${yearNow - 1} ${yearNow}` : "";
  url.searchParams.set("q", `${args.query}${recentTail}`.trim());
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("no_redirect", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "synx-researcher/5.0",
    },
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}.`);
  }

  const payload = await response.json() as DuckDuckGoResponse;
  const out: ResearchSearchResult[] = [];

  if (payload.AbstractText && payload.AbstractURL) {
    const abstractUrl = normalizeUrl(payload.AbstractURL);
    if (abstractUrl) {
      out.push({
        title: payload.AbstractSource || "DuckDuckGo Abstract",
        url: abstractUrl,
        snippet: trimText(payload.AbstractText, 320),
      });
    }
  }

  for (const topic of flattenDuckDuckGoTopics(payload.RelatedTopics)) {
    const topicUrl = normalizeUrl(topic.url);
    if (!topicUrl) continue;
    out.push({
      title: trimText(topic.text, 90),
      url: topicUrl,
      snippet: trimText(topic.text, 280),
    });
    if (out.length >= args.maxResults) break;
  }

  return out.slice(0, args.maxResults);
}

async function searchWithTavily(args: {
  query: string;
  maxResults: number;
  timeoutMs: number;
  preferRecent: boolean;
}): Promise<ResearchSearchResult[]> {
  const apiKey = String(process.env.AI_AGENTS_RESEARCH_TAVILY_API_KEY || "").trim();
  if (!apiKey) return [];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "synx-researcher/5.0",
    },
    signal: AbortSignal.timeout(args.timeoutMs),
    body: JSON.stringify({
      api_key: apiKey,
      query: args.query,
      search_depth: "basic",
      max_results: args.maxResults,
      topic: "general",
      ...(args.preferRecent ? { days: 365 } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}.`);
  }

  const payload = await response.json() as TavilyResponse;
  const out: ResearchSearchResult[] = [];
  for (const item of payload.results || []) {
    const url = normalizeUrl(item.url || "");
    if (!url) continue;
    out.push({
      title: trimText(item.title || "Untitled result", 120),
      url,
      snippet: trimText(item.content || "", 320),
    });
    if (out.length >= args.maxResults) break;
  }
  return out;
}

function normalizeSearchResults(results: ResearchSearchResult[], maxResults: number): ResearchSearchResult[] {
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

function buildSearchQueries(args: {
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

async function collectSearchResults(args: {
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

function buildSourceList(args: {
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

export class ResearcherWorker {
  async run(request: ResearcherRunRequest): Promise<ResearcherRunArtifact> {
    const requestedAt = nowIso();
    const config = await loadResolvedProjectConfig();
    const providerConfig = resolveResearchProviderConfig(config.providers.planner);
    const provider = createProvider(providerConfig);
    const prompt = await loadPromptFile("researcher.md");

    const queries = buildSearchQueries({
      targetTechnology: request.targetTechnology,
      specificQuestion: request.specificQuestion,
      errorContext: request.errorContext,
      maxSearches: request.maxSearches,
    });

    const searchData = await collectSearchResults({
      queries,
      maxSearches: request.maxSearches,
      targetTechnology: request.targetTechnology,
    });

    const modelInput = {
      requesterAgent: request.requesterAgent,
      taskType: request.taskType,
      stage: request.stage,
      errorContext: request.errorContext,
      targetTechnology: request.targetTechnology,
      specificQuestion: request.specificQuestion,
      recencyPolicy: JS_TS_STACK_PATTERN.test(request.targetTechnology)
        ? "Prioritize guidance and references from the last 12 months when possible."
        : "Prioritize stable and authoritative references.",
      search: {
        queries: searchData.queriesUsed,
        maxSearches: request.maxSearches,
        provider: resolveResearchWebProvider(),
        results: searchData.results,
      },
    };

    const roleContract = buildAgentRoleContract("Researcher", {
      stage: `${request.stage}:research`,
      taskTypeHint: request.taskType,
    });

    const systemPrompt = `${prompt.replace("{{INPUT_JSON}}", JSON.stringify(modelInput, null, 2))}\n\n${roleContract}`;
    const result = await provider.generateStructured({
      agent: "Researcher",
      taskId: request.taskId,
      stage: `${request.stage}:research`,
      taskType: request.taskType,
      systemPrompt,
      input: modelInput,
      expectedJsonSchemaDescription:
        '{ "summary": "string", "sources": [{ "title": "string", "url": "https://..." }], "confidence_score": 0.0, "recommended_action": "string", "is_breaking_change": false }',
    });

    const parsed = researcherOutputSchema.parse(result.parsed);
    const output: ResearcherKnowledgeOutput = {
      summary: trimText(parsed.summary, 500),
      sources: buildSourceList({
        modelSources: parsed.sources,
        fallbackResults: searchData.results,
      }),
      confidence_score: normalizeConfidence(parsed.confidence_score),
      recommended_action: trimText(parsed.recommended_action, 500),
      is_breaking_change: Boolean(parsed.is_breaking_change),
    };

    if (!output.summary) {
      output.summary = "External evidence was collected, but synthesis confidence is low. Validate with targeted runtime checks.";
    }
    if (!output.recommended_action) {
      output.recommended_action = "Inspect the referenced APIs/contracts in source and align implementation with the documented behavior.";
    }

    const finishedAt = nowIso();
    return {
      requestedAt,
      finishedAt,
      stage: request.stage,
      requesterAgent: request.requesterAgent,
      taskType: request.taskType,
      triggerQuestion: request.specificQuestion,
      searchesUsed: searchData.queriesUsed.length,
      queries: searchData.queriesUsed,
      searchResults: searchData.results,
      output,
      provider: result.provider,
      model: result.model,
    };
  }
}

export function researchEnabled(): boolean {
  return envBoolean("AI_AGENTS_RESEARCH_ENABLED", true);
}

