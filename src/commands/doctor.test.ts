import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  exists: vi.fn<(targetPath: string) => Promise<boolean>>(),
  listDirectories: vi.fn<() => Promise<string[]>>(),
  loadResolvedProjectConfig: vi.fn(),
  checkProviderHealth: vi.fn(),
  providerHealthToHuman: vi.fn<(value: string) => string>(),
  confirmAction: vi.fn<() => Promise<boolean>>(),
  detectStaleLocks: vi.fn(),
  clearStaleLocks: vi.fn(),
  detectWorkingOrphans: vi.fn(),
  recoverWorkingFiles: vi.fn(),
  detectInterruptedTasks: vi.fn(),
  recoverInterruptedTasks: vi.fn(),
  commandExample: vi.fn<(value: string) => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/fs.js", () => ({
  exists: mocks.exists,
  listDirectories: mocks.listDirectories,
}));

vi.mock("../lib/config.js", () => ({
  loadResolvedProjectConfig: mocks.loadResolvedProjectConfig,
}));

vi.mock("../lib/provider-health.js", () => ({
  checkProviderHealth: mocks.checkProviderHealth,
}));

vi.mock("../lib/human-messages.js", () => ({
  providerHealthToHuman: mocks.providerHealthToHuman,
}));

vi.mock("../lib/interactive.js", () => ({
  confirmAction: mocks.confirmAction,
}));

vi.mock("../lib/runtime.js", () => ({
  detectStaleLocks: mocks.detectStaleLocks,
  clearStaleLocks: mocks.clearStaleLocks,
  detectWorkingOrphans: mocks.detectWorkingOrphans,
  recoverWorkingFiles: mocks.recoverWorkingFiles,
  detectInterruptedTasks: mocks.detectInterruptedTasks,
  recoverInterruptedTasks: mocks.recoverInterruptedTasks,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

import { doctorCommand } from "./doctor.js";

describe.sequential("commands/doctor", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.providerHealthToHuman.mockReset().mockImplementation((value: string) => value);
    mocks.exists.mockReset().mockResolvedValue(true);
    mocks.listDirectories.mockReset().mockResolvedValue([]);
    mocks.loadResolvedProjectConfig.mockReset().mockResolvedValue({
      humanReviewer: "Fernando Muniz",
      providers: {
        dispatcher: { type: "mock", model: "mock-dispatcher-v1" },
        planner: { type: "mock", model: "mock-planner-v1" },
      },
    });
    mocks.checkProviderHealth.mockReset().mockResolvedValue({
      reachable: true,
      modelFound: true,
      message: "Provider is reachable and configured model is available.",
    });
    mocks.detectStaleLocks.mockReset().mockResolvedValue([]);
    mocks.clearStaleLocks.mockReset().mockResolvedValue([]);
    mocks.detectWorkingOrphans.mockReset().mockResolvedValue([]);
    mocks.recoverWorkingFiles.mockReset().mockResolvedValue([]);
    mocks.detectInterruptedTasks.mockReset().mockResolvedValue([]);
    mocks.recoverInterruptedTasks.mockReset().mockResolvedValue([]);
    mocks.confirmAction.mockReset().mockResolvedValue(false);
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prints healthy environment summary when no issues are found", async () => {
    await doctorCommand.parseAsync(["node", "synx"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Doctor results");
    expect(output).toContain("Environment looks healthy.");
    expect(output).toContain("synx new");
  });

  it("applies safe fixes when --fix is provided and issues exist", async () => {
    mocks.exists.mockImplementation(async (targetPath: string) => !targetPath.endsWith("/config.json"));
    mocks.detectStaleLocks.mockResolvedValue([{ file: "task.lock", reason: "old", ageMinutes: 20 }]);
    mocks.clearStaleLocks.mockResolvedValue([{ file: "task.lock", reason: "old", ageMinutes: 20 }]);
    mocks.recoverWorkingFiles.mockResolvedValue([{ taskId: "task-1", file: "04-builder.working.json", action: "requeued", reason: "x" }]);
    mocks.recoverInterruptedTasks.mockResolvedValue([{ taskId: "task-1", action: "requeued", reason: "y", requestFile: "00-dispatcher.request.json" }]);

    await doctorCommand.parseAsync(["node", "synx", "--fix"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Fix summary");
    expect(output).toContain("Stale locks cleared: 1");
    expect(output).toContain("Working files recovered: 1");
    expect(output).toContain("Interrupted tasks requeued: 1");
    expect(mocks.clearStaleLocks).toHaveBeenCalledTimes(1);
    expect(mocks.recoverWorkingFiles).toHaveBeenCalledTimes(1);
    expect(mocks.recoverInterruptedTasks).toHaveBeenCalledTimes(1);
  });
});
