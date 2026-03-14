import type { ProviderRequest, ProviderResult } from "../lib/types.js";

export interface LlmProvider {
  generateStructured(request: ProviderRequest): Promise<ProviderResult>;
}
