import { selectOption, promptTextWithDefault, promptRequiredText } from "../interactive.js";
import {
  DEFAULT_LM_STUDIO_API_KEY,
  DEFAULT_LM_STUDIO_BASE_URL,
  isAutoModelToken,
} from "../lmstudio.js";
import type { GlobalConfig, ProviderStageConfig } from "../types.js";
import {
  chooseOpenAiCompatibleModel,
  defaultOpenAiCompatibleFields,
  DEFAULT_LM_STUDIO_API_KEY_ENV,
  DEFAULT_LM_STUDIO_BASE_URL_ENV,
} from "../setup-helpers.js";

export type LmStudioConnectionMode = "saved-recommended" | "saved-remote" | "saved-custom" | "env";
export type LmStudioModelMode = "auto" | "fixed";

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
