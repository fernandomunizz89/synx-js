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
      agent: "Spec Planner",
      taskId: "task-2",
      stage: "planner",
      systemPrompt: "x",
      input: { task: { typeHint: "Feature" } },
      expectedJsonSchemaDescription: "{}",
    });

    expect(result.model).toBe("google/gemma-3-27b");
  });

  it("uses fixed model when autodiscovery is disabled", async () => {
    const provider = new LmStudioProvider({
      type: "lmstudio",
      model: "mistralai/devstral-small-2-2512",
      autoDiscoverModel: false,
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lm-studio-local",
    });

    const result = await provider.generateStructured({
      agent: "Reviewer",
      taskId: "task-3",
      stage: "reviewer",
      systemPrompt: "x",
      input: {},
      expectedJsonSchemaDescription: "{}",
    });

    expect(result.model).toBe("mistralai/devstral-small-2-2512");
    expect(mocks.discoverProviderModels).not.toHaveBeenCalled();
  });
});
