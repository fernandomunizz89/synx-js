import type { ProviderStageConfig } from "./types.js";

export const DEFAULT_LM_STUDIO_BASE_URL = "http://127.0.0.1:1234";
export const DEFAULT_LM_STUDIO_API_KEY = "lm-studio-local";
export const DEFAULT_LM_STUDIO_BASE_URL_ENV = "AI_AGENTS_LMSTUDIO_BASE_URL";
export const DEFAULT_LM_STUDIO_API_KEY_ENV = "AI_AGENTS_LMSTUDIO_API_KEY";
export const LM_STUDIO_MODEL_OVERRIDE_ENV = "AI_AGENTS_LMSTUDIO_MODEL";
export const LM_STUDIO_FALLBACK_MODEL_ENV = "AI_AGENTS_LMSTUDIO_FALLBACK_MODEL";
export const LM_STUDIO_AUTODISCOVER_MODEL_ENV = "AI_AGENTS_LMSTUDIO_AUTODISCOVER_MODEL";

function normalizeBool(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return null;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function isAutoModelToken(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "" || normalized === "auto";
}

export function normalizeLmStudioApiBaseUrl(rawBaseUrl: string): string {
  const normalized = normalizeBaseUrl(rawBaseUrl);
  if (!normalized) return `${DEFAULT_LM_STUDIO_BASE_URL}/v1`;
  if (/\/v1$/i.test(normalized)) return normalized;
  return `${normalized}/v1`;
}

function resolveBaseUrlFromEnv(baseUrlEnv: string): string {
  const fromPrimary = String(process.env[baseUrlEnv] || "").trim();
  if (fromPrimary) return fromPrimary;
  const fromOpenAiCompat = String(process.env.AI_AGENTS_OPENAI_BASE_URL || "").trim();
  if (fromOpenAiCompat) return fromOpenAiCompat;
  return DEFAULT_LM_STUDIO_BASE_URL;
}

function resolveApiKeyFromEnv(apiKeyEnv: string): string {
  const fromPrimary = String(process.env[apiKeyEnv] || "").trim();
  if (fromPrimary) return fromPrimary;
  const fromOpenAiCompat = String(process.env.AI_AGENTS_OPENAI_API_KEY || "").trim();
  if (fromOpenAiCompat) return fromOpenAiCompat;
  return DEFAULT_LM_STUDIO_API_KEY;
}

export interface LmStudioRuntimeSettings {
  configuredModel: string;
  fallbackModel: string;
  autoDiscoverModel: boolean;
  baseUrlRoot: string;
  baseUrlApi: string;
  apiKey: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
}

export function resolveLmStudioRuntimeSettings(config: ProviderStageConfig): LmStudioRuntimeSettings {
  const baseUrlEnv = config.baseUrlEnv || DEFAULT_LM_STUDIO_BASE_URL_ENV;
  const apiKeyEnv = config.apiKeyEnv || DEFAULT_LM_STUDIO_API_KEY_ENV;
  const baseUrlRaw = (config.baseUrl || resolveBaseUrlFromEnv(baseUrlEnv)).trim() || DEFAULT_LM_STUDIO_BASE_URL;
  const apiKeyRaw = (config.apiKey || resolveApiKeyFromEnv(apiKeyEnv)).trim() || DEFAULT_LM_STUDIO_API_KEY;

  const envConfiguredModel = String(process.env[LM_STUDIO_MODEL_OVERRIDE_ENV] || "").trim();
  const configuredModel = envConfiguredModel || String(config.model || "").trim() || "auto";
  const envAutoDiscover = normalizeBool(String(process.env[LM_STUDIO_AUTODISCOVER_MODEL_ENV] || ""));
  const autoDiscoverModel = envAutoDiscover === null
    ? (typeof config.autoDiscoverModel === "boolean" ? config.autoDiscoverModel : isAutoModelToken(configuredModel))
    : envAutoDiscover;

  const envFallbackModel = String(process.env[LM_STUDIO_FALLBACK_MODEL_ENV] || "").trim();
  const fallbackModel = envFallbackModel || String(config.fallbackModel || "").trim();

  const baseUrlRoot = normalizeBaseUrl(baseUrlRaw) || DEFAULT_LM_STUDIO_BASE_URL;
  const baseUrlApi = normalizeLmStudioApiBaseUrl(baseUrlRoot);

  return {
    configuredModel,
    fallbackModel,
    autoDiscoverModel,
    baseUrlRoot,
    baseUrlApi,
    apiKey: apiKeyRaw,
    baseUrlEnv,
    apiKeyEnv,
  };
}

export function toLmStudioBridgeProviderConfig(config: ProviderStageConfig, model: string): ProviderStageConfig {
  const resolved = resolveLmStudioRuntimeSettings(config);
  return {
    type: "openai-compatible",
    model,
    baseUrl: resolved.baseUrlApi,
    apiKey: resolved.apiKey,
    baseUrlEnv: resolved.baseUrlEnv,
    apiKeyEnv: resolved.apiKeyEnv,
  };
}
