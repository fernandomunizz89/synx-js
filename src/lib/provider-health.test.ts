import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkProviderHealth, discoverProviderModels } from "./provider-health.js";
import * as lmstudio from "./lmstudio.js";
import * as modelSupport from "./model-support.js";

describe("provider-health", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("process", {
      env: {
        AI_AGENTS_PROVIDER_DISCOVERY_TIMEOUT_MS: "1000",
        AI_AGENTS_OPENAI_BASE_URL: "http://openai.api",
        AI_AGENTS_OPENAI_API_KEY: "sk-test",
        AI_AGENTS_ANTHROPIC_API_KEY: "sk-anthropic",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("discoverProviderModels", () => {
    it("should handle mock provider", async () => {
      const config = { type: "mock" as const, model: "test-model" };
      const result = await discoverProviderModels(config);
      expect(result).toEqual({
        reachable: true,
        message: "Mock provider is ready.",
        models: ["test-model"],
      });
    });

    it("should handle missing base URL for openai-compatible", async () => {
      vi.stubGlobal("process", { env: {} });
    const config = { type: "openai-compatible" as const, model: "test-model" };
    const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("Missing provider base URL");
    });

    it("should fetch models successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "model-1" }, { id: "model-2" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { 
        type: "openai-compatible" as const, 
        model: "model-1",
        baseUrl: "http://api.test"
      };
    const result = await discoverProviderModels(config);
      
      expect(result.reachable).toBe(true);
      expect(result.models).toEqual(["model-1", "model-2"]);
    });

    it("should handle fetch timeout", async () => {
      const mockFetch = vi.fn().mockRejectedValue({ name: "AbortError" });
      vi.stubGlobal("fetch", mockFetch);

      const config = { 
        type: "openai-compatible" as const, 
        model: "model-1",
        baseUrl: "http://api.test"
      };
    const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("timed out");
    });

    it("should handle non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal error"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { 
        type: "openai-compatible" as const, 
        model: "model-1",
        baseUrl: "http://api.test"
      };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("Internal error");
    });

    it("should handle invalid JSON response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Parse error")),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { 
        type: "openai-compatible" as const, 
        model: "model-1",
        baseUrl: "http://api.test"
      };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("invalid models response");
    });

    it("should handle missing API key for anthropic", async () => {
      vi.stubGlobal("process", {
        env: {
          AI_AGENTS_ANTHROPIC_BASE_URL: "https://api.anthropic.com",
        },
      });

      const config = { type: "anthropic" as const, model: "claude-code" };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("Missing Anthropic API key");
    });

    it("should fetch anthropic models successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ id: "claude-code" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "anthropic" as const, model: "claude-code", baseUrl: "https://api.anthropic.com" };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(true);
      expect(result.models).toEqual(["claude-code"]);
    });

    it("should handle lmstudio provider", async () => {
      const mockBridgeConfig = { 
        type: "openai-compatible" as const, 
        model: "auto", 
        baseUrl: "http://localhost:1234/v1" 
      };
      vi.spyOn(lmstudio, "toLmStudioBridgeProviderConfig").mockReturnValue(mockBridgeConfig);
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "lms-model" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "lmstudio" as const, model: "auto" };
      const result = await discoverProviderModels(config);
      
      expect(result.reachable).toBe(true);
      expect(result.models).toEqual(["lms-model"]);
    });

    it("should handle missing API key for google", async () => {
      vi.stubGlobal("process", { env: {} });
      const config = { type: "google" as const, model: "gemini-pro" };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("Missing Google provider API key");
    });

    it("should fetch google models successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: "gemini-pro" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "google" as const, model: "gemini-pro", apiKey: "g-key" };
      const result = await discoverProviderModels(config);
      expect(result.reachable).toBe(true);
      expect(result.models).toEqual(["gemini-pro"]);
    });
  });

  describe("checkProviderHealth", () => {
    it("should return healthy for mock provider", async () => {
      const config = { type: "mock" as const, model: "test-model" };
      const result = await checkProviderHealth(config);
      expect(result.modelFound).toBe(true);
    });

    it("should handle unreachable provider", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "openai-compatible" as const, model: "test-model", baseUrl: "http://fail" };
      const result = await checkProviderHealth(config);
      expect(result.reachable).toBe(false);
      expect(result.message).toContain("Connection refused");
    });

    it("should handle empty model list", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "openai-compatible" as const, model: "test-model", baseUrl: "http://api" };
      const result = await checkProviderHealth(config);
      expect(result.reachable).toBe(true);
      expect(result.modelFound).toBe(false);
      expect(result.message).toContain("returned no models");
    });

    it("should validate model match", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "correct-model" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "openai-compatible" as const, model: "correct-model", baseUrl: "http://api" };
      const result = await checkProviderHealth(config);
      expect(result.modelFound).toBe(true);
    });

    it("should handle close match", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "other-model" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);
      
      // Mock findDiscoveredModelMatch to return a close match
      vi.spyOn(modelSupport, "findDiscoveredModelMatch").mockReturnValue({
        exact: false,
        matchedModel: "other-model",
      });

      const config = { type: "openai-compatible" as const, model: "wrong-model", baseUrl: "http://api" };
      const result = await checkProviderHealth(config);
      expect(result.modelFound).toBe(false);
      expect(result.message).toContain("Closest discovered model: other-model");
    });

    it("should handle lmstudio auto-discovery", async () => {
       vi.spyOn(lmstudio, "resolveLmStudioRuntimeSettings").mockReturnValue({
        configuredModel: "auto",
        fallbackModel: "",
        autoDiscoverModel: true,
        baseUrlRoot: "http://localhost:1234",
        baseUrlApi: "http://localhost:1234/v1",
        apiKey: "any",
        baseUrlEnv: "",
        apiKeyEnv: "",
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "auto-selected" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "lmstudio" as const, model: "auto" };
      const result = await checkProviderHealth(config);
      expect(result.reachable).toBe(true);
      expect(result.modelFound).toBe(true);
      expect(result.modelFound).toBe(true);
      expect(result.message).toContain("auto-discovery selected model: auto-selected");
    });

    it("should validate anthropic model", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ id: "claude-code" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "anthropic" as const, model: "claude-code", baseUrl: "https://api.anthropic.com" };
      const result = await checkProviderHealth(config);
      expect(result.reachable).toBe(true);
      expect(result.modelFound).toBe(true);
      expect(result.message).toContain("discovered model: claude-code");
    });

    it("should validate google model", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: "gemini-pro" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = { type: "google" as const, model: "gemini-pro", apiKey: "g-key" };
      const result = await checkProviderHealth(config);
      expect(result.reachable).toBe(true);
      expect(result.modelFound).toBe(true);
      expect(result.message).toContain("discovered model: gemini-pro");
    });

    it("should handle lmstudio fallback when target is auto and auto-discovery is disabled", async () => {
        vi.spyOn(lmstudio, "resolveLmStudioRuntimeSettings").mockReturnValue({
         configuredModel: "AUTO",
         fallbackModel: "fallback-model",
         autoDiscoverModel: false,
         baseUrlRoot: "http://localhost:1234",
         baseUrlApi: "http://localhost:1234/v1",
         apiKey: "any",
         baseUrlEnv: "",
         apiKeyEnv: "",
       });
 
       // Mock findDiscoveredModelMatch to return the fallback
       vi.spyOn(modelSupport, "findDiscoveredModelMatch").mockReturnValue({
         exact: true,
         matchedModel: "fallback-model",
       });
 
       const mockFetch = vi.fn().mockResolvedValue({
         ok: true,
         json: () => Promise.resolve({ data: [{ id: "fallback-model" }] }),
       });
       vi.stubGlobal("fetch", mockFetch);
 
       const config = { type: "lmstudio" as const, model: "AUTO" };
       const result = await checkProviderHealth(config);
       expect(result.reachable).toBe(true);
       expect(result.modelFound).toBe(true);
       expect(result.message).toContain("fallback model is loaded: fallback-model");
     });

     it("should handle lmstudio failure when auto-discovery disabled and no fallback matches", async () => {
        vi.spyOn(lmstudio, "resolveLmStudioRuntimeSettings").mockReturnValue({
         configuredModel: "AUTO",
         fallbackModel: "non-existent",
         autoDiscoverModel: false,
         baseUrlRoot: "http://localhost:1234",
         baseUrlApi: "http://localhost:1234/v1",
         apiKey: "any",
         baseUrlEnv: "",
         apiKeyEnv: "",
       });

       // Mock findDiscoveredModelMatch to return no match
       vi.spyOn(modelSupport, "findDiscoveredModelMatch").mockReturnValue(null);

       const mockFetch = vi.fn().mockResolvedValue({
         ok: true,
         json: () => Promise.resolve({ data: [{ id: "some-other-model" }] }),
       });
       vi.stubGlobal("fetch", mockFetch);

       const config = { type: "lmstudio" as const, model: "AUTO" };
       const result = await checkProviderHealth(config);
       expect(result.reachable).toBe(true);
       expect(result.modelFound).toBe(false);
       expect(result.message).toContain("no fixed loaded model could be resolved");
     });

    it("checkProviderHealth returns latencyMs for mock provider", async () => {
      const config = { type: "mock" as const, model: "mock-model" };
      const result = await checkProviderHealth(config);
      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.reachable).toBe(true);
    });
  });
});
