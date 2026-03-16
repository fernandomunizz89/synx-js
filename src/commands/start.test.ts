import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  allTaskIds: vi.fn<() => Promise<string[]>>(),
  loadTaskMeta: vi.fn(),
  writeDaemonState: vi.fn<() => Promise<void>>(),
  logDaemon: vi.fn<() => Promise<void>>(),
  logPollingCycle: vi.fn<() => Promise<void>>(),
  clearStaleLocks: vi.fn<() => Promise<unknown[]>>(),
  recoverInterruptedTasks: vi.fn<() => Promise<unknown[]>>(),
  recoverWorkingFiles: vi.fn<() => Promise<unknown[]>>(),
  processIsRunning: vi.fn<(pid: number) => boolean>(),
  checkProviderHealth: vi.fn(),
  loadResolvedProjectConfig: vi.fn(),
  providerHealthToHuman: vi.fn<(value: string) => string>(),
  collectReadinessReport: vi.fn(),
  printReadinessReport: vi.fn(),
  createStartProgressRenderer: vi.fn(),
  exists: vi.fn<() => Promise<boolean>>(),
  readJson: vi.fn(),
  commandExample: vi.fn<(value: string) => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/task.js", () => ({
  allTaskIds: mocks.allTaskIds,
  loadTaskMeta: mocks.loadTaskMeta,
}));

vi.mock("../lib/logging.js", () => ({
  writeDaemonState: mocks.writeDaemonState,
  logDaemon: mocks.logDaemon,
  logPollingCycle: mocks.logPollingCycle,
}));

vi.mock("../lib/runtime.js", () => ({
  clearStaleLocks: mocks.clearStaleLocks,
  recoverInterruptedTasks: mocks.recoverInterruptedTasks,
  recoverWorkingFiles: mocks.recoverWorkingFiles,
  processIsRunning: mocks.processIsRunning,
}));

vi.mock("../lib/provider-health.js", () => ({
  checkProviderHealth: mocks.checkProviderHealth,
}));

vi.mock("../lib/config.js", () => ({
  loadResolvedProjectConfig: mocks.loadResolvedProjectConfig,
}));

vi.mock("../lib/human-messages.js", () => ({
  providerHealthToHuman: mocks.providerHealthToHuman,
}));

vi.mock("../lib/readiness.js", () => ({
  collectReadinessReport: mocks.collectReadinessReport,
  printReadinessReport: mocks.printReadinessReport,
}));

vi.mock("../lib/start-progress.js", () => ({
  createStartProgressRenderer: mocks.createStartProgressRenderer,
}));

vi.mock("../lib/fs.js", () => ({
  exists: mocks.exists,
  readJson: mocks.readJson,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

import { startCommand } from "./start.js";

describe.sequential("commands/start", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.collectReadinessReport.mockReset().mockResolvedValue({
      ok: false,
      issues: [{ severity: "error", message: "Dispatcher provider unreachable" }],
    });
    mocks.printReadinessReport.mockReset();
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.exists.mockReset().mockResolvedValue(false);
    mocks.readJson.mockReset();
    mocks.writeDaemonState.mockReset().mockResolvedValue(undefined);
    mocks.createStartProgressRenderer.mockReset().mockReturnValue({
      enabled: false,
      setStaticFrame: vi.fn(),
      render: vi.fn(),
      stop: vi.fn(),
    });
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aborts early when readiness has errors and --force is not set", async () => {
    await startCommand.parseAsync(["node", "synx"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Start aborted to prevent failed runs in a broken setup.");
    expect(output).toContain("synx setup");
    expect(output).toContain("synx start --force");
    expect(mocks.writeDaemonState).not.toHaveBeenCalled();
  });
});
