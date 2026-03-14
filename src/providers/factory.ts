import type { ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export function createProvider(config: ProviderStageConfig): LlmProvider {
  if (config.type === "mock") return new MockProvider(config.model);
  if (config.type === "openai-compatible") return new OpenAiCompatibleProvider(config);
  throw new Error(`Unsupported provider type: ${String((config as any).type)}`);
}
