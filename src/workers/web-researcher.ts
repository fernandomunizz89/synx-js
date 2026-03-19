// Researcher worker (web search + LLM synthesis)
// NOTE: This replaces the former legacy `researcher.ts` implementation.
// @ts-nocheck
import { buildAgentRoleContract } from "../lib/agent-role-contract.js";
import { loadPromptFile, loadResolvedProjectConfig } from "../lib/config.js";
import { envBoolean } from "../lib/env.js";
import { researcherOutputSchema } from "../lib/schema.js";
import { trimText } from "../lib/text-utils.js";
import type { AgentName, ProviderStageConfig, ProviderType, TaskType } from "../lib/types.js";
import { nowIso } from "../lib/utils.js";
import { createProvider } from "../providers/factory.js";
import {
  buildSearchQueries,
  buildSourceList,
  collectSearchResults,
  JS_TS_STACK_PATTERN,
  normalizeConfidence,
  resolveResearchWebProvider,
  type ResearchSource,
} from "../lib/research/research-utils.js";
import type { ResearchSearchResult } from "../lib/research/search-engines.js";

export { ResearchSource };

export interface ResearcherKnowledgeOutput {
  summary: string;
  sources: ResearchSource[];
  confidence_score: number;
  recommended_action: string;
  is_breaking_change: boolean;
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
