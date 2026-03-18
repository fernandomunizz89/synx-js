import { describe, expect, it, vi, beforeEach } from "vitest";
import { createProvider } from "./factory.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import { LmStudioProvider } from "./lmstudio-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";

vi.mock("./mock-provider.js", () => ({
  MockProvider: vi.fn(),
}));
vi.mock("./openai-compatible-provider.js", () => ({
  OpenAiCompatibleProvider: vi.fn(),
}));
vi.mock("./lmstudio-provider.js", () => ({
  LmStudioProvider: vi.fn(),
}));
vi.mock("./anthropic-provider.js", () => ({
  AnthropicProvider: vi.fn(),
  DEFAULT_ANTHROPIC_BASE_URL: "https://api.anthropic.com",
  DEFAULT_ANTHROPIC_BASE_URL_ENV: "AI_AGENTS_ANTHROPIC_BASE_URL",
  DEFAULT_ANTHROPIC_API_KEY_ENV: "AI_AGENTS_ANTHROPIC_API_KEY",
}));
vi.mock("../lib/lmstudio.js", () => ({
  resolveLmStudioRuntimeSettings: vi.fn((config) => ({
    configuredModel: config.model,
    autoDiscoverModel: false,
    baseUrlRoot: "http://localhost:1234",
    apiKey: "lm-studio",
    baseUrlEnv: "LM_BASE_URL",
    apiKeyEnv: "LM_API_KEY",
  })),
}));

describe("provider factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("creates a mock provider", () => {
    const config = { type: "mock" as const, model: "test-model" };
    createProvider(config);
    expect(MockProvider).toHaveBeenCalledWith("test-model");
  });

  it("creates an openai-compatible provider", () => {
    const config = { type: "openai-compatible" as const, model: "gpt-4", baseUrl: "https://api.openai.com" };
    createProvider(config);
    expect(OpenAiCompatibleProvider).toHaveBeenCalledWith(config);
  });

  it("creates an lmstudio provider", () => {
    const config = { type: "lmstudio" as const, model: "luna" };
    createProvider(config);
    expect(LmStudioProvider).toHaveBeenCalledWith(config);
  });

  it("creates an anthropic provider", () => {
    const config = { type: "anthropic" as const, model: "claude-code" };
    createProvider(config);
    expect(AnthropicProvider).toHaveBeenCalledWith(config);
  });

  it("caches providers by default", () => {
    const config = { type: "mock" as const, model: "cache-test" };
    const p1 = createProvider(config);
    const p2 = createProvider(config);
    expect(MockProvider).toHaveBeenCalledTimes(1);
    expect(p1).toBe(p2);
  });

  it("disables cache via environment variable", () => {
    process.env.AI_AGENTS_DISABLE_PROVIDER_CACHE = "true";
    const config = { type: "mock" as const, model: "no-cache-test" };
    createProvider(config);
    createProvider(config);
    expect(MockProvider).toHaveBeenCalledTimes(2);
  });

  it("throws for unsupported provider type", () => {
    const config = { type: "unknown" as any, model: "foo" };
    expect(() => createProvider(config)).toThrow("Unsupported provider type: unknown");
  });

  it("handles openai-compatible cache keys with env vars", () => {
    const config = { 
        type: "openai-compatible" as const, 
        model: "m", 
        baseUrlEnv: "MY_BASE",
        apiKeyEnv: "MY_KEY"
    };
    process.env.MY_BASE = "http://base";
    process.env.MY_KEY = "key";
    
    createProvider(config);
    expect(OpenAiCompatibleProvider).toHaveBeenCalledTimes(1);
    
    // Changing env should change cache key
    process.env.MY_BASE = "http://base-new";
    createProvider(config);
    expect(OpenAiCompatibleProvider).toHaveBeenCalledTimes(2);
  });
});
