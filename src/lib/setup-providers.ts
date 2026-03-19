import { selectOption, promptTextWithDefault, promptRequiredText } from "./interactive.js";
import {
  DEFAULT_LM_STUDIO_API_KEY,
  DEFAULT_LM_STUDIO_BASE_URL,
  isAutoModelToken,
} from "./lmstudio.js";
import {
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_ANTHROPIC_BASE_URL_ENV,
  DEFAULT_ANTHROPIC_API_KEY_ENV,
} from "../providers/anthropic-provider.js";
import type { GlobalConfig, ProviderStageConfig } from "./types.js";
import {
  chooseOpenAiCompatibleModel,
  defaultOpenAiCompatibleFields,
  DEFAULT_LM_STUDIO_API_KEY_ENV,
  DEFAULT_LM_STUDIO_BASE_URL_ENV,
  resolveOpenAiCompatiblePreset,
  type OpenAiCompatiblePreset,
} from "./setup-helpers.js";

export type LmStudioConnectionMode = "saved-recommended" | "saved-remote" | "saved-custom" | "env";
export type LmStudioModelMode = "auto" | "fixed";
export type ConnectionMode = "saved" | "env";

const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GOOGLE_BASE_URL_ENV = "AI_AGENTS_GOOGLE_BASE_URL";
const DEFAULT_GOOGLE_API_KEY_ENV = "AI_AGENTS_GOOGLE_API_KEY";
const GOOGLE_MODEL_EXAMPLES = ["text-bison-001", "code-gecko-001", "gemini-1.5-pro", "gemini-1.5-flash-001"];

export async function configureLmStudio(currentGlobal: GlobalConfig): Promise<ProviderStageConfig> {
  const connectionMode = await selectOption<LmStudioConnectionMode>(
    "LM Studio connection mode",
    [
      {
        value: "saved-recommended",
        label: "Use recommended local connection and save it in config",
        description: `${DEFAULT_LM_STUDIO_BASE_URL} + ${DEFAULT_LM_STUDIO_API_KEY}`,
      },
      {
        value: "saved-remote",
        label: "Use remote LM Studio on local network",
        description: "e.g., http://192.168.31.112:1234",
      },
      {
        value: "saved-custom",
        label: "Use custom local connection and save it in config",
      },
      {
        value: "env",
        label: "Use environment variables instead",
        description: "Requires setting variables in each terminal session",
      },
    ],
    "saved-recommended"
  );

  let lmStudioConfig: ProviderStageConfig = {
    type: "lmstudio",
    model: isAutoModelToken(currentGlobal.providers.dispatcher.model)
      ? "auto"
      : (currentGlobal.providers.dispatcher.model || "auto"),
    autoDiscoverModel: true,
    fallbackModel: currentGlobal.providers.dispatcher.fallbackModel || "",
    ...defaultOpenAiCompatibleFields(),
  };

  if (connectionMode === "saved-recommended") {
    lmStudioConfig = {
      ...lmStudioConfig,
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      apiKey: DEFAULT_LM_STUDIO_API_KEY,
      baseUrlEnv: DEFAULT_LM_STUDIO_BASE_URL_ENV,
      apiKeyEnv: DEFAULT_LM_STUDIO_API_KEY_ENV,
    };
  } else if (connectionMode === "saved-remote") {
    const existingBaseUrl = currentGlobal.providers.dispatcher.baseUrl || "http://192.168.31.112:1234";
    const baseUrl = await promptTextWithDefault("Remote LM Studio base URL:", existingBaseUrl);
    lmStudioConfig = {
      ...lmStudioConfig,
      baseUrl,
      apiKey: DEFAULT_LM_STUDIO_API_KEY,
      baseUrlEnv: DEFAULT_LM_STUDIO_BASE_URL_ENV,
      apiKeyEnv: DEFAULT_LM_STUDIO_API_KEY_ENV,
    };
  } else if (connectionMode === "saved-custom") {
    const existingBaseUrl = currentGlobal.providers.dispatcher.baseUrl || DEFAULT_LM_STUDIO_BASE_URL;
    const existingApiKey = currentGlobal.providers.dispatcher.apiKey || DEFAULT_LM_STUDIO_API_KEY;
    const baseUrl = await promptTextWithDefault("LM Studio base URL:", existingBaseUrl);
    const apiKey = await promptTextWithDefault("LM Studio API key (dummy value is fine):", existingApiKey);
    lmStudioConfig = {
      ...lmStudioConfig,
      baseUrl,
      apiKey,
      baseUrlEnv: DEFAULT_LM_STUDIO_BASE_URL_ENV,
      apiKeyEnv: DEFAULT_LM_STUDIO_API_KEY_ENV,
    };
  } else {
    const envMode = await selectOption<"default" | "custom">(
      "Choose environment variable names",
      [
        { value: "default", label: "Use LM Studio names (AI_AGENTS_LMSTUDIO_BASE_URL / AI_AGENTS_LMSTUDIO_API_KEY)" },
        { value: "custom", label: "Type custom environment variable names" },
      ],
      "default"
    );
    const baseUrlEnv = envMode === "default"
      ? DEFAULT_LM_STUDIO_BASE_URL_ENV
      : await promptRequiredText("Base URL env variable name (required):");
    const apiKeyEnv = envMode === "default"
      ? DEFAULT_LM_STUDIO_API_KEY_ENV
      : await promptRequiredText("API key env variable name (required):");
    lmStudioConfig = {
      ...lmStudioConfig,
      baseUrlEnv,
      apiKeyEnv,
      baseUrl: undefined,
      apiKey: undefined,
    };
    console.log(`\nYou chose env mode. Remember to define ${baseUrlEnv} and ${apiKeyEnv} in each terminal.`);
  }

  const modelMode = await selectOption<LmStudioModelMode>(
    "LM Studio model selection mode",
    [
      {
        value: "auto",
        label: "Auto-detect loaded model (recommended)",
        description: "Uses the model currently loaded in LM Studio at runtime",
      },
      {
        value: "fixed",
        label: "Pin a fixed model id",
        description: "Use one fixed model id instead of runtime autodiscovery",
      },
    ],
    isAutoModelToken(currentGlobal.providers.dispatcher.model) ? "auto" : "fixed"
  );

  if (modelMode === "fixed") {
    const model = await chooseOpenAiCompatibleModel(lmStudioConfig);
    lmStudioConfig = {
      ...lmStudioConfig,
      model,
      autoDiscoverModel: false,
    };
  } else {
    const fallbackDefault = currentGlobal.providers.dispatcher.fallbackModel || "";
    const fallbackModel = await promptTextWithDefault(
      "Fallback model if autodiscovery fails (optional):",
      fallbackDefault
    );
    lmStudioConfig = {
      ...lmStudioConfig,
      model: "auto",
      autoDiscoverModel: true,
      fallbackModel: fallbackModel.trim() || undefined,
    };
  }

  return lmStudioConfig;
}

export async function configureGoogle(currentGlobal: GlobalConfig): Promise<ProviderStageConfig> {
  const connectionMode = await selectOption<ConnectionMode>(
    "Google connection mode",
    [
      {
        value: "saved",
        label: "Save base URL and API key in global config",
        description: "Recommended to avoid per-terminal exports",
      },
      {
        value: "env",
        label: "Use environment variables",
      },
    ],
    "saved"
  );

  let googleConfig: ProviderStageConfig = {
    type: "google",
    model: currentGlobal.providers.dispatcher.model || "",
    baseUrlEnv: DEFAULT_GOOGLE_BASE_URL_ENV,
    apiKeyEnv: DEFAULT_GOOGLE_API_KEY_ENV,
  };

  if (connectionMode === "saved") {
    const existingBaseUrl = currentGlobal.providers.dispatcher.baseUrl || DEFAULT_GOOGLE_BASE_URL;
    const baseUrl = await promptTextWithDefault("Google base URL:", existingBaseUrl);
    const apiKey = await promptTextWithDefault(
      "Google API key (optional, press Enter to keep empty):",
      currentGlobal.providers.dispatcher.apiKey || ""
    );
    googleConfig = {
      ...googleConfig,
      baseUrl,
      apiKey,
    };
  } else {
    const envMode = await selectOption<"default" | "custom">(
      "Choose environment variable names",
      [
        {
          value: "default",
          label: `Use default names (${DEFAULT_GOOGLE_BASE_URL_ENV} / ${DEFAULT_GOOGLE_API_KEY_ENV})`,
        },
        { value: "custom", label: "Type custom environment variable names" },
      ],
      "default"
    );
    const baseUrlEnv = envMode === "default"
      ? DEFAULT_GOOGLE_BASE_URL_ENV
      : await promptRequiredText("Base URL env variable name (required):");
    const apiKeyEnv = envMode === "default"
      ? DEFAULT_GOOGLE_API_KEY_ENV
      : await promptRequiredText("API key env variable name (required):");
    googleConfig = {
      ...googleConfig,
      baseUrlEnv,
      apiKeyEnv,
      baseUrl: envMode === "default" ? DEFAULT_GOOGLE_BASE_URL : undefined,
      apiKey: undefined,
    };
    console.log(
      envMode === "default"
        ? `\nYou chose env mode with preset base URL (${DEFAULT_GOOGLE_BASE_URL}). Define ${DEFAULT_GOOGLE_API_KEY_ENV} in each terminal.`
        : `\nYou chose env mode. Remember to define ${baseUrlEnv} and ${apiKeyEnv} in each terminal.`
    );
  }

  if (GOOGLE_MODEL_EXAMPLES.length) {
    console.log(`\nModel examples for Google: ${GOOGLE_MODEL_EXAMPLES.join(", ")}`);
  }

  const googleModel = await chooseOpenAiCompatibleModel(googleConfig, GOOGLE_MODEL_EXAMPLES);
  return { ...googleConfig, model: googleModel };
}

export async function configureAnthropic(currentGlobal: GlobalConfig): Promise<ProviderStageConfig> {
  const connectionMode = await selectOption<ConnectionMode>(
    "Anthropic connection mode",
    [
      {
        value: "saved",
        label: "Save base URL and API key in global config",
        description: "Recommended to avoid per-terminal exports",
      },
      {
        value: "env",
        label: "Use environment variables",
      },
    ],
    "saved"
  );

  let anthropicConfig: ProviderStageConfig = {
    type: "anthropic",
    model: currentGlobal.providers.dispatcher.model || "",
    baseUrlEnv: DEFAULT_ANTHROPIC_BASE_URL_ENV,
    apiKeyEnv: DEFAULT_ANTHROPIC_API_KEY_ENV,
  };

  if (connectionMode === "saved") {
    const existingBaseUrl = currentGlobal.providers.dispatcher.baseUrl || DEFAULT_ANTHROPIC_BASE_URL;
    const baseUrl = await promptTextWithDefault("Anthropic base URL:", existingBaseUrl);
    const existingApiKey = currentGlobal.providers.dispatcher.apiKey || "";
    const apiKey = existingApiKey
      ? await promptTextWithDefault("Anthropic API key (required):", existingApiKey)
      : await promptRequiredText("Anthropic API key (required):");
    anthropicConfig = {
      ...anthropicConfig,
      baseUrl,
      apiKey,
    };
  } else {
    const envMode = await selectOption<"default" | "custom">(
      "Choose environment variable names",
      [
        {
          value: "default",
          label: `Use default names (${DEFAULT_ANTHROPIC_BASE_URL_ENV} / ${DEFAULT_ANTHROPIC_API_KEY_ENV})`,
        },
        { value: "custom", label: "Type custom environment variable names" },
      ],
      "default"
    );
    const baseUrlEnv = envMode === "default"
      ? DEFAULT_ANTHROPIC_BASE_URL_ENV
      : await promptRequiredText("Base URL env variable name (required):");
    const apiKeyEnv = envMode === "default"
      ? DEFAULT_ANTHROPIC_API_KEY_ENV
      : await promptRequiredText("API key env variable name (required):");
    anthropicConfig = {
      ...anthropicConfig,
      baseUrlEnv,
      apiKeyEnv,
      baseUrl: envMode === "default" ? DEFAULT_ANTHROPIC_BASE_URL : undefined,
      apiKey: undefined,
    };
    console.log(
      envMode === "default"
        ? `\nYou chose env mode with preset base URL (${DEFAULT_ANTHROPIC_BASE_URL}). Define ${DEFAULT_ANTHROPIC_API_KEY_ENV} in each terminal.`
        : `\nYou chose env mode. Remember to define ${baseUrlEnv} and ${apiKeyEnv} in each terminal.`
    );
  }

  const anthropicModel = await chooseOpenAiCompatibleModel(anthropicConfig, ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229"]);
  return { ...anthropicConfig, model: anthropicModel };
}

export async function configureOpenAiCompatible(currentGlobal: GlobalConfig): Promise<ProviderStageConfig> {
  const openAiPreset = await selectOption<OpenAiCompatiblePreset>(
    "OpenAI-compatible provider preset",
    [
      {
        value: "openai",
        label: "OpenAI API (cloud)",
        description: "Use api.openai.com with OpenAI model ids",
      },
      {
        value: "openrouter",
        label: "OpenRouter (cloud multi-model)",
        description: "Use OpenRouter for models like Claude/Qwen and others",
      },
      {
        value: "remote-lmstudio",
        label: "Remote LM Studio (local network)",
        description: "Use LM Studio running on another computer in your network",
      },
      {
        value: "custom",
        label: "Custom OpenAI-compatible endpoint",
        description: "Use any OpenAI-compatible gateway or self-hosted endpoint",
      },
    ],
    "openai"
  );
  const presetConfig = resolveOpenAiCompatiblePreset(openAiPreset);

  const connectionMode = await selectOption<ConnectionMode>(
    "OpenAI-compatible connection mode",
    [
      {
        value: "saved",
        label: "Save base URL and API key in global config",
        description: "Recommended to avoid per-terminal exports",
      },
      {
        value: "env",
        label: "Use environment variables",
      },
    ],
    "saved"
  );

  let baseConfig: ProviderStageConfig = {
    type: "openai-compatible",
    model: currentGlobal.providers.dispatcher.model || "",
    ...defaultOpenAiCompatibleFields(),
  };

  if (connectionMode === "saved") {
    const existingBaseUrl = currentGlobal.providers.dispatcher.baseUrl || "";
    const existingApiKey = currentGlobal.providers.dispatcher.apiKey || "";
    const baseUrl = await promptTextWithDefault(
      "Base URL:",
      existingBaseUrl || presetConfig.baseUrl
    );
    const apiKey = await promptTextWithDefault(
      `${presetConfig.apiKeyLabel} (optional, press Enter to keep empty):`,
      existingApiKey
    );
    baseConfig = {
      ...baseConfig,
      baseUrl,
      apiKey,
    };
  } else {
    const envMode = await selectOption<"default" | "custom">(
      "Choose environment variable names",
      [
        {
          value: "default",
          label: `Use preset defaults (${presetConfig.defaultBaseUrlEnv} / ${presetConfig.defaultApiKeyEnv})`,
        },
        { value: "custom", label: "Type custom environment variable names" },
      ],
      "default"
    );

    const baseUrlEnv = envMode === "default"
      ? presetConfig.defaultBaseUrlEnv
      : await promptRequiredText("Base URL env variable name (required):");
    const apiKeyEnv = envMode === "default"
      ? presetConfig.defaultApiKeyEnv
      : await promptRequiredText("API key env variable name (required):");
    baseConfig = {
      ...baseConfig,
      baseUrlEnv,
      apiKeyEnv,
      baseUrl: envMode === "default" ? presetConfig.baseUrl : undefined,
      apiKey: undefined,
    };
    console.log(
      envMode === "default"
        ? `\nYou chose env mode with preset base URL (${presetConfig.baseUrl}). Define ${apiKeyEnv} in each terminal.`
        : `\nYou chose env mode. Remember to define ${baseUrlEnv} and ${apiKeyEnv} in each terminal.`
    );
  }

  if (presetConfig.modelExamples.length) {
    console.log(`\nSelected preset: ${presetConfig.label}`);
    console.log(`Common model ids: ${presetConfig.modelExamples.join(", ")}`);
  }

  const model = await chooseOpenAiCompatibleModel(baseConfig, presetConfig.modelExamples);
  return { ...baseConfig, model };
}
