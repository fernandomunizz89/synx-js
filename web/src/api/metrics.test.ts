import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchMetricsOverview,
  fetchTimeline,
  fetchAgents,
  fetchProjects,
} from "./metrics.js";

function mockFetch(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ ok, data }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api/metrics", () => {
  it("fetchMetricsOverview calls /api/metrics/overview", async () => {
    const overview = { taskMetrics: { totalTasks: 5 } };
    vi.stubGlobal("fetch", mockFetch(overview));
    const result = await fetchMetricsOverview();
    expect(result).toEqual(overview);
    expect(fetch).toHaveBeenCalledWith("/api/metrics/overview");
  });

  it("fetchTimeline calls the correct URL with days param", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    await fetchTimeline(30);
    expect(fetch).toHaveBeenCalledWith("/api/metrics/timeline?days=30");
  });

  it("fetchAgents calls /api/metrics/agents", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    await fetchAgents();
    expect(fetch).toHaveBeenCalledWith("/api/metrics/agents");
  });

  it("fetchProjects calls /api/metrics/projects", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    await fetchProjects();
    expect(fetch).toHaveBeenCalledWith("/api/metrics/projects");
  });

  it("apiFetch throws the server error message when ok is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: "unauthorized" }),
    }));
    await expect(fetchMetricsOverview()).rejects.toThrow("unauthorized");
  });
});
