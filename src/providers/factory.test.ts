import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { createProvider, executeWithFallback, resolveFallbackModels } from "./factory.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import { LmStudioProvider } from "./lmstudio-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import type { ProviderRequest, ProviderResult, ProviderStageConfig } from "../lib/types.js";
import type { LlmProvider } from "./provider.js";

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

describe("resolveFallbackModels", () => {
  it("returns empty array when no fallback configured", () => {
    const config: ProviderStageConfig = { type: "mock", model: "primary" };
    expect(resolveFallbackModels(config)).toEqual([]);
  });

  it("returns fallbackModels when set", () => {
    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModels: [{ type: "anthropic", model: "claude-3" }],
    };
    expect(resolveFallbackModels(config)).toEqual([{ type: "anthropic", model: "claude-3" }]);
  });

  it("synthesizes fallbackModels from deprecated fallbackModel string", () => {
    const config: ProviderStageConfig = {
      type: "openai-compatible",
      model: "gpt-4o",
      baseUrl: "http://localhost",
      fallbackModel: "gpt-3.5-turbo",
    };
    const result = resolveFallbackModels(config);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "openai-compatible", model: "gpt-3.5-turbo", baseUrl: "http://localhost" });
  });

  it("prefers fallbackModels over deprecated fallbackModel", () => {
    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModel: "deprecated-fallback",
      fallbackModels: [{ type: "anthropic", model: "claude-new" }],
    };
    const result = resolveFallbackModels(config);
    expect(result).toHaveLength(1);
    expect(result[0]?.model).toBe("claude-new");
  });
});

// executeWithFallback tests use a separate describe block with factory module re-mocked
// to intercept createProvider calls directly (avoids new-constructor mock limitations).
describe("executeWithFallback", () => {
  const originalEnv = process.env;

  const mockRequest: ProviderRequest = {
    agent: "Dispatcher",
    systemPrompt: "test",
    input: {},
    expectedJsonSchemaDescription: "{}",
  };

  const makeResult = (): ProviderResult => ({
    rawText: "{}",
    parsed: {},
    provider: "mock",
    model: "test",
    parseRetries: 0,
    validationPassed: true,
    providerAttempts: 1,
    providerBackoffRetries: 0,
    providerBackoffWaitMs: 0,
    providerRateLimitWaitMs: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedTotalTokens: 0,
    estimatedCostUsd: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Disable provider cache so each createProvider call makes a fresh instance
    process.env = { ...originalEnv, AI_AGENTS_DISABLE_PROVIDER_CACHE: "true" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolveFallbackModels — no fallback configured returns empty array", () => {
    const config: ProviderStageConfig = { type: "mock", model: "m" };
    expect(resolveFallbackModels(config)).toHaveLength(0);
  });

  it("returns primary result when primary succeeds", async () => {
    const result = makeResult();
    vi.mocked(MockProvider).mockImplementation(class {
      generateStructured = vi.fn().mockResolvedValue(result);
    } as any);

    const config: ProviderStageConfig = { type: "mock", model: "primary" };
    const got = await executeWithFallback(config, mockRequest);
    expect(got).toBe(result);
  });

  it("tries fallback when primary fails with recoverable error", async () => {
    const primaryError = Object.assign(new Error("rate limit"), { transient: true, statusCode: 429 });
    const primaryGenerate = vi.fn().mockRejectedValue(primaryError);
    const fallbackResult = makeResult();
    const fallbackGenerate = vi.fn().mockResolvedValue(fallbackResult);
    let callIndex = 0;

    vi.mocked(MockProvider).mockImplementation(class {
      generateStructured = callIndex++ === 0 ? primaryGenerate : fallbackGenerate;
    } as any);

    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModels: [{ type: "mock", model: "fallback" }],
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await executeWithFallback(config, mockRequest);
    expect(result).toBe(fallbackResult);
    expect(primaryGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fallback"));
    warnSpy.mockRestore();
  });

  it("throws immediately on non-recoverable 401 error without trying fallback", async () => {
    const authError = Object.assign(new Error("Unauthorized"), { transient: false, statusCode: 401, errorCode: "http_401" });
    const fallbackGenerate = vi.fn().mockResolvedValue(makeResult());
    let callIndex = 0;

    vi.mocked(MockProvider).mockImplementation(class {
      generateStructured = callIndex++ === 0
        ? vi.fn().mockRejectedValue(authError)
        : fallbackGenerate;
    } as any);

    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModels: [{ type: "mock", model: "fallback" }],
    };

    await expect(executeWithFallback(config, mockRequest)).rejects.toMatchObject({ statusCode: 401 });
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it("throws last error when all fallbacks fail", async () => {
    const recoverableError = Object.assign(new Error("timeout"), { transient: true, errorCode: "timeout" });
    const fallbackError = Object.assign(new Error("fallback timeout"), { transient: true, errorCode: "timeout" });
    let callIndex = 0;

    vi.mocked(MockProvider).mockImplementation(class {
      generateStructured = callIndex++ === 0
        ? vi.fn().mockRejectedValue(recoverableError)
        : vi.fn().mockRejectedValue(fallbackError);
    } as any);

    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModels: [{ type: "mock", model: "fallback" }],
    };

    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(executeWithFallback(config, mockRequest)).rejects.toMatchObject({ message: "fallback timeout" });
  });

  it("backward compat: uses deprecated fallbackModel string as fallback", async () => {
    const primaryError = Object.assign(new Error("503"), { transient: true, statusCode: 503 });
    const fallbackResult = makeResult();
    let callIndex = 0;

    vi.mocked(MockProvider).mockImplementation(class {
      generateStructured = callIndex++ === 0
        ? vi.fn().mockRejectedValue(primaryError)
        : vi.fn().mockResolvedValue(fallbackResult);
    } as any);

    const config: ProviderStageConfig = {
      type: "mock",
      model: "primary",
      fallbackModel: "legacy-fallback-model",
    };

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await executeWithFallback(config, mockRequest);
    expect(result).toBe(fallbackResult);
  });
});
