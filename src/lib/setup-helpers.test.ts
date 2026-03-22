import { describe, expect, it, vi, beforeEach } from "vitest";
import { isProviderHealthy, resolveOpenAiCompatiblePreset, printSetupFixHints, chooseOpenAiCompatibleModel } from "./setup-helpers.js";
import { discoverProviderModels } from "./provider-health.js";
import { selectOption, promptTextWithDefault } from "./interactive.js";

// Mocking dependencies
vi.mock("./provider-health.js", () => ({
  discoverProviderModels: vi.fn(),
}));

vi.mock("./interactive.js", () => ({
  selectOption: vi.fn(),
  promptTextWithDefault: vi.fn(),
  promptRequiredText: vi.fn(),
}));

describe("lib/setup-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isProviderHealthy", () => {
    it("returns true if reachable and model found", () => {
      expect(isProviderHealthy({ reachable: true, modelFound: true } as any)).toBe(true);
      expect(isProviderHealthy({ reachable: true } as any)).toBe(true);
    });
    it("returns false if not reachable or model not found", () => {
      expect(isProviderHealthy({ reachable: false, modelFound: true } as any)).toBe(false);
      expect(isProviderHealthy({ reachable: true, modelFound: false } as any)).toBe(false);
    });
  });

  describe("resolveOpenAiCompatiblePreset", () => {
    it("resolves openai preset", () => {
      const preset = resolveOpenAiCompatiblePreset("openai");
      expect(preset.label).toContain("OpenAI");
      expect(preset.baseUrl).toBe("https://api.openai.com/v1");
    });
    it("resolves openrouter preset", () => {
      const preset = resolveOpenAiCompatiblePreset("openrouter");
      expect(preset.label).toContain("OpenRouter");
    });
  });

  describe("printSetupFixHints", () => {
    it("prints hints based on health message", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      printSetupFixHints("Test", { message: "missing environment variable" } as any, { baseUrlEnv: "VAR" } as any);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Re-run setup"));
      consoleSpy.mockRestore();
    });
  });

  describe("chooseOpenAiCompatibleModel", () => {
    it("allows selecting a discovered model", async () => {
      vi.mocked(discoverProviderModels).mockResolvedValue({
        reachable: true,
        models: ["gpt-4", "gpt-3.5"],
        message: "ok",
      });
      vi.mocked(selectOption).mockResolvedValue("gpt-4");

      const model = await chooseOpenAiCompatibleModel({ type: "openai-compatible" } as any);
      expect(model).toBe("gpt-4");
    });

    it("allows manual entry if discovery fails", async () => {
      vi.mocked(discoverProviderModels).mockResolvedValue({
        reachable: false,
        models: [],
        message: "failed",
      });
      vi.mocked(promptTextWithDefault).mockResolvedValue("manual-model");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const model = await chooseOpenAiCompatibleModel({ type: "openai-compatible", model: "old-model" } as any);
      expect(model).toBe("manual-model");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Model discovery note"));
      consoleSpy.mockRestore();
    });
  });
});
