import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverModels, fetchUiConfig, saveSetup } from "./setup.js";

function mockFetch(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ ok, data }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api/setup", () => {
  it("fetchUiConfig loads /api/config", async () => {
    vi.stubGlobal("fetch", mockFetch({ global: null, local: null }));
    const result = await fetchUiConfig();
    expect(result).toEqual({ global: null, local: null });
    expect(fetch).toHaveBeenCalledWith("/api/config", undefined);
  });

  it("discoverModels posts provider type", async () => {
    vi.stubGlobal("fetch", mockFetch({ reachable: true, message: "ok", models: ["gpt-5.4"] }));
    const result = await discoverModels("openai-compatible");
    expect(result.models).toContain("gpt-5.4");
    expect(fetch).toHaveBeenCalledWith("/api/setup/discover-models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerType: "openai-compatible" }),
    });
  });

  it("saveSetup posts setup payload", async () => {
    vi.stubGlobal("fetch", mockFetch({ providerType: "openai-compatible", humanReviewer: "Fernando", model: "gpt-5.4" }));
    await saveSetup({
      humanReviewer: "Fernando",
      providerType: "openai-compatible",
      model: "gpt-5.4",
      plannerSeparate: true,
      plannerProviderType: "openai-compatible",
      plannerModel: "gpt-5.4-mini",
      agentProviders: [],
    });
    expect(fetch).toHaveBeenCalledWith("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        humanReviewer: "Fernando",
        providerType: "openai-compatible",
        model: "gpt-5.4",
        plannerSeparate: true,
        plannerProviderType: "openai-compatible",
        plannerModel: "gpt-5.4-mini",
        agentProviders: [],
      }),
    });
  });
});
