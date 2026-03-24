import { describe, expect, it, vi, beforeEach } from "vitest";
import { GoogleProvider } from "./google-provider.js";
import { isTaskCancelRequested } from "../lib/task-cancel.js";

// Mock global fetch
global.fetch = vi.fn();

vi.mock("../lib/task-cancel.js", () => ({
  isTaskCancelRequested: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/utils.js", () => ({
  extractJsonFromText: vi.fn((text) => JSON.parse(text)),
}));

describe("providers/google-provider", () => {
  const config = {
    type: "google",
    model: "gemini-pro",
    baseUrl: "https://google.api",
    apiKey: "test-key",
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error if missing config", () => {
    expect(() => new GoogleProvider({ ...config, apiKey: "" })).toThrow("Missing Google provider API key");
  });

  it("calls google api and parses response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: '{"result": "ok"}' }] } }],
      }),
    } as any);

    const provider = new GoogleProvider(config);
    const result = await provider.generateStructured({
      agent: "A",
      taskId: "t1",
      systemPrompt: "S",
      input: {},
    } as any);

    expect(result.parsed).toEqual({ result: "ok" });
    expect(result.provider).toBe("google");
    expect(fetch).toHaveBeenCalled();
  });

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network fail"));
    const provider = new GoogleProvider(config);
    await expect(provider.generateStructured({
      agent: "A",
      taskId: "t1",
      systemPrompt: "S",
      input: {},
    } as any)).rejects.toThrow("Network fail");
  });
});
