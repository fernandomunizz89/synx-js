import type { FallbackModel, ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import { LmStudioProvider } from "./lmstudio-provider.js";
import { GoogleProvider } from "./google-provider.js";
import { AnthropicProvider, DEFAULT_ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL_ENV, DEFAULT_ANTHROPIC_API_KEY_ENV } from "./anthropic-provider.js";
import { resolveLmStudioRuntimeSettings } from "../lib/lmstudio.js";

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

  if (config.type === "google") {
    const baseUrlEnv = normalizeCacheValue(config.baseUrlEnv || "AI_AGENTS_GOOGLE_BASE_URL");
    const apiKeyEnv = normalizeCacheValue(config.apiKeyEnv || "AI_AGENTS_GOOGLE_API_KEY");
    const resolvedBaseUrl = normalizeCacheValue(config.baseUrl || process.env[baseUrlEnv]);
    const resolvedApiKey = normalizeCacheValue(config.apiKey || process.env[apiKeyEnv]);
    return [
      "google",
      normalizeCacheValue(config.model),
      baseUrlEnv,
      resolvedBaseUrl,
      apiKeyEnv,
      resolvedApiKey,
    ].join("::");
  }

  if (config.type === "anthropic") {
    const baseUrlEnv = normalizeCacheValue(config.baseUrlEnv || DEFAULT_ANTHROPIC_BASE_URL_ENV);
    const apiKeyEnv = normalizeCacheValue(config.apiKeyEnv || DEFAULT_ANTHROPIC_API_KEY_ENV);
    const resolvedBaseUrl = normalizeCacheValue(config.baseUrl || process.env[baseUrlEnv] || DEFAULT_ANTHROPIC_BASE_URL);
    const resolvedApiKey = normalizeCacheValue(config.apiKey || process.env[apiKeyEnv]);
    return [
      "anthropic",
      normalizeCacheValue(config.model),
      baseUrlEnv,
      resolvedBaseUrl,
      apiKeyEnv,
      resolvedApiKey,
    ].join("::");
  }

  if (config.type === "lmstudio") {
    const resolved = resolveLmStudioRuntimeSettings(config);
    return [
      "lmstudio",
      normalizeCacheValue(resolved.configuredModel || "auto"),
      normalizeCacheValue(resolved.fallbackModel || ""),
      String(resolved.autoDiscoverModel),
      normalizeCacheValue(resolved.baseUrlRoot),
      normalizeCacheValue(resolved.apiKey),
      normalizeCacheValue(resolved.baseUrlEnv),
      normalizeCacheValue(resolved.apiKeyEnv),
    ].join("::");
  }

  return `unsupported::${String((config as { type?: unknown }).type)}`;
}

export function createProvider(config: ProviderStageConfig): LlmProvider {
  if (isProviderCacheDisabled()) {
    if (config.type === "mock") return new MockProvider(config.model);
    if (config.type === "openai-compatible") return new OpenAiCompatibleProvider(config);
    if (config.type === "lmstudio") return new LmStudioProvider(config);
    if (config.type === "google") return new GoogleProvider(config);
    if (config.type === "anthropic") return new AnthropicProvider(config);
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

  if (config.type === "lmstudio") {
    const provider = new LmStudioProvider(config);
    providerCache.set(cacheKey, provider);
    return provider;
  }

  if (config.type === "google") {
    const provider = new GoogleProvider(config);
    providerCache.set(cacheKey, provider);
    return provider;
  }

  if (config.type === "anthropic") {
    const provider = new AnthropicProvider(config);
    providerCache.set(cacheKey, provider);
    return provider;
  }

  throw new Error(`Unsupported provider type: ${String((config as { type?: unknown }).type)}`);
}

/**
 * Returns true for errors that should trigger a fallback attempt.
 * Non-recoverable errors (auth failures, bad requests, invalid model) are re-thrown immediately.
 */
function isRecoverableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const e = error as { transient?: boolean; statusCode?: number; errorCode?: string; code?: string; message?: string };

  // If the provider tagged the error as transient, it's recoverable
  if (e.transient === true) return true;
  if (e.transient === false) {
    // Known non-recoverable error codes
    const nonRecoverable = new Set(["task_cancelled", "invalid_request_config"]);
    if (e.errorCode && nonRecoverable.has(e.errorCode)) return false;
    // 400 errors that are not rate-limit are non-recoverable
    if (e.statusCode === 400 || e.statusCode === 401 || e.statusCode === 403) return false;
    // Auth / invalid model
    if (e.statusCode === 404) return false;
  }

  // Network-level errors are always recoverable
  const recoverableCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"]);
  if (e.code && recoverableCodes.has(String(e.code))) return true;

  // HTTP status: 503, 429, 408 etc. are recoverable
  const recoverableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  if (typeof e.statusCode === "number" && recoverableStatuses.has(e.statusCode)) return true;

  // If we have no transient marker and no status, default to recoverable to give fallback a chance
  return true;
}

/**
 * Resolve the effective list of fallback model configs from a ProviderStageConfig.
 * Handles backward compat: if `fallbackModel` (string) is set but `fallbackModels` is not,
 * synthesizes a single-entry list preserving the primary provider type.
 */
export function resolveFallbackModels(config: ProviderStageConfig): FallbackModel[] {
  if (config.fallbackModels && config.fallbackModels.length > 0) {
    return config.fallbackModels;
  }
  if (config.fallbackModel) {
    return [
      {
        type: config.type,
        model: config.fallbackModel,
        baseUrlEnv: config.baseUrlEnv,
        apiKeyEnv: config.apiKeyEnv,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      },
    ];
  }
  return [];
}

/**
 * Execute a provider request with automatic fallback.
 * Iterates over fallbackModels when the primary provider fails with a recoverable error.
 */
export async function executeWithFallback(
  config: ProviderStageConfig,
  request: ProviderRequest,
): Promise<ProviderResult> {
  const primary = createProvider(config);
  try {
    return await primary.generateStructured(request);
  } catch (primaryError) {
    if (!isRecoverableError(primaryError)) {
      throw primaryError;
    }

    const fallbacks = resolveFallbackModels(config);
    if (fallbacks.length === 0) {
      throw primaryError;
    }

    let lastError: unknown = primaryError;
    for (const fallback of fallbacks) {
      const fallbackConfig: ProviderStageConfig = {
        type: fallback.type,
        model: fallback.model,
        baseUrlEnv: fallback.baseUrlEnv,
        apiKeyEnv: fallback.apiKeyEnv,
        baseUrl: fallback.baseUrl,
        apiKey: fallback.apiKey,
      };
      console.warn(
        `[synx] Primary provider ${config.type}/${config.model} failed. Trying fallback: ${fallback.type}/${fallback.model}`,
      );
      const fallbackProvider = createProvider(fallbackConfig);
      try {
        return await fallbackProvider.generateStructured(request);
      } catch (fallbackError) {
        if (!isRecoverableError(fallbackError)) {
          throw fallbackError;
        }
        lastError = fallbackError;
      }
    }

    throw lastError;
  }
}
