import { describe, expect, it, vi, beforeEach } from "vitest";
import { fixCommand } from "./fix.js";
import { Command } from "commander";
import * as bootstrap from "../lib/bootstrap.js";
import * as interactive from "../lib/interactive.js";
import * as runtime from "../lib/runtime.js";

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/interactive.js", () => ({
  confirmAction: vi.fn(),
  selectMany: vi.fn(),
}));

vi.mock("../lib/runtime.js", () => ({
  clearStaleLocks: vi.fn().mockResolvedValue([]),
  recoverInterruptedTasks: vi.fn().mockResolvedValue([]),
  recoverWorkingFiles: vi.fn().mockResolvedValue([]),
}));

describe("commands/fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Reset commander options to avoid state bleeding between tests
    const opts = fixCommand.opts();
    Object.keys(opts).forEach(key => fixCommand.setOptionValue(key, undefined));
  });

  it("applies all fixes when --all is provided", async () => {
    vi.mocked(interactive.confirmAction).mockResolvedValue(true);
    
    await fixCommand.parseAsync(["node", "fix", "--all", "--yes"]);

    expect(bootstrap.ensureGlobalInitialized).toHaveBeenCalled();
    expect(bootstrap.ensureProjectInitialized).toHaveBeenCalled();
    expect(runtime.clearStaleLocks).toHaveBeenCalled();
    expect(runtime.recoverInterruptedTasks).toHaveBeenCalled();
    expect(runtime.recoverWorkingFiles).toHaveBeenCalled();
  });

  it("applies specific fixes when flags are provided", async () => {
    await fixCommand.parseAsync(["node", "fix", "--locks", "--yes"]);

    expect(bootstrap.ensureGlobalInitialized).not.toHaveBeenCalled();
    expect(runtime.clearStaleLocks).toHaveBeenCalled();
    expect(runtime.recoverInterruptedTasks).not.toHaveBeenCalled();
  });

  it("prompts for actions if none are provided", async () => {
    vi.mocked(interactive.selectMany).mockResolvedValue(["bootstrap"]);
    vi.mocked(interactive.confirmAction).mockResolvedValue(true);

    await fixCommand.parseAsync(["node", "fix"]);

    expect(interactive.selectMany).toHaveBeenCalled();
    expect(bootstrap.ensureGlobalInitialized).toHaveBeenCalled();
  });

  it("aborts if no actions are selected in prompt", async () => {
    vi.mocked(interactive.selectMany).mockResolvedValue([]);

    await fixCommand.parseAsync(["node", "fix"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No fix actions selected."));
    expect(bootstrap.ensureGlobalInitialized).not.toHaveBeenCalled();
  });

  it("aborts if user cancels confirmation", async () => {
    vi.mocked(interactive.confirmAction).mockResolvedValue(false);

    await fixCommand.parseAsync(["node", "fix", "--all"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Fix canceled."));
    expect(bootstrap.ensureGlobalInitialized).not.toHaveBeenCalled();
  });

  it("reports recovered items correctly", async () => {
    vi.mocked(runtime.clearStaleLocks).mockResolvedValue([
      { file: "lock1", reason: "old", ageMinutes: 60 },
      { file: "lock2", reason: "dead pid", ageMinutes: 10, pid: 999 }
    ]);
    vi.mocked(runtime.recoverInterruptedTasks).mockResolvedValue([
        { taskId: "t1", action: "requeued", reason: "safe" },
        { taskId: "t2", action: "skipped", reason: "unknown" }
    ]);

    await fixCommand.parseAsync(["node", "fix", "--locks", "--tasks", "--yes"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Stale locks cleared: 2"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Interrupted tasks requeued: 1"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Interrupted tasks that still need manual check: 1"));
  });
});
