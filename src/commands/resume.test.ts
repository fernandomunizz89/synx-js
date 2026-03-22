import { describe, expect, it, vi, beforeEach } from "vitest";
import { resumeCommand } from "./resume.js";
import * as bootstrap from "../lib/bootstrap.js";
import * as runtime from "../lib/runtime.js";

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: vi.fn(),
  ensureProjectInitialized: vi.fn(),
}));

vi.mock("../lib/runtime.js", () => ({
  clearStaleLocks: vi.fn().mockResolvedValue([]),
  recoverInterruptedTasks: vi.fn().mockResolvedValue([]),
  recoverWorkingFiles: vi.fn().mockResolvedValue([]),
}));

describe("commands/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("applies all resume actions and reports summary", async () => {
    vi.mocked(runtime.clearStaleLocks).mockResolvedValue([{ file: "l1", reason: "old", ageMinutes: 60 }]);
    vi.mocked(runtime.recoverWorkingFiles).mockResolvedValue([
        { taskId: "t1", file: "f1", action: "requeued", reason: "ok" },
        { taskId: "t1", file: "f2", action: "moved_to_failed", reason: "duplicate" }
    ]);
    vi.mocked(runtime.recoverInterruptedTasks).mockResolvedValue([
        { taskId: "t1", action: "requeued", reason: "safe" },
        { taskId: "t2", action: "skipped", reason: "unknown" }
    ]);

    await resumeCommand.parseAsync(["node", "resume"]);

    expect(bootstrap.ensureGlobalInitialized).toHaveBeenCalled();
    expect(bootstrap.ensureProjectInitialized).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Stale locks cleared: 1"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Working files recovered: 2"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Interrupted tasks requeued: 1"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Interrupted tasks still needing manual review: 1"));
  });
});
