import { selectOption, promptTextWithDefault, promptRequiredText } from "../interactive.js";
import type { GlobalConfig, ProviderStageConfig } from "../types.js";
import { chooseOpenAiCompatibleModel } from "../setup-helpers.js";

const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GOOGLE_BASE_URL_ENV = "AI_AGENTS_GOOGLE_BASE_URL";
const DEFAULT_GOOGLE_API_KEY_ENV = "AI_AGENTS_GOOGLE_API_KEY";
const GOOGLE_MODEL_EXAMPLES = ["text-bison-001", "code-gecko-001", "gemini-1.5-pro", "gemini-1.5-flash-001"];

export type ConnectionMode = "saved" | "env";

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
