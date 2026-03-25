import { describe, expect, it, vi, beforeEach } from "vitest";
import { configureOpenAiCompatible } from "./openai-config.js";
import { selectOption, promptTextWithDefault } from "../interactive.js";
import { chooseOpenAiCompatibleModel, resolveOpenAiCompatiblePreset } from "../setup-helpers.js";

vi.mock("../interactive.js", () => ({
  selectOption: vi.fn(),
  promptTextWithDefault: vi.fn(),
  promptRequiredText: vi.fn(),
}));

vi.mock("../setup-helpers.js", () => ({
  chooseOpenAiCompatibleModel: vi.fn(),
  defaultOpenAiCompatibleFields: () => ({ baseUrlEnv: "BASE", apiKeyEnv: "KEY" }),
  resolveOpenAiCompatiblePreset: vi.fn(),
}));

describe("lib/setup/openai-config", () => {
  let currentGlobal: any;

  beforeEach(() => {
    currentGlobal = {
      providers: {
        dispatcher: { model: "gpt-old" },
      },
    };
    vi.clearAllMocks();
  });

  it("configures openai compatible provider in saved mode", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("openai")
      .mockResolvedValueOnce("saved");
    vi.mocked(resolveOpenAiCompatiblePreset).mockReturnValue({
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyLabel: "Key",
      modelExamples: [],
    } as any);
    vi.mocked(promptTextWithDefault)
      .mockResolvedValueOnce("https://api.openai.com/v1")
      .mockResolvedValueOnce("sk-123");
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("gpt-4");

    const config = await configureOpenAiCompatible(currentGlobal);

    expect(config.type).toBe("openai-compatible");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.apiKey).toBe("sk-123");
    expect(config.model).toBe("gpt-4");
  });

  it("configures openai compatible provider in env mode with default variable names", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("openai")      // preset
      .mockResolvedValueOnce("env")         // connection mode: env
      .mockResolvedValueOnce("default");    // env var mode: default
    vi.mocked(resolveOpenAiCompatiblePreset).mockReturnValue({
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyLabel: "Key",
      modelExamples: ["gpt-4"],
      defaultBaseUrlEnv: "OPENAI_BASE_URL",
      defaultApiKeyEnv: "OPENAI_API_KEY",
    } as any);
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("gpt-4");

    const config = await configureOpenAiCompatible(currentGlobal);

    expect(config.type).toBe("openai-compatible");
    expect(config.apiKey).toBeUndefined();
    expect(config.model).toBe("gpt-4");
  });
});
