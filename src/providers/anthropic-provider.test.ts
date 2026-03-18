import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "./anthropic-provider.js";

const originalFetch = globalThis.fetch;

describe("providers/anthropic-provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.AI_AGENTS_ANTHROPIC_API_KEY = "sk-anthropic";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("submits the Anthropic complete request and parses JSON", async () => {
    const completion = { completion: '{"outcome":"ok"}' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => completion,
    });
    globalThis.fetch = fetchMock;

    const provider = new AnthropicProvider({ type: "anthropic", model: "claude-code" });
    const request = {
      agent: "Dispatcher",
      systemPrompt: "System context",
      input: { goal: "test" },
      expectedJsonSchemaDescription: "{ \"outcome\": string }",
    } as const;

    const result = await provider.generateStructured(request);

    expect(fetchMock).toHaveBeenCalled();
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-code");
    expect(result.parsed).toEqual({ outcome: "ok" });
  });

  it("throws when HTTP response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    globalThis.fetch = fetchMock;

    const provider = new AnthropicProvider({ type: "anthropic", model: "claude-code" });

    await expect(provider.generateStructured({
      agent: "Dispatcher",
      systemPrompt: "",
      input: {},
      expectedJsonSchemaDescription: "{}",
    } as const)).rejects.toThrow("Anthropic provider returned 401");
  });

  it("throws when API key is missing", () => {
    delete process.env.AI_AGENTS_ANTHROPIC_API_KEY;
    expect(() => new AnthropicProvider({ type: "anthropic", model: "claude-code" })).toThrow("Missing Anthropic API key");
  });
});
