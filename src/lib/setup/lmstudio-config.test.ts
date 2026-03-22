import { describe, expect, it, vi, beforeEach } from "vitest";
import { configureLmStudio } from "./lmstudio-config.js";
import { selectOption, promptTextWithDefault } from "../interactive.js";
import { chooseOpenAiCompatibleModel } from "../setup-helpers.js";

vi.mock("../interactive.js", () => ({
  selectOption: vi.fn(),
  promptTextWithDefault: vi.fn(),
  promptRequiredText: vi.fn(),
}));

vi.mock("../setup-helpers.js", () => ({
  chooseOpenAiCompatibleModel: vi.fn(),
  defaultOpenAiCompatibleFields: () => ({ baseUrlEnv: "BASE", apiKeyEnv: "KEY" }),
  DEFAULT_LM_STUDIO_API_KEY_ENV: "BASE",
  DEFAULT_LM_STUDIO_BASE_URL_ENV: "KEY",
}));

describe("lib/setup/lmstudio-config", () => {
  let currentGlobal: any;

  beforeEach(() => {
    currentGlobal = {
      providers: {
        dispatcher: { model: "auto" },
      },
    };
    vi.clearAllMocks();
  });

  it("configures lmstudio in saved-recommended mode with auto model", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("saved-recommended")
      .mockResolvedValueOnce("auto");
    vi.mocked(promptTextWithDefault).mockResolvedValue("");

    const config = await configureLmStudio(currentGlobal);

    expect(config.type).toBe("lmstudio");
    expect(config.model).toBe("auto");
    expect(config.autoDiscoverModel).toBe(true);
  });

  it("configures lmstudio in saved-custom mode with fixed model", async () => {
    vi.mocked(selectOption)
      .mockResolvedValueOnce("saved-custom")
      .mockResolvedValueOnce("fixed");
    vi.mocked(promptTextWithDefault)
      .mockResolvedValueOnce("http://localhost:1234")
      .mockResolvedValueOnce("dummy");
    vi.mocked(chooseOpenAiCompatibleModel).mockResolvedValue("fixed-model");

    const config = await configureLmStudio(currentGlobal);

    expect(config.baseUrl).toBe("http://localhost:1234");
    expect(config.model).toBe("fixed-model");
    expect(config.autoDiscoverModel).toBe(false);
  });
});
