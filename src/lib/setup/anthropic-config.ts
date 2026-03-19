import { selectOption, promptTextWithDefault, promptRequiredText } from "../interactive.js";
import {
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_ANTHROPIC_BASE_URL_ENV,
  DEFAULT_ANTHROPIC_API_KEY_ENV,
} from "../../providers/anthropic-provider.js";
import type { GlobalConfig, ProviderStageConfig } from "../types.js";
import { chooseOpenAiCompatibleModel } from "../setup-helpers.js";

export type ConnectionMode = "saved" | "env";

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
