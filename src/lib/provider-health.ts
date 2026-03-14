import type { ProviderHealth, ProviderStageConfig } from "./types.js";

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

function resolveOpenAiCompatibleConnection(config: ProviderStageConfig): ProviderConnection | ProviderModelDiscovery {
  const baseUrlEnv = config.baseUrlEnv || "AI_AGENTS_OPENAI_BASE_URL";
  const apiKeyEnv = config.apiKeyEnv || "AI_AGENTS_OPENAI_API_KEY";
  const baseUrl = (config.baseUrl || process.env[baseUrlEnv] || "").trim();
  const apiKey = (config.apiKey || process.env[apiKeyEnv] || "").trim();

  if (!baseUrl) {
    return {
      reachable: false,
      message: `Missing provider base URL. Set it in setup or define ${baseUrlEnv}.`,
      models: [],
    };
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    headers,
  };
}

export async function discoverProviderModels(config: ProviderStageConfig): Promise<ProviderModelDiscovery> {
  if (config.type === "mock") {
    return {
      reachable: true,
      message: "Mock provider is ready.",
      models: [config.model],
    };
  }

  const connection = resolveOpenAiCompatibleConnection(config);
  if ("reachable" in connection) return connection;

  try {
    const response = await fetch(`${connection.baseUrl}/models`, { headers: connection.headers });
    if (!response.ok) {
      return {
        reachable: false,
        message: `Provider answered with ${response.status}.`,
        models: [],
      };
    }

    const json = (await response.json()) as ModelsResponse;
    const models = (json.data || []).map((item) => item.id || "").filter(Boolean);
    return {
      reachable: true,
      message: models.length ? "Provider is reachable and returned models." : "Provider is reachable but returned no models.",
      models,
    };
  } catch (error) {
    return {
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
      models: [],
    };
  }
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
      message: "Provider is reachable, but it returned no models. The configured model could not be validated.",
      modelFound: false,
      listedModels: [],
    };
  }

  const modelFound = models.includes(config.model);

  return {
    reachable: true,
    message:
      modelFound === false
        ? "Provider is reachable, but the configured model was not found in the model list."
        : "Provider is reachable and the configured model is available.",
    modelFound,
    listedModels: models,
  };
}
