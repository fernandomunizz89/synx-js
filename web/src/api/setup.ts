export type ProviderType = "mock" | "lmstudio" | "openai-compatible" | "google" | "anthropic";

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.ok) throw new Error(json.error ?? "API error");
  return json.data;
}

export interface UiConfigResponse {
  global: {
    providers?: {
      dispatcher?: { type?: ProviderType; model?: string };
      planner?: { type?: ProviderType; model?: string };
    };
    agentProviders?: Record<string, { type?: ProviderType; model?: string }>;
    defaults?: { humanReviewer?: string };
  } | null;
  local: {
    humanReviewer?: string;
  } | null;
}

export interface DiscoverModelsResponse {
  reachable: boolean;
  message: string;
  models: string[];
}

export interface AgentProviderInput {
  agentName: string;
  providerType: ProviderType;
  model: string;
}

export interface SaveSetupInput {
  humanReviewer: string;
  providerType: ProviderType;
  model: string;
  plannerSeparate: boolean;
  plannerProviderType: ProviderType;
  plannerModel: string;
  agentProviders: AgentProviderInput[];
}

export async function fetchUiConfig(): Promise<UiConfigResponse> {
  return apiFetch<UiConfigResponse>("/api/config");
}

export async function discoverModels(providerType: ProviderType): Promise<DiscoverModelsResponse> {
  return apiFetch<DiscoverModelsResponse>("/api/setup/discover-models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerType }),
  });
}

export async function saveSetup(input: SaveSetupInput): Promise<{ providerType: string; humanReviewer: string; model: string }> {
  return apiFetch("/api/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
