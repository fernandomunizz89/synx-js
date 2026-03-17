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

vi.mock("../lib/paths.js", () => ({
  globalConfigPath: () => "/home/user/.ai-agents/global-config.json",
  aiRoot: () => "/project/.ai-agents",
  promptsDir: () => "/project/.ai-agents/prompts",
  tasksDir: () => "/project/.ai-agents/tasks",
}));

import { doctorCommand } from "./doctor.js";

describe.sequential("commands/doctor", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    doctorCommand.setOptionValue("fix", undefined);
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
  });

  it("handles missing global config and prompt files", async () => {
    mocks.exists.mockImplementation(async (targetPath: string) => {
        if (targetPath.endsWith("global-config.json")) return false;
        if (targetPath.endsWith("dispatcher.md")) return false;
        return true;
    });
    
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✗ Global config: Missing global config.");
    expect(output).toContain("✗ Prompt files: Missing 1 file(s): dispatcher.md");
  });

  it("handles empty human reviewer name", async () => {
    mocks.loadResolvedProjectConfig.mockResolvedValue({
      humanReviewer: " ",
      providers: {
        dispatcher: { type: "mock", model: "m" },
        planner: { type: "mock", model: "m" },
      },
    });
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✗ Human reviewer: Missing reviewer name.");
  });

  it("validates provider environment variables and URLs", async () => {
    mocks.loadResolvedProjectConfig.mockResolvedValue({
      humanReviewer: "Dev",
      providers: {
        dispatcher: { 
            type: "openai-compatible", 
            model: "m", 
            baseUrl: "not-a-url",
            apiKey: " "
        },
        planner: { type: "mock", model: "m" },
      },
    });
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✗ Dispatcher provider env vars: Missing: provider.apiKey | Invalid: base URL is not a valid http(s) URL (not-a-url)");
  });

  it("handles lmstudio provider type", async () => {
    mocks.loadResolvedProjectConfig.mockResolvedValue({
      humanReviewer: "Dev",
      providers: {
        dispatcher: { type: "lmstudio", model: "m" },
        planner: { type: "mock", model: "m" },
      },
    });
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✓ Dispatcher provider env vars: LM Studio provider resolves connection");
  });

  it("handles unreachable providers", async () => {
    mocks.checkProviderHealth.mockResolvedValue({
      reachable: false,
      message: "Connection refused",
    });
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✗ Dispatcher provider: Connection refused");
  });

  it("handles interrupted tasks requiring manual review", async () => {
    mocks.detectInterruptedTasks.mockResolvedValue([
        { taskId: "task-1", action: "requeued" },
        { taskId: "task-2", action: "manual_review" }
    ]);
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("✗ Interrupted tasks: 1 recoverable and 1 requiring manual review.");
  });

  it("reports unresolved interrupted tasks after fix", async () => {
    mocks.confirmAction.mockResolvedValue(true);
    mocks.detectInterruptedTasks.mockResolvedValue([{ taskId: "task-1", action: "manual_review" }]);
    mocks.recoverInterruptedTasks.mockResolvedValue([{ taskId: "task-1", action: "manual_review" }]);
    
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("- Interrupted tasks still requiring manual review: 1");
  });

  it("skips fixes if user cancels confirmation", async () => {
    mocks.confirmAction.mockResolvedValue(false);
    mocks.detectStaleLocks.mockResolvedValue([{ file: "lock" }]);
    
    await doctorCommand.parseAsync(["node", "synx"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No fixes applied.");
  });
});
