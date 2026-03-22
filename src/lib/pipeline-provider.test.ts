import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProviderShorthand, resolveStepProvider, resolveStepProviderChain } from "./pipeline-provider.js";
import type { PipelineStep } from "./types.js";

vi.mock("./agent-registry.js", () => ({
  loadAgentDefinition: vi.fn(),
}));

vi.mock("./config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  agentsDir: vi.fn().mockReturnValue("/fake/agents"),
}));

describe("pipeline-provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseProviderShorthand", () => {
    it('returns { type: "openai-compatible", model: "gpt-4o" } for "openai/gpt-4o"', () => {
      const result = parseProviderShorthand("openai/gpt-4o");
      expect(result).toEqual({ type: "openai-compatible", model: "gpt-4o" });
    });

    it('returns { type: "anthropic", model: "claude-opus-4-6" } for "anthropic/claude-opus-4-6"', () => {
      const result = parseProviderShorthand("anthropic/claude-opus-4-6");
      expect(result).toEqual({ type: "anthropic", model: "claude-opus-4-6" });
    });

    it('returns { type: "google", model: "gemini-2.0-flash" } for "google/gemini-2.0-flash"', () => {
      const result = parseProviderShorthand("google/gemini-2.0-flash");
      expect(result).toEqual({ type: "google", model: "gemini-2.0-flash" });
    });

    it('returns { type: "lmstudio", model: "llama-3.1-70b" } for "lmstudio/llama-3.1-70b"', () => {
      const result = parseProviderShorthand("lmstudio/llama-3.1-70b");
      expect(result).toEqual({ type: "lmstudio", model: "llama-3.1-70b" });
    });

    it('returns { type: "mock", model: "static" } for "mock/static"', () => {
      const result = parseProviderShorthand("mock/static");
      expect(result).toEqual({ type: "mock", model: "static" });
    });

    it("throws for shorthand without slash", () => {
      expect(() => parseProviderShorthand("invalid")).toThrow(/Invalid providerOverride shorthand/);
    });

    it("throws with helpful message for unknown provider prefix", () => {
      expect(() => parseProviderShorthand("unknown/model")).toThrow(/Unknown provider "unknown"/);
      expect(() => parseProviderShorthand("unknown/model")).toThrow(/Supported:/);
    });

    it("parses apiKeyEnv query param from shorthand", () => {
      const result = parseProviderShorthand("anthropic/claude-opus-4-6?apiKeyEnv=MY_ANTHROPIC_KEY");
      expect(result).toEqual({ type: "anthropic", model: "claude-opus-4-6", apiKeyEnv: "MY_ANTHROPIC_KEY" });
    });

    it("parses baseUrl query param from shorthand", () => {
      const result = parseProviderShorthand("openai/gpt-4o?baseUrl=https://my-proxy.com/v1");
      expect(result).toEqual({ type: "openai-compatible", model: "gpt-4o", baseUrl: "https://my-proxy.com/v1" });
    });

    it("parses multiple query params from shorthand", () => {
      const result = parseProviderShorthand("openai/gpt-4o?apiKeyEnv=MY_KEY&baseUrl=https://proxy.com/v1&fallbackModel=gpt-3.5-turbo");
      expect(result).toEqual({
        type: "openai-compatible",
        model: "gpt-4o",
        apiKeyEnv: "MY_KEY",
        baseUrl: "https://proxy.com/v1",
        fallbackModel: "gpt-3.5-turbo",
      });
    });

    it("parses baseUrlEnv and apiKey query params", () => {
      const result = parseProviderShorthand("google/gemini-2.0-flash?baseUrlEnv=MY_BASE_URL&apiKey=direct-key");
      expect(result).toEqual({
        type: "google",
        model: "gemini-2.0-flash",
        baseUrlEnv: "MY_BASE_URL",
        apiKey: "direct-key",
      });
    });
  });

  describe("resolveStepProvider", () => {
    it("uses providerOverride when set", async () => {
      const step: PipelineStep = {
        agent: "Synx Front Expert",
        providerOverride: "anthropic/claude-opus-4-6",
      };

      const result = await resolveStepProvider(step);
      expect(result).toEqual({ type: "anthropic", model: "claude-opus-4-6" });
    });

    it("falls back to custom agent provider when agent file exists", async () => {
      const { exists } = await import("./fs.js");
      const { loadAgentDefinition } = await import("./agent-registry.js");

      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(loadAgentDefinition).mockResolvedValue({
        id: "custom-agent",
        name: "Custom Agent",
        prompt: "prompts/custom.md",
        provider: { type: "openai-compatible", model: "gpt-4-turbo" },
        outputSchema: "generic",
      });

      const step: PipelineStep = {
        agent: "custom-agent",
      };

      const result = await resolveStepProvider(step);
      expect(result).toEqual({ type: "openai-compatible", model: "gpt-4-turbo" });
    });

    it("falls back to dispatcher config when no override and not a custom agent", async () => {
      const { exists } = await import("./fs.js");
      const { loadResolvedProjectConfig } = await import("./config.js");

      vi.mocked(exists).mockResolvedValue(false);
      vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
        projectName: "test",
        language: "typescript",
        framework: "nextjs",
        humanReviewer: "User",
        tasksDir: ".ai-agents/tasks",
        providers: {
          dispatcher: { type: "mock", model: "dispatcher-model" },
        },
        agentProviders: {},
      });

      const step: PipelineStep = {
        agent: "Synx Front Expert",
      };

      const result = await resolveStepProvider(step);
      expect(result).toEqual({ type: "mock", model: "dispatcher-model" });
    });
  });

  describe("resolveStepProviderChain", () => {
    it("returns array with only primary provider when no fallbacks defined", async () => {
      const step: PipelineStep = {
        agent: "Synx Front Expert",
        providerOverride: "anthropic/claude-opus-4-6",
      };
      const chain = await resolveStepProviderChain(step);
      expect(chain).toHaveLength(1);
      expect(chain[0]).toEqual({ type: "anthropic", model: "claude-opus-4-6" });
    });

    it("returns primary + fallback providers in order", async () => {
      const step: PipelineStep = {
        agent: "Synx Front Expert",
        providerOverride: "anthropic/claude-opus-4-6",
        providerFallbacks: ["openai/gpt-4o", "google/gemini-2.0-flash"],
      };
      const chain = await resolveStepProviderChain(step);
      expect(chain).toHaveLength(3);
      expect(chain[0]).toEqual({ type: "anthropic", model: "claude-opus-4-6" });
      expect(chain[1]).toEqual({ type: "openai-compatible", model: "gpt-4o" });
      expect(chain[2]).toEqual({ type: "google", model: "gemini-2.0-flash" });
    });

    it("fallbacks support query params", async () => {
      const step: PipelineStep = {
        agent: "Synx Front Expert",
        providerOverride: "anthropic/claude-opus-4-6",
        providerFallbacks: ["openai/gpt-4o?apiKeyEnv=BACKUP_KEY"],
      };
      const chain = await resolveStepProviderChain(step);
      expect(chain[1]).toEqual({ type: "openai-compatible", model: "gpt-4o", apiKeyEnv: "BACKUP_KEY" });
    });
  });
});
