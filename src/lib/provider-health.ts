import type { ProviderHealth, ProviderStageConfig } from "./types.js";
import { findDiscoveredModelMatch } from "./model-support.js";
import {
  isAutoModelToken,
  resolveLmStudioRuntimeSettings,
  toLmStudioBridgeProviderConfig,
} from "./lmstudio.js";

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

export interface ProviderModelDiscovery {
  reachable: boolean;
  message: string;
  models: string[];
}

interface ProviderConnection {
  baseUrl: string;
  headers: Record<string, string>;
}

function resolveDiscoveryTimeoutMs(): number {
  const raw = Number(process.env.AI_AGENTS_PROVIDER_DISCOVERY_TIMEOUT_MS || "10000");
  if (!Number.isFinite(raw)) return 10000;
  const rounded = Math.floor(raw);
  if (rounded < 500) return 10000;
  return Math.min(120000, rounded);
}

function toDiscoveryError(message: string): ProviderModelDiscovery {
  return {
    reachable: false,
    message,
    models: [],
  };
}

function resolveOpenAiCompatibleConnection(config: ProviderStageConfig): ProviderConnection | ProviderModelDiscovery {
  const baseUrlEnv = config.baseUrlEnv || "AI_AGENTS_OPENAI_BASE_URL";
  const apiKeyEnv = config.apiKeyEnv || "AI_AGENTS_OPENAI_API_KEY";
  const baseUrl = (config.baseUrl || process.env[baseUrlEnv] || "").trim();
  const apiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();

  if (!baseUrl) {
    return toDiscoveryError(`Missing provider base URL. Set it in setup or define ${baseUrlEnv}.`);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    headers,
  };
}

async function fetchModels(connection: ProviderConnection): Promise<ProviderModelDiscovery> {
  const timeoutMs = resolveDiscoveryTimeoutMs();
  let response: Response;
  try {
    response = await fetch(`${connection.baseUrl}/models`, {
      headers: connection.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return toDiscoveryError(`Model discovery timed out after ${timeoutMs}ms.`);
    }
    return toDiscoveryError(error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return toDiscoveryError(`Provider answered with ${response.status}${body ? `: ${body}` : "."}`);
  }

  let json: ModelsResponse;
  try {
    json = (await response.json()) as ModelsResponse;
  } catch (error) {
    return toDiscoveryError(`Provider returned an invalid models response: ${error instanceof Error ? error.message : String(error)}`);
  }

  const models = (json.data || []).map((item) => item.id || "").filter(Boolean);
  return {
    reachable: true,
    message: models.length ? "Provider is reachable and returned models." : "Provider is reachable but returned no models.",
    models,
  };
}

function chooseLmStudioAutoModel(config: ProviderStageConfig, discoveredModels: string[]): string {
  const settings = resolveLmStudioRuntimeSettings(config);

  const configuredCandidate = isAutoModelToken(settings.configuredModel) ? "" : settings.configuredModel;
  if (configuredCandidate) {
    const configuredMatch = findDiscoveredModelMatch(configuredCandidate, discoveredModels);
    if (configuredMatch?.matchedModel) return configuredMatch.matchedModel;
  }

  if (settings.fallbackModel) {
    const fallbackMatch = findDiscoveredModelMatch(settings.fallbackModel, discoveredModels);
    if (fallbackMatch?.matchedModel) return fallbackMatch.matchedModel;
  }

  return discoveredModels[0];
}

function modelFoundMessage(config: ProviderStageConfig, closeMatch: string): string {
  if (config.type === "lmstudio") {
    if (closeMatch) {
      return `LM Studio is reachable, but configured model was not found exactly. Closest loaded model: ${closeMatch}`;
    }
    return "LM Studio is reachable, but configured model was not found in loaded models.";
  }
  if (closeMatch) {
    return `Provider is reachable, but the configured model was not found exactly in the model list. Closest discovered model: ${closeMatch}`;
  }
  return "Provider is reachable, but the configured model was not found in the model list.";
}

export async function discoverProviderModels(config: ProviderStageConfig): Promise<ProviderModelDiscovery> {
  if (config.type === "mock") {
    return {
      reachable: true,
      message: "Mock provider is ready.",
      models: [config.model],
    };
  }

  if (config.type === "lmstudio") {
    const bridgeConfig = toLmStudioBridgeProviderConfig(config, "auto");
    const connection = resolveOpenAiCompatibleConnection(bridgeConfig);
    if ("reachable" in connection) return connection;
    const discovery = await fetchModels(connection);
    if (!discovery.reachable) return discovery;
    if (!discovery.models.length) {
      return {
        reachable: true,
        message: "LM Studio is reachable but no model is currently loaded.",
        models: [],
      };
    }
    return {
      reachable: true,
      message: `LM Studio is reachable and returned ${discovery.models.length} model(s).`,
      models: discovery.models,
    };
  }

  const connection = resolveOpenAiCompatibleConnection(config);
  if ("reachable" in connection) return connection;
  return fetchModels(connection);
}

export async function checkProviderHealth(config: ProviderStageConfig): Promise<ProviderHealth> {
  if (config.type === "mock") {
    return {
      reachable: true,
      message: "Mock provider is ready.",
      modelFound: true,
      listedModels: [config.model],
    };
  }

  const discovery = await discoverProviderModels(config);
  if (!discovery.reachable) {
    return {
      reachable: false,
      message: discovery.message,
      modelFound: false,
      listedModels: [],
    };
  }

  const models = discovery.models;
  if (!models.length) {
    return {
      reachable: true,
      message: config.type === "lmstudio"
        ? "LM Studio is reachable, but no model is loaded. Load a model in LM Studio and retry."
        : "Provider is reachable, but it returned no models. The configured model could not be validated.",
      modelFound: false,
      listedModels: [],
    };
  }

  if (config.type === "lmstudio") {
    const settings = resolveLmStudioRuntimeSettings(config);
    const autoMode = settings.autoDiscoverModel;
    if (autoMode) {
      const selected = chooseLmStudioAutoModel(config, models);
      return {
        reachable: true,
        message: `LM Studio is reachable and auto-discovery selected model: ${selected}`,
        modelFound: true,
        listedModels: models,
      };
    }

    if (isAutoModelToken(settings.configuredModel)) {
      if (settings.fallbackModel) {
        const fallbackMatch = findDiscoveredModelMatch(settings.fallbackModel, models);
        if (fallbackMatch?.matchedModel) {
          return {
            reachable: true,
            message: `LM Studio is reachable and fallback model is loaded: ${fallbackMatch.matchedModel}`,
            modelFound: true,
            listedModels: models,
          };
        }
      }
      return {
        reachable: true,
        message: "LM Studio autodiscovery is disabled, but no fixed loaded model could be resolved from model/fallback settings.",
        modelFound: false,
        listedModels: models,
      };
    }
  }

  const modelToValidate = config.type === "lmstudio"
    ? resolveLmStudioRuntimeSettings(config).configuredModel
    : config.model;
  const match = findDiscoveredModelMatch(modelToValidate, models);
  const modelFound = Boolean(match?.exact);
  const closeMatch = match && !match.exact ? match.matchedModel : "";

  return {
    reachable: true,
    message: modelFound
      ? (config.type === "lmstudio"
        ? "LM Studio is reachable and the configured model is loaded."
        : "Provider is reachable and the configured model is available.")
      : modelFoundMessage(config, closeMatch),
    modelFound,
    listedModels: models,
  };
}
