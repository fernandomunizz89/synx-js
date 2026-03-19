import { trimText } from "../text-utils.js";

export interface ResearchSearchResult {
  title: string;
  url: string;
  snippet: string;
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

export function normalizeUrl(value: string): string {
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

export function flattenDuckDuckGoTopics(topics: DuckDuckGoResponse["RelatedTopics"]): Array<{ text: string; url: string }> {
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

export async function searchWithDuckDuckGo(args: {
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

export async function searchWithTavily(args: {
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
