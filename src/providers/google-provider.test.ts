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


  it("throws error for missing model", () => {
    expect(() => new GoogleProvider({ ...config, model: "" })).toThrow("Google provider requires a model id.");
  });

  it("extracts text from various google response formats", async () => {
    const provider = new GoogleProvider(config);
    const baseRequest = { agent: "A", taskId: "t1", systemPrompt: "S", input: {} } as any;

    // Helper to mock successful JSON response
    const mockSuccess = (data: any) => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      } as any);
    };

    // Format 1: candidate.output
    mockSuccess({ candidates: [{ output: '{"format": "output"}' }] });
    let res = await provider.generateStructured(baseRequest);
    expect(res.parsed).toEqual({ format: "output" });

    // Format 2: parts as objects with text (handled by loop)
    mockSuccess({ candidates: [{ content: { parts: [{ text: '{"format": "parts-obj"}' }] } }] });
    res = await provider.generateStructured(baseRequest);
    expect(res.parsed).toEqual({ format: "parts-obj" });

    // Format 3: content.text
    mockSuccess({ candidates: [{ content: { text: '{"format": "text"}' } }] });
    res = await provider.generateStructured(baseRequest);
    expect(res.parsed).toEqual({ format: "text" });

    // Format 4: fallback to JSON stringify
    // To reach line 128, we need candidates[0] to be an object, but no output/content
    const fallbackData = { candidates: [{ some: "other" }] };
    mockSuccess(fallbackData);
    res = await provider.generateStructured(baseRequest);
    // extractCandidateText should return JSON.stringify(fallbackData, null, 2)
    // extractJsonFromText (mocked as JSON.parse) should parse it back
    expect(res.parsed).toEqual(fallbackData);
  });

  it("handles non-ok response with body text", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Permission denied"),
    } as any);
    const provider = new GoogleProvider(config);
    await expect(provider.generateStructured({ agent: "A", taskId: "t1", systemPrompt: "S", input: {} } as any))
      .rejects.toThrow("Google provider returned 403: Permission denied");
  });

  it("handles task cancellation", async () => {
    vi.mocked(isTaskCancelRequested).mockResolvedValue(true);
    
    // Mock fetch to reject when signal is aborted
    vi.mocked(fetch).mockImplementation((_url, init: any) => {
      return new Promise((_, reject) => {
        const check = () => {
          if (init?.signal?.aborted) {
            reject(new Error("Aborted"));
            return true;
          }
          return false;
        };
        if (check()) return;
        init?.signal?.addEventListener("abort", check);
      });
    });

    let caught = false;
    const provider = new GoogleProvider(config);
    try {
      await provider.generateStructured({ agent: "A", taskId: "t1", systemPrompt: "S", input: {} } as any);
    } catch (e: any) {
      if (e.message.includes("Task cancellation requested")) {
        caught = true;
      }
    }
    expect(caught).toBe(true);
  });

  it("throws after exhausting parse retries", async () => {
    // Mock TWICE because it retries
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ output: "not-json" }] }),
    } as any);
    const provider = new GoogleProvider(config);
    await expect(provider.generateStructured({ agent: "A", taskId: "t1", systemPrompt: "S", input: {} } as any))
      .rejects.toThrow(/JSON parsing failed after 2 attempt/);
  });
});
