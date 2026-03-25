import { describe, expect, it, vi, beforeEach } from "vitest";
import { configureGoogle } from "./google-config.js";
import { selectOption, promptTextWithDefault } from "../interactive.js";
import { chooseOpenAiCompatibleModel } from "../setup-helpers.js";

vi.mock("../interactive.js", () => ({
  selectOption: vi.fn(),
  promptTextWithDefault: vi.fn(),
  promptRequiredText: vi.fn(),
}));

vi.mock("../setup-helpers.js", () => ({
  chooseOpenAiCompatibleModel: vi.fn(),
}));

describe("lib/setup/google-config", () => {
  let currentGlobal: any;

  beforeEach(() => {
    currentGlobal = {
      providers: {
        dispatcher: { model: "gemini-old" },
      },
    };
    vi.clearAllMocks();
  });

  it("configures google in saved mode", async () => {
    vi.mocked(selectOption).mockResolvedValue("saved");
    vi.mocked(promptTextWithDefault)
      .mockResolvedValueOnce("https://google.api/v1")
      .mockResolvedValueOnce("google-key");
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("gemini-1.5-pro");

    const config = await configureGoogle(currentGlobal);

    expect(config.type).toBe("google");
    expect(config.baseUrl).toBe("https://google.api/v1");
    expect(config.apiKey).toBe("google-key");
    expect(config.model).toBe("gemini-1.5-pro");
  });

  it("configures google in env mode with default variable names", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("env")           // connection mode: env
      .mockResolvedValueOnce("default");      // env var mode: default
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("gemini-1.5-pro");

    const config = await configureGoogle(currentGlobal);

    expect(config.type).toBe("google");
    expect(config.baseUrl).toBeDefined();   // preset base URL set in env mode
    expect(config.apiKey).toBeUndefined();
    expect(config.model).toBe("gemini-1.5-pro");
  });
});
