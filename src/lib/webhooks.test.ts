import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("./logging.js", () => ({
  logDaemon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./utils.js", () => ({
  nowIso: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("deliverWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers POST to configured URL when enabled", async () => {
    const { loadResolvedProjectConfig } = await import("./config.js");
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      webhooks: { enabled: true, url: "https://hooks.example.com/synx" },
    } as any);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const { deliverWebhook } = await import("./webhooks.js");
    await deliverWebhook("task.approved", "task-001", { decision: "approved" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/synx");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.event).toBe("task.approved");
    expect(body.taskId).toBe("task-001");
    expect(body.data.decision).toBe("approved");
  });

  it("skips delivery when webhooks disabled", async () => {
    const { loadResolvedProjectConfig } = await import("./config.js");
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      webhooks: { enabled: false, url: "https://hooks.example.com/synx" },
    } as any);

    const { deliverWebhook } = await import("./webhooks.js");
    await deliverWebhook("task.approved", "task-002", {});

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips delivery when event not in allowed events list", async () => {
    const { loadResolvedProjectConfig } = await import("./config.js");
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      webhooks: { enabled: true, url: "https://hooks.example.com/synx", events: ["task.approved"] },
    } as any);

    const { deliverWebhook } = await import("./webhooks.js");
    await deliverWebhook("task.reproved", "task-003", {});

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
