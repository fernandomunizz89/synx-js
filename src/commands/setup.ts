import { Command } from "commander";
import path from "node:path";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { configDir, globalConfigPath, repoRoot } from "../lib/paths.js";
import { readJson, writeJson } from "../lib/fs.js";
import { checkProviderHealth, discoverProviderModels } from "../lib/provider-health.js";
import { confirmAction, promptRequiredText, promptTextWithDefault, selectOption } from "../lib/interactive.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { commandExample } from "../lib/cli-command.js";
import { choosePreferredDiscoveredModel, findDiscoveredModelMatch } from "../lib/model-support.js";
import {
  DEFAULT_LM_STUDIO_API_KEY,
  DEFAULT_LM_STUDIO_API_KEY_ENV,
  DEFAULT_LM_STUDIO_BASE_URL,
  DEFAULT_LM_STUDIO_BASE_URL_ENV,
  isAutoModelToken,
} from "../lib/lmstudio.js";
import type { GlobalConfig, LocalProjectConfig, ProviderHealth, ProviderStageConfig } from "../lib/types.js";
import {
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_ANTHROPIC_BASE_URL_ENV,
  DEFAULT_ANTHROPIC_API_KEY_ENV,
} from "../providers/anthropic-provider.js";

type SetupProviderChoice = "mock" | "lm-studio" | "openai-compatible" | "google" | "anthropic";
type ConnectionMode = "saved" | "env";
type LmStudioConnectionMode = "saved-recommended" | "saved-custom" | "env";
type LmStudioModelMode = "auto" | "fixed";
type OpenAiCompatiblePreset = "openai" | "openrouter" | "custom";

const DEFAULT_BASE_URL_ENV = "AI_AGENTS_OPENAI_BASE_URL";
const DEFAULT_API_KEY_ENV = "AI_AGENTS_OPENAI_API_KEY";
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GOOGLE_BASE_URL_ENV = "AI_AGENTS_GOOGLE_BASE_URL";
const DEFAULT_GOOGLE_API_KEY_ENV = "AI_AGENTS_GOOGLE_API_KEY";
const GOOGLE_MODEL_EXAMPLES = ["text-bison-001", "code-gecko-001", "gemini-1.5-pro", "gemini-1.5-flash-001"];

interface OpenAiCompatiblePresetConfig {
  label: string;
  baseUrl: string;
  defaultBaseUrlEnv: string;
  defaultApiKeyEnv: string;
  apiKeyLabel: string;
  modelExamples: string[];
}

function isProviderHealthy(health: ProviderHealth): boolean {
  return health.reachable && (health.modelFound ?? true);
}

function defaultOpenAiCompatibleFields(): Pick<ProviderStageConfig, "baseUrlEnv" | "apiKeyEnv"> {
  return {
    baseUrlEnv: DEFAULT_BASE_URL_ENV,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
  };
}

function resolveOpenAiCompatiblePreset(preset: OpenAiCompatiblePreset): OpenAiCompatiblePresetConfig {
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

function printSetupFixHints(label: string, health: ProviderHealth, config: ProviderStageConfig): void {
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

async function chooseOpenAiCompatibleModel(config: ProviderStageConfig, manualExamples: string[] = []): Promise<string> {
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
    console.log("You can still continue by typing the model manually.");
    if (manualExamples.length) {
      console.log(`Model examples for this provider: ${manualExamples.join(", ")}`);
    }
  }

  if (suggestedManualModel) {
    return promptTextWithDefault("Model name (required):", suggestedManualModel);
  }
  return promptRequiredText("Model name (required):");
}

export const setupCommand = new Command("setup")
  .description("Guided setup for the current machine and repository")
  .action(async () => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const globalPath = globalConfigPath();
    const projectPath = path.join(configDir(), "project.json");
    const currentGlobal = await readJson<GlobalConfig>(globalPath);
    const currentLocal = await readJson<LocalProjectConfig>(projectPath);

    console.log("\nGuided setup");
    console.log(`- Repository detected: ${repoRoot()}`);
    console.log(`- Global config: ${globalPath}`);
    console.log(`- Local project config: ${projectPath}`);
    console.log("- Navigation: use Arrow Up/Down and Enter.");

    while (true) {
      const existingReviewer = currentLocal.humanReviewer || currentGlobal.defaults.humanReviewer;
      if (existingReviewer) {
        console.log(`\nCurrent reviewer in config: ${existingReviewer}`);
        console.log("Please type the reviewer name explicitly to confirm or update it.");
      }

      const reviewer = await promptRequiredText("Human reviewer name (required):");
          const providerChoice = await selectOption<SetupProviderChoice>(
            "Choose provider for Dispatcher and Planner",
            [
              { value: "mock", label: "Mock (offline/demo mode)" },
              { value: "lm-studio", label: "LM Studio (local OpenAI-compatible server)" },
              { value: "openai-compatible", label: "OpenAI-compatible endpoint (remote or self-hosted)" },
              { value: "google", label: "Google Generative AI (Gemini/PaLM)", description: "Use Google Generative Language API with API key" },
              { value: "anthropic", label: "Anthropic Claude Code", description: "Claude Code via Anthropic API key" },
            ],
            "mock"
          );

      const nextGlobal: GlobalConfig = {
        ...currentGlobal,
        providers: {
          ...currentGlobal.providers,
          dispatcher: currentGlobal.providers.dispatcher,
          planner: currentGlobal.providers.planner,
        },
        defaults: {
          ...currentGlobal.defaults,
          humanReviewer: reviewer,
        },
      };

      const nextLocal: LocalProjectConfig = {
        ...currentLocal,
        humanReviewer: reviewer,
      };

      if (providerChoice === "mock") {
        nextGlobal.providers.dispatcher = {
          type: "mock",
          model: "mock-dispatcher-v1",
          ...defaultOpenAiCompatibleFields(),
        };
        nextGlobal.providers.planner = {
          type: "mock",
          model: "mock-planner-v1",
          ...defaultOpenAiCompatibleFields(),
        };
      } else if (providerChoice === "lm-studio") {
        const connectionMode = await selectOption<LmStudioConnectionMode>(
          "LM Studio connection mode",
          [
            {
              value: "saved-recommended",
              label: "Use recommended local connection and save it in config",
              description: `${DEFAULT_LM_STUDIO_BASE_URL} + ${DEFAULT_LM_STUDIO_API_KEY}`,
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

        nextGlobal.providers.dispatcher = { ...lmStudioConfig };
        nextGlobal.providers.planner = { ...lmStudioConfig };
      } else if (providerChoice === "google") {
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
        nextGlobal.providers.dispatcher = { ...googleConfig, model: googleModel };
        nextGlobal.providers.planner = { ...googleConfig, model: googleModel };
      } else if (providerChoice === "anthropic") {
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

        nextGlobal.providers.dispatcher = { ...anthropicConfig };
        nextGlobal.providers.planner = { ...anthropicConfig };
      } else {
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

        const openAiCompatibleConfig: ProviderStageConfig = {
          ...baseConfig,
        };

        const model = await chooseOpenAiCompatibleModel(openAiCompatibleConfig, presetConfig.modelExamples);
        nextGlobal.providers.dispatcher = { ...openAiCompatibleConfig, model };
        nextGlobal.providers.planner = { ...openAiCompatibleConfig, model };
      }

      const dispatcherHealth = await checkProviderHealth(nextGlobal.providers.dispatcher);
      const plannerHealth = await checkProviderHealth(nextGlobal.providers.planner);
      const dispatcherOk = isProviderHealthy(dispatcherHealth);
      const plannerOk = isProviderHealthy(plannerHealth);

      console.log("\nValidation");
      console.log(`- Dispatcher: ${providerHealthToHuman(dispatcherHealth.message)}`);
      console.log(`- Planner: ${providerHealthToHuman(plannerHealth.message)}`);
      if (dispatcherHealth.listedModels?.length) {
        console.log(`- Models detected: ${dispatcherHealth.listedModels.slice(0, 12).join(", ")}`);
      }

      if (dispatcherOk && plannerOk) {
        await writeJson(globalPath, nextGlobal);
        await writeJson(projectPath, nextLocal);
        console.log("\nSetup complete.");
        console.log(`Next step: run \`${commandExample("start")}\` to begin processing tasks.`);
        return;
      }

      if (!dispatcherOk) {
        printSetupFixHints("Dispatcher", dispatcherHealth, nextGlobal.providers.dispatcher);
      }
      if (!plannerOk) {
        printSetupFixHints("Planner", plannerHealth, nextGlobal.providers.planner);
      }

      console.log("\nSetup is not complete yet because provider validation failed.");
      const nextAction = await selectOption<"retry" | "mock" | "cancel">(
        "What do you want to do next?",
        [
          { value: "retry", label: "Retry setup choices" },
          { value: "mock", label: "Switch to mock provider and finish setup now" },
          { value: "cancel", label: "Cancel without writing changes" },
        ],
        "retry"
      );

      if (nextAction === "mock") {
        nextGlobal.providers.dispatcher = {
          type: "mock",
          model: "mock-dispatcher-v1",
          ...defaultOpenAiCompatibleFields(),
        };
        nextGlobal.providers.planner = {
          type: "mock",
          model: "mock-planner-v1",
          ...defaultOpenAiCompatibleFields(),
        };
        await writeJson(globalPath, nextGlobal);
        await writeJson(projectPath, nextLocal);
        console.log("\nSetup complete with mock provider.");
        console.log(`You can switch providers later by running \`${commandExample("setup")}\` again.`);
        return;
      }

      if (nextAction === "cancel") {
        const confirmCancel = await confirmAction("Exit setup without writing config changes?", true);
        if (confirmCancel) {
          console.log("\nSetup canceled. No changes were written.");
          return;
        }
      }
    }
  });
