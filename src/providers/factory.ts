import type { ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

const providerCache = new Map<string, LlmProvider>();

function isProviderCacheDisabled(): boolean {
  const value = String(process.env.AI_AGENTS_DISABLE_PROVIDER_CACHE || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizeCacheValue(value: string | undefined): string {
  return String(value || "").trim();
}

function buildProviderCacheKey(config: ProviderStageConfig): string {
  if (config.type === "mock") {
    return `mock::${normalizeCacheValue(config.model)}`;
  }

  if (config.type === "openai-compatible") {
    const baseUrlEnv = normalizeCacheValue(config.baseUrlEnv || "AI_AGENTS_OPENAI_BASE_URL");
    const apiKeyEnv = normalizeCacheValue(config.apiKeyEnv || "AI_AGENTS_OPENAI_API_KEY");
    const resolvedBaseUrl = normalizeCacheValue(config.baseUrl || process.env[baseUrlEnv]);
    const resolvedApiKey = normalizeCacheValue(config.apiKey || process.env[apiKeyEnv]);
    return [
      "openai-compatible",
      normalizeCacheValue(config.model),
      baseUrlEnv,
      resolvedBaseUrl,
      apiKeyEnv,
      resolvedApiKey,
    ].join("::");
  }

  return `unsupported::${String((config as { type?: unknown }).type)}`;
}

export function createProvider(config: ProviderStageConfig): LlmProvider {
  if (isProviderCacheDisabled()) {
    if (config.type === "mock") return new MockProvider(config.model);
    if (config.type === "openai-compatible") return new OpenAiCompatibleProvider(config);
    throw new Error(`Unsupported provider type: ${String((config as { type?: unknown }).type)}`);
  }

  const cacheKey = buildProviderCacheKey(config);
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  if (config.type === "mock") {
    const provider = new MockProvider(config.model);
    providerCache.set(cacheKey, provider);
    return provider;
  }

  if (config.type === "openai-compatible") {
    const provider = new OpenAiCompatibleProvider(config);
    providerCache.set(cacheKey, provider);
    return provider;
  }

  throw new Error(`Unsupported provider type: ${String((config as { type?: unknown }).type)}`);
}
