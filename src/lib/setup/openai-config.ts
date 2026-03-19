import { selectOption, promptTextWithDefault, promptRequiredText } from "../interactive.js";
import type { GlobalConfig, ProviderStageConfig } from "../types.js";
import {
  chooseOpenAiCompatibleModel,
  defaultOpenAiCompatibleFields,
  resolveOpenAiCompatiblePreset,
  type OpenAiCompatiblePreset,
} from "../setup-helpers.js";

export type ConnectionMode = "saved" | "env";

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
