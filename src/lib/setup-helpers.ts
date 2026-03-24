import { discoverProviderModels } from "./provider-health.js";
import { selectOption, promptTextWithDefault, promptRequiredText } from "./interactive.js";
import { choosePreferredDiscoveredModel, findDiscoveredModelMatch } from "./model-support.js";
import { providerHealthToHuman } from "./human-messages.js";
import { isAutoModelToken } from "./lmstudio.js";
import type { ProviderHealth, ProviderStageConfig } from "./types.js";

export type OpenAiCompatiblePreset = "openai" | "openrouter" | "remote-lmstudio" | "custom";

export const DEFAULT_LM_STUDIO_BASE_URL_ENV = "AI_AGENTS_LMSTUDIO_BASE_URL";
export const DEFAULT_LM_STUDIO_API_KEY_ENV = "AI_AGENTS_LMSTUDIO_API_KEY";
export const DEFAULT_BASE_URL_ENV = "AI_AGENTS_OPENAI_BASE_URL";
export const DEFAULT_API_KEY_ENV = "AI_AGENTS_OPENAI_API_KEY";

export interface OpenAiCompatiblePresetConfig {
  label: string;
  baseUrl: string;
  defaultBaseUrlEnv: string;
  defaultApiKeyEnv: string;
  apiKeyLabel: string;
  modelExamples: string[];
}

export function isProviderHealthy(health: ProviderHealth): boolean {
  return health.reachable && (health.modelFound ?? true);
}

export function defaultOpenAiCompatibleFields(): Pick<ProviderStageConfig, "baseUrlEnv" | "apiKeyEnv"> {
  return {
    baseUrlEnv: DEFAULT_BASE_URL_ENV,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
  };
}

export function resolveOpenAiCompatiblePreset(preset: OpenAiCompatiblePreset): OpenAiCompatiblePresetConfig {
  switch (preset) {
    case "openai":
      return {
        label: "OpenAI API (cloud)",
        baseUrl: "https://api.openai.com/v1",
        defaultBaseUrlEnv: "OPENAI_BASE_URL",
        defaultApiKeyEnv: "OPENAI_API_KEY",
        apiKeyLabel: "OpenAI API key",
        modelExamples: ["gpt-5.3-codex", "gpt-5", "gpt-4.1"],
      };
    case "openrouter":
      return {
        label: "OpenRouter (cloud multi-model gateway)",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultBaseUrlEnv: "OPENROUTER_BASE_URL",
        defaultApiKeyEnv: "OPENROUTER_API_KEY",
        apiKeyLabel: "OpenRouter API key",
        modelExamples: ["anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.6", "qwen/qwen3.5-plus"],
      };
    case "remote-lmstudio":
      return {
        label: "Remote LM Studio (local network)",
        baseUrl: "http://192.168.31.112:1234/v1",
        defaultBaseUrlEnv: DEFAULT_BASE_URL_ENV,
        defaultApiKeyEnv: DEFAULT_API_KEY_ENV,
        apiKeyLabel: "API key (dummy value is fine)",
        modelExamples: [],
      };
    case "custom":
    default:
      return {
        label: "Custom OpenAI-compatible endpoint",
        baseUrl: "http://127.0.0.1:1234/v1",
        defaultBaseUrlEnv: DEFAULT_BASE_URL_ENV,
        defaultApiKeyEnv: DEFAULT_API_KEY_ENV,
        apiKeyLabel: "API key",
        modelExamples: [],
      };
  }
}

export function printSetupFixHints(label: string, health: ProviderHealth, config: ProviderStageConfig): void {
  const lower = health.message.toLowerCase();
  console.log(`\nHow to fix ${label}:`);

  if (lower.includes("missing provider base url") || lower.includes("missing environment variable")) {
    console.log("1. Re-run setup and choose a saved connection (recommended).");
    console.log(`2. Or define ${config.baseUrlEnv || DEFAULT_BASE_URL_ENV} in this same terminal.`);
    console.log("3. Run setup again to validate before start.");
    return;
  }

  if (lower.includes("econnrefused") || lower.includes("fetch failed")) {
    console.log(`1. Start the provider server at ${config.baseUrl || "<configured base URL>"}.`);
    console.log("2. Make sure endpoint responds to /models.");
    console.log("3. Retry setup validation.");
    return;
  }

  if (lower.includes("returned no models") || lower.includes("no model is currently loaded") || lower.includes("no model is loaded")) {
    console.log("1. Load at least one model in the provider.");
    console.log("2. Retry setup and select the detected model.");
    return;
  }

  if (lower.includes("configured model was not found")) {
    console.log("1. Choose one model from the detected list.");
    console.log("2. If needed, pull/load the model in provider first.");
    return;
  }

  if (lower.includes("provider answered with 401") || lower.includes("provider answered with 403")) {
    console.log("1. Check API key value.");
    console.log("2. Confirm endpoint is correct.");
    console.log("3. Retry setup validation.");
    return;
  }

  console.log("1. Review provider endpoint and model.");
  console.log("2. Retry setup and validate again.");
}

export async function chooseOpenAiCompatibleModel(config: ProviderStageConfig, manualExamples: string[] = []): Promise<string> {
  const discovery = await discoverProviderModels(config);
  const suggestedManualModel = isAutoModelToken(config.model) ? "" : (config.model || "").trim();

  if (discovery.reachable && discovery.models.length) {
    const manualEntryToken = "__manual-model-entry__";
    const preferredChoice = choosePreferredDiscoveredModel(discovery.models, suggestedManualModel);
    const defaultModelChoice = preferredChoice || discovery.models[0];
    const model = await selectOption<string>(
      "Choose model",
      [
        ...discovery.models.map((item) => ({ value: item, label: item })),
        { value: manualEntryToken, label: "Type model name manually" },
      ],
      defaultModelChoice
    );

    if (model !== manualEntryToken) return model;

    const typedModel = suggestedManualModel
      ? await promptTextWithDefault("Model name (required):", suggestedManualModel)
      : await promptRequiredText("Model name (required):");
    const matched = findDiscoveredModelMatch(typedModel, discovery.models);
    if (matched && !matched.exact && matched.matchedModel !== typedModel.trim()) {
      console.log(`Model alias resolved to discovered id: ${matched.matchedModel}`);
      return matched.matchedModel;
    }
    return typedModel.trim();
  } else {
    console.log(`\nModel discovery note: ${providerHealthToHuman(discovery.message)}`);
    if (config.type === "openai-compatible" && !config.baseUrl) {
      console.log(`Tip: choose saved connection details in setup to avoid exporting ${config.baseUrlEnv || DEFAULT_BASE_URL_ENV}.`);
    }

    if (manualExamples.length) {
      const manualEntryToken = "__manual-model-entry__";
      const defaultChoice = suggestedManualModel && manualExamples.includes(suggestedManualModel)
        ? suggestedManualModel
        : manualExamples[0];
      const model = await selectOption<string>(
        "Choose model (or type manually)",
        [
          ...manualExamples.map((m) => ({ value: m, label: m })),
          { value: manualEntryToken, label: "Type model name manually" },
        ],
        defaultChoice
      );
      if (model !== manualEntryToken) return model;
    } else {
      console.log("You can still continue by typing the model manually.");
    }
  }

  if (suggestedManualModel) {
    return promptTextWithDefault("Model name (required):", suggestedManualModel);
  }
  return promptRequiredText("Model name (required):");
}
