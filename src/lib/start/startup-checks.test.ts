import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkExistingDaemon, performReadinessChecks, getProviderStatus } from "./startup-checks.js";
import path from "node:path";

// Mocking dependencies
vi.mock("../fs.js", () => ({
  exists: vi.fn(),
  readJson: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  runtimeDir: vi.fn(() => "/tmp/synx-runtime"),
}));

vi.mock("../runtime.js", () => ({
  processIsRunning: vi.fn(),
}));

vi.mock("../readiness.js", () => ({
  collectReadinessReport: vi.fn(),
}));

vi.mock("../provider-health.js", () => ({
  checkProviderHealth: vi.fn(),
}));

vi.mock("../config.js", () => ({
  loadResolvedProjectConfig: vi.fn(),
}));

describe("lib/start/startup-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkExistingDaemon", () => {
    it("returns shouldAbort: false if no daemon state exists", async () => {
      const { exists } = await import("../fs.js");
      vi.mocked(exists).mockResolvedValue(false);

      const result = await checkExistingDaemon({});
      expect(result.shouldAbort).toBe(false);
    });

    it("returns shouldAbort: true if another process is running", async () => {
      const { exists, readJson } = await import("../fs.js");
      const { processIsRunning } = await import("../runtime.js");
      
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readJson).mockResolvedValue({ pid: 1234, lastHeartbeatAt: "now" });
      vi.mocked(processIsRunning).mockReturnValue(true);

      const result = await checkExistingDaemon({});
      expect(result.shouldAbort).toBe(true);
      expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("Another engine appears to be running")]));
    });

    it("continues if --force is used", async () => {
      const { exists, readJson } = await import("../fs.js");
      const { processIsRunning } = await import("../runtime.js");
      
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readJson).mockResolvedValue({ pid: 1234 });
      vi.mocked(processIsRunning).mockReturnValue(true);

      const result = await checkExistingDaemon({ force: true });
      expect(result.shouldAbort).toBe(false);
      expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("Continuing due to --force")]));
    });
  });

  describe("performReadinessChecks", () => {
    it("returns shouldAbort: true if readiness fails and no force", async () => {
      const { collectReadinessReport } = await import("../readiness.js");
      vi.mocked(collectReadinessReport).mockResolvedValue({ ok: false } as any);

      const result = await performReadinessChecks({});
      expect(result.shouldAbort).toBe(true);
    });

    it("returns shouldAbort: false if force is used even if readiness fails", async () => {
      const { collectReadinessReport } = await import("../readiness.js");
      vi.mocked(collectReadinessReport).mockResolvedValue({ ok: false } as any);

      const result = await performReadinessChecks({ force: true });
      expect(result.shouldAbort).toBe(false);
    });
  });

  describe("getProviderStatus", () => {
    it("loads config and check health", async () => {
      const { loadResolvedProjectConfig } = await import("../config.js");
      const { checkProviderHealth } = await import("../provider-health.js");

      vi.mocked(loadResolvedProjectConfig).mockResolvedValue({ providers: { dispatcher: "mock" } } as any);
      vi.mocked(checkProviderHealth).mockResolvedValue({ reachable: true, message: "Mock provider is ready." } as any);

      const result = await getProviderStatus();
      expect(result.config.providers.dispatcher).toBe("mock");
      expect(result.health.reachable).toBe(true);
    });
  });
});
