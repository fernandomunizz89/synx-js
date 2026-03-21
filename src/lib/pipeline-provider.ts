// Resolves a ProviderStageConfig from a step's providerOverride shorthand or agent definition

import path from "node:path";
import { loadAgentDefinition } from "./agent-registry.js";
import { loadResolvedProjectConfig } from "./config.js";
import type { ProviderStageConfig, ProviderType, PipelineStep } from "./types.js";
import { exists } from "./fs.js";
import { agentsDir } from "./paths.js";

const PROVIDER_SHORTHAND_MAP: Record<string, ProviderType> = {
  openai: "openai-compatible",
  anthropic: "anthropic",
  google: "google",
  lmstudio: "lmstudio",
  mock: "mock",
};

export function parseProviderShorthand(shorthand: string): ProviderStageConfig {
  const slashIndex = shorthand.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid providerOverride shorthand "${shorthand}". Expected "provider/model" e.g. "openai/gpt-4o"`);
  }
  const providerKey = shorthand.slice(0, slashIndex).toLowerCase();
  const model = shorthand.slice(slashIndex + 1);
  const type = PROVIDER_SHORTHAND_MAP[providerKey];
  if (!type) {
    throw new Error(`Unknown provider "${providerKey}" in shorthand "${shorthand}". Supported: ${Object.keys(PROVIDER_SHORTHAND_MAP).join(", ")}`);
  }
  return { type, model };
}

export async function resolveStepProvider(step: PipelineStep): Promise<ProviderStageConfig> {
  if (step.providerOverride) {
    return parseProviderShorthand(step.providerOverride);
  }

  // Check if the agent is a custom agent with its own provider config
  const agentFile = path.join(agentsDir(), `${step.agent}.json`);
  if (await exists(agentFile)) {
    const def = await loadAgentDefinition(step.agent);
    return def.provider;
  }

  // Fall back to project default (dispatcher provider)
  const config = await loadResolvedProjectConfig();
  return config.providers.dispatcher;
}
