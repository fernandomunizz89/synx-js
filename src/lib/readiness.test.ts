import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectReadinessReport, type ReadinessReport } from "./readiness.js";
import { loadResolvedProjectConfig } from "./config.js";
import { checkProviderHealth } from "./provider-health.js";
import { exists } from "./fs.js";
import type { ResolvedProjectConfig } from "./types.js";

vi.mock("./config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
}));

vi.mock("./provider-health.js", () => ({
  checkProviderHealth: vi.fn(),
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
}));

vi.mock("./human-messages.js", () => ({
  providerHealthToHuman: vi.fn((msg) => msg),
}));

describe("readiness checks", () => {
  const dummyConfig: ResolvedProjectConfig = {
    projectName: "test-project",
    language: "TypeScript",
    framework: "Node",
    tasksDir: ".ai-agents/tasks",
    humanReviewer: "yes",
    providers: {
      dispatcher: { type: "openai-compatible", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
      planner: { type: "openai-compatible", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok if all files exist and providers are healthy", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue(dummyConfig);
    vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: true, modelFound: true, message: "" } as any);

    const report = await collectReadinessReport({ includeProviderChecks: true });
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("reports missing prompt files as errors", async () => {
    vi.mocked(exists).mockResolvedValue(false); // mock missing
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue(dummyConfig);
    vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: true, modelFound: true, message: "" } as any);

    const report = await collectReadinessReport({ includeProviderChecks: false });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("Prompt file missing"))).toBe(true);
  });

  it("reports missing humanReviewer field", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({ ...dummyConfig, humanReviewer: "  " });
    vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: true, modelFound: true, message: "" } as any);

    const report = await collectReadinessReport({ includeProviderChecks: false });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("Human reviewer is missing"))).toBe(true);
  });

  it("reports missing provider models", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue({
      ...dummyConfig,
      providers: {
        dispatcher: { type: "openai-compatible", model: "  ", baseUrl: "https://api.openai.com/v1" },
        planner: { type: "openai-compatible", model: "  ", baseUrl: "https://api.openai.com/v1" },
      },
    });
    vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: true, modelFound: true, message: "" } as any);

    const report = await collectReadinessReport({ includeProviderChecks: true });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("Dispatcher model is empty"))).toBe(true);
    expect(report.issues.some((i) => i.message.includes("Planner model is empty"))).toBe(true);
  });

  it("reports provider health errors", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(loadResolvedProjectConfig).mockResolvedValue(dummyConfig);
    // Unreachable
    vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: false, modelFound: false, message: "Network Error" } as any);

    const report = await collectReadinessReport({ includeProviderChecks: true });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("Network Error"))).toBe(true);
  });
});
