import { describe, it, expect, vi, beforeEach } from "vitest";
import { deliverWebhook } from "./webhooks.js";

vi.mock("./config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("./logging.js", () => ({
  logDaemon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./utils.js", () => ({
  nowIso: vi.fn(() => "2026-03-23T00:00:00.000Z"),
}));

import { loadResolvedProjectConfig } from "./config.js";

const mockLoadResolvedProjectConfig = vi.mocked(loadResolvedProjectConfig);

const baseConfig = {
  projectName: "test",
  language: "typescript",
  framework: "nextjs",
  humanReviewer: "human",
  tasksDir: ".ai-agents/tasks",
  providers: { dispatcher: { type: "mock" as const, model: "test-model" } },
  agentProviders: {},
};

describe("webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("delivers POST to configured URL when enabled", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    mockLoadResolvedProjectConfig.mockResolvedValue({
      ...baseConfig,
      webhooks: {
        enabled: true,
        url: "https://example.com/webhook",
        events: [],
      },
    } as never);

    await deliverWebhook("task.approved", "task-001", { decision: "approved" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/webhook");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as {
      event: string;
      taskId: string;
      data: Record<string, unknown>;
    };
    expect(body.event).toBe("task.approved");
    expect(body.taskId).toBe("task-001");
    expect(body.data).toEqual({ decision: "approved" });
  });

  it("skips delivery when webhooks disabled", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockLoadResolvedProjectConfig.mockResolvedValue({
      ...baseConfig,
      webhooks: {
        enabled: false,
        url: "https://example.com/webhook",
      },
    } as never);

    await deliverWebhook("task.approved", "task-001");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips delivery when event not in allowed events list", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockLoadResolvedProjectConfig.mockResolvedValue({
      ...baseConfig,
      webhooks: {
        enabled: true,
        url: "https://example.com/webhook",
        events: ["task.created"],
      },
    } as never);

    await deliverWebhook("task.approved", "task-001");

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
