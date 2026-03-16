import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import type { ProviderRequest } from "../lib/types.js";
import { isTaskCancelRequested } from "../lib/task-cancel.js";

vi.mock("../lib/task-cancel.js", () => {
  return {
    isTaskCancelRequested: vi.fn().mockResolvedValue(false),
  };
});

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.AI_AGENTS_OPENAI_BASE_URL;
const originalApiKey = process.env.AI_AGENTS_OPENAI_API_KEY;
const originalParseRetries = process.env.AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES;
const originalStreaming = process.env.AI_AGENTS_PROVIDER_STREAMING;

function requestBase(): ProviderRequest {
  return {
    agent: "Dispatcher",
    taskId: "task-1",
    stage: "dispatcher",
    taskType: "Feature",
    systemPrompt: "You are dispatcher",
    input: {
      title: "Increase title size",
      typeHint: "Feature",
    },
    expectedJsonSchemaDescription: '{ "nextAgent": "Spec Planner" }',
  };
}

function buildOkJsonResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => null,
    },
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  } as unknown as Response;
}

describe.sequential("providers/openai-compatible-provider", () => {
  beforeEach(() => {
    process.env.AI_AGENTS_OPENAI_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.AI_AGENTS_OPENAI_API_KEY = "local-key";
    process.env.AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES = "1";
    process.env.AI_AGENTS_PROVIDER_STREAMING = "0";
    vi.restoreAllMocks();
    vi.mocked(isTaskCancelRequested).mockResolvedValue(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (typeof originalBaseUrl === "string") process.env.AI_AGENTS_OPENAI_BASE_URL = originalBaseUrl;
    else delete process.env.AI_AGENTS_OPENAI_BASE_URL;
    if (typeof originalApiKey === "string") process.env.AI_AGENTS_OPENAI_API_KEY = originalApiKey;
    else delete process.env.AI_AGENTS_OPENAI_API_KEY;
    if (typeof originalParseRetries === "string") process.env.AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES = originalParseRetries;
    else delete process.env.AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES;
    if (typeof originalStreaming === "string") process.env.AI_AGENTS_PROVIDER_STREAMING = originalStreaming;
    else delete process.env.AI_AGENTS_PROVIDER_STREAMING;

    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("throws when base URL is not configured", () => {
    delete process.env.AI_AGENTS_OPENAI_BASE_URL;
    expect(() => new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    })).toThrow("Missing provider base URL");
  });

  it("returns parsed JSON output on successful call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkJsonResponse('{"nextAgent":"Spec Planner"}'));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });
    const result = await provider.generateStructured(requestBase());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("openai-compatible");
    expect(result.model).toBe("gpt-5.3-codex");
    expect(result.parsed).toMatchObject({ nextAgent: "Spec Planner" });
    expect(result.parseRetries).toBe(0);
    expect(result.estimatedTotalTokens).toBeGreaterThan(0);
  });

  it("retries once when first response is invalid JSON and succeeds on second attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(buildOkJsonResponse("not-json"))
      .mockResolvedValueOnce(buildOkJsonResponse('{"nextAgent":"Spec Planner","retry":true}'));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });
    const result = await provider.generateStructured(requestBase());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.parseRetries).toBe(1);
    expect(result.validationPassed).toBe(true);
    expect(result.parsed).toMatchObject({ retry: true });
  });

  it("throws after exhausting json parse retries", async () => {
    process.env.AI_AGENTS_PROVIDER_JSON_PARSE_RETRIES = "2";
    const fetchMock = vi.fn().mockResolvedValue(buildOkJsonResponse("not-json"));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const promise = provider.generateStructured(requestBase());
    vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Provider JSON parsing failed/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("handles HTTP errors natively", async () => {
    process.env.AI_AGENTS_OPENAI_BASE_URL = "http://httperror:1234/v1";
    process.env.AI_AGENTS_PROVIDER_BACKOFF_MAX_RETRIES = "0";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => "5" },
      text: async () => "Service Unavailable",
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const promise = provider.generateStructured(requestBase());
    await expect(promise).rejects.toThrow(/Provider request failed with 503/);
    
    delete process.env.AI_AGENTS_PROVIDER_BACKOFF_MAX_RETRIES;
  });

  it("handles malformed JSON response bodies gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ unexpected: true }), // No choices
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const promise = provider.generateStructured(requestBase());
    vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Provider JSON parsing failed/);
  });

  it("supports streaming chunks into full text", async () => {
    process.env.AI_AGENTS_PROVIDER_STREAMING = "1";

    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"{\\"next"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Agent\\": \\"Bug "}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Investigator\\"}"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => mockStream.getReader() },
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const result = await provider.generateStructured(requestBase());
    expect(result.parsed).toMatchObject({ nextAgent: "Bug Investigator" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.body).toContain('"stream":true');
  });

  it("handles provider cancellation properly", async () => {
    vi.mocked(isTaskCancelRequested).mockResolvedValue(true);
    
    process.env.AI_AGENTS_OPENAI_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.AI_AGENTS_OPENAI_API_KEY = "local-key";
    process.env.AI_AGENTS_PROVIDER_TIMEOUT_MS = "1000";

    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const promise = provider.generateStructured(requestBase());
    // Attach catch handler immediately to avoid unhandledRejection events during timer flush
    const expectPromise = expect(promise).rejects.toThrow(/Task cancellation requested/);
    // Wait for the abort to trigger by advancing clocks past polling intervals
    await vi.advanceTimersByTimeAsync(2000);
    
    await expectPromise;
    delete process.env.AI_AGENTS_PROVIDER_TIMEOUT_MS;
  });

  it("handles context budget truncation", async () => {
    process.env.AI_AGENTS_PROVIDER_MAX_INPUT_CHARS = "10";
    process.env.AI_AGENTS_PROVIDER_MAX_CONTEXT_CHARS = "5000";

    const fetchMock = vi.fn().mockResolvedValue(buildOkJsonResponse('{"nextAgent":"Spec Planner"}'));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const request = requestBase();
    request.input = {
      title: "x".repeat(150000),
    };
    const result = await provider.generateStructured(request);
    expect(result.parsed).toBeDefined();
    
    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.body).toContain('budget control');
    
    delete process.env.AI_AGENTS_PROVIDER_MAX_INPUT_CHARS;
    delete process.env.AI_AGENTS_PROVIDER_MAX_CONTEXT_CHARS;
  });

  it("delays on rate limits", async () => {
    vi.useRealTimers();
    process.env.AI_AGENTS_OPENAI_BASE_URL = "http://ratelimit:1234/v1";
    process.env.AI_AGENTS_PROVIDER_MAX_REQUESTS_PER_MINUTE = "1";
    process.env.AI_AGENTS_PROVIDER_RATE_LIMIT_WINDOW_MS = "100";

    const fetchMock = vi.fn().mockResolvedValue(buildOkJsonResponse('{"nextAgent":"Spec Planner"}'));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    // Fire two requests, the second should have rateLimitWaitMs populated
    const p1 = provider.generateStructured(requestBase());
    // Since rate limiter triggers sleep natively, we just await!
    const p2 = provider.generateStructured(requestBase());
    
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.providerRateLimitWaitMs).toBe(0);
    expect(res2.providerRateLimitWaitMs).toBeGreaterThan(0);
    
    delete process.env.AI_AGENTS_PROVIDER_MAX_REQUESTS_PER_MINUTE;
    delete process.env.AI_AGENTS_PROVIDER_RATE_LIMIT_WINDOW_MS;
  });

  it("waits on concurrency slot", async () => {
    vi.useRealTimers();
    process.env.AI_AGENTS_OPENAI_BASE_URL = "http://concurrency:1234/v1";
    process.env.AI_AGENTS_PROVIDER_MAX_CONCURRENT_REQUESTS = "1";
    
    // Instead of manual releaseReq, just wait fake time
    const fetchMock = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(buildOkJsonResponse('{"nextAgent":"Spec Planner"}')), 100);
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      type: "openai-compatible",
      model: "gpt-5.3-codex",
    });

    const p1 = provider.generateStructured(requestBase());
    const p2 = provider.generateStructured(requestBase());
    
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res2.providerRateLimitWaitMs).toBeGreaterThan(0);
    
    delete process.env.AI_AGENTS_PROVIDER_MAX_CONCURRENT_REQUESTS;
  });
});

