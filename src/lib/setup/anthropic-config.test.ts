import { describe, expect, it, vi, beforeEach } from "vitest";
import { configureAnthropic } from "./anthropic-config.js";
import { selectOption, promptTextWithDefault, promptRequiredText } from "../interactive.js";
import { chooseOpenAiCompatibleModel } from "../setup-helpers.js";

vi.mock("../interactive.js", () => ({
  selectOption: vi.fn(),
  promptTextWithDefault: vi.fn(),
  promptRequiredText: vi.fn(),
}));

vi.mock("../setup-helpers.js", () => ({
  chooseOpenAiCompatibleModel: vi.fn(),
}));

describe("lib/setup/anthropic-config", () => {
  let currentGlobal: any;

  beforeEach(() => {
    currentGlobal = {
      providers: {
        dispatcher: { model: "claude-old" },
      },
    };
    vi.clearAllMocks();
  });

  it("configures anthropic in saved mode", async () => {
    vi.mocked(selectOption).mockResolvedValue("saved");
    vi.mocked(promptTextWithDefault)
      .mockResolvedValueOnce("https://custom.anthropic.com");
    vi.mocked(promptRequiredText)
      .mockResolvedValueOnce("sk-ant-123");
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("claude-3-5-sonnet");

    const config = await configureAnthropic(currentGlobal);

    expect(config.type).toBe("anthropic");
    expect(config.baseUrl).toBe("https://custom.anthropic.com");
    expect(config.apiKey).toBe("sk-ant-123");
    expect(config.model).toBe("claude-3-5-sonnet");
  });

  it("configures anthropic in env mode with custom names", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("env")
      .mockResolvedValueOnce("custom");
    vi.mocked(promptRequiredText)
      .mockResolvedValueOnce("MY_BASE_URL")
      .mockResolvedValueOnce("MY_API_KEY");
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("claude-3-opus");

    const config = await configureAnthropic(currentGlobal);

    expect(config.baseUrlEnv).toBe("MY_BASE_URL");
    expect(config.apiKeyEnv).toBe("MY_API_KEY");
    expect(config.model).toBe("claude-3-opus");
  });
});
