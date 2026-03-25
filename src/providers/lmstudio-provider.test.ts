import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverProviderModels: vi.fn(),
  logProviderModelResolution: vi.fn<() => Promise<void>>(),
  bridgeGenerateStructured: vi.fn(),
  bridgeCtorConfig: [] as Array<Record<string, unknown>>,
}));

vi.mock("../lib/provider-health.js", () => ({
  discoverProviderModels: mocks.discoverProviderModels,
}));

vi.mock("../lib/logging.js", () => ({
  logProviderModelResolution: mocks.logProviderModelResolution,
}));

vi.mock("./openai-compatible-provider.js", () => ({
  OpenAiCompatibleProvider: class {
    constructor(config: Record<string, unknown>) {
      mocks.bridgeCtorConfig.push(config);
    }

    async generateStructured(request: unknown): Promise<unknown> {
      return mocks.bridgeGenerateStructured(request);
    }
  },
}));

import { LmStudioProvider } from "./lmstudio-provider.js";

describe.sequential("providers/lmstudio-provider", () => {
  beforeEach(() => {
    mocks.discoverProviderModels.mockReset();
    mocks.logProviderModelResolution.mockReset().mockResolvedValue(undefined);
    mocks.bridgeGenerateStructured.mockReset().mockResolvedValue({
      rawText: '{"ok":true}',
      parsed: { ok: true },
      provider: "openai-compatible",
      model: "placeholder",
      parseRetries: 0,
      validationPassed: true,
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      estimatedInputTokens: 1,
      estimatedOutputTokens: 1,
      estimatedTotalTokens: 2,
      estimatedCostUsd: 0,
    });
    mocks.bridgeCtorConfig.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("auto-discovers loaded model and routes request through bridge provider", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: true,
      models: ["qwen/qwen3-coder-30b", "google/gemma-3-27b"],
      message: "ok",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      autoDiscoverModel: true,
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lm-studio-local",
    });

    const result = await provider.generateStructured({
      agent: "Dispatcher",
      taskId: "task-1",
      stage: "dispatcher",
      systemPrompt: "x",
      input: { typeHint: "Feature" },
      expectedJsonSchemaDescription: "{}",
    });

    expect(result.provider).toBe("lmstudio");
    expect(result.model).toBe("qwen/qwen3-coder-30b");
    expect(mocks.bridgeCtorConfig).toHaveLength(1);
    expect(mocks.discoverProviderModels).toHaveBeenCalledTimes(1);
  });

  it("uses fallback model when autodiscovery is unreachable", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: false,
      models: [],
      message: "connection refused",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      fallbackModel: "google/gemma-3-27b",
      autoDiscoverModel: true,
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lm-studio-local",
    });

    const result = await provider.generateStructured({
      agent: "Dispatcher",
      taskId: "task-2",
      stage: "planner",
      systemPrompt: "x",
      input: { task: { typeHint: "Feature" } },
      expectedJsonSchemaDescription: "{}",
    });

    expect(result.model).toBe("google/gemma-3-27b");
  });

  it("picks configured model when it matches a loaded model", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: true,
      models: ["model-a", "model-b"],
      message: "ok",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "model-b",
      autoDiscoverModel: true,
    });

    const result = await provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any);
    expect(result.model).toBe("model-b");
  });

  it("picks fallback model when autodiscovery is true and configured is auto", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: true,
      models: ["other", "fallback-id"],
      message: "ok",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      fallbackModel: "fallback-id",
      autoDiscoverModel: true,
    });

    const result = await provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any);
    expect(result.model).toBe("fallback-id");
  });

  it("reuses lastAutoModel when it still exists in discovered models", async () => {
    mocks.discoverProviderModels.mockResolvedValueOnce({
      reachable: true,
      models: ["model-1", "model-2"],
      message: "ok",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      autoDiscoverModel: true,
    });

    // First call sets lastAutoModel to model-1
    await provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any);
    
    // Change models but keep model-1
    mocks.discoverProviderModels.mockResolvedValueOnce({
      reachable: true,
      models: ["model-3", "model-1"],
      message: "ok",
    });

    const result = await provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any);
    expect(result.model).toBe("model-1"); // Sticky
  });

  it("throws if discovery returns no models", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: true,
      models: [],
      message: "ok",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      autoDiscoverModel: true,
    });

    await expect(provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any))
      .rejects.toThrow(/LM Studio model autodiscovery failed: ok/);
  });

  it("uses fallback model when discovery is disabled and model is auto", async () => {
    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      fallbackModel: "fixed-fallback",
      autoDiscoverModel: false,
    });

    const result = await provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any);
    expect(result.model).toBe("fixed-fallback");
  });

  it("throws when discovery is disabled, model is auto, and no fallback is set", async () => {
    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      autoDiscoverModel: false,
    });

    await expect(provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any))
      .rejects.toThrow("LM Studio autodiscovery is disabled but no fixed model is configured");
  });

  it("throws when autodiscovery fails and no fallback is available", async () => {
    mocks.discoverProviderModels.mockResolvedValue({
      reachable: false,
      models: [],
      message: "no connection",
    });

    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "auto",
      autoDiscoverModel: true,
    });

    await expect(provider.generateStructured({ agent: "A", taskId: "t", input: {} } as any))
      .rejects.toThrow(/LM Studio model autodiscovery failed: no connection/);
  });
});
