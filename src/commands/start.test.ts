import { describe, expect, it, vi, beforeEach } from "vitest";
import { startCommand } from "./start.js";
import * as bootstrap from "../lib/bootstrap.js";
import * as startupChecks from "../lib/start/startup-checks.js";
import * as logging from "../lib/logging.js";
import * as runtime from "../lib/runtime.js";
import * as task from "../lib/task.js";
import * as taskManagement from "../lib/start/task-management.js";

vi.mock("../lib/bootstrap.js");
vi.mock("../lib/start/startup-checks.js");
vi.mock("../lib/logging.js");
vi.mock("../lib/runtime.js");
vi.mock("../lib/task.js");
vi.mock("../lib/start/task-management.js");
vi.mock("../lib/utils.js", () => ({
  sleep: vi.fn(),
  nowIso: vi.fn(() => "2023-01-01T00:00:00Z")
}));

describe("commands/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks to avoid early aborts
    vi.mocked(startupChecks.checkExistingDaemon).mockResolvedValue({ shouldAbort: false, messages: [] });
    vi.mocked(startupChecks.performReadinessChecks).mockResolvedValue({ shouldAbort: false, report: { ok: true, issues: [] } as any });
    vi.mocked(startupChecks.getProviderStatus).mockResolvedValue({ 
      config: { humanReviewer: "reviewer", providers: { dispatcher: "openai" } }, 
      health: { message: "reachable" } 
    } as any);
    vi.mocked(runtime.clearStaleLocks).mockResolvedValue([]);
    vi.mocked(runtime.recoverWorkingFiles).mockResolvedValue([]);
    vi.mocked(runtime.recoverInterruptedTasks).mockResolvedValue([]);
    vi.mocked(task.allTaskIds).mockResolvedValue([]);
    vi.mocked(runtime.consumeRuntimeControl).mockResolvedValue(null);
  });

  it("aborts if daemon check fails", async () => {
    vi.mocked(startupChecks.checkExistingDaemon).mockResolvedValue({ shouldAbort: true, messages: ["Busy"] });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    // We use exitOverride to prevent process.exit if commander uses it
    startCommand.exitOverride();
    await startCommand.parseAsync(["node", "start"], { from: "node" });
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("stop the other process"));
  });

  it("aborts if readiness check fails", async () => {
    vi.mocked(startupChecks.performReadinessChecks).mockResolvedValue({ shouldAbort: true, report: { ok: false, issues: ["Broken"] } as any });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    startCommand.exitOverride();
    await startCommand.parseAsync(["node", "start"], { from: "node" });
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Start aborted"));
  });

  it("runs the loop once and stops", async () => {
    vi.mocked(runtime.consumeRuntimeControl)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ command: "stop", requestedBy: "test", reason: "done" } as any);

    vi.mocked(task.allTaskIds).mockResolvedValue(["T1"]);
    vi.mocked(taskManagement.processTasksWithConcurrency).mockResolvedValue([{ taskId: "T1", processedStages: 1 }]);
    vi.mocked(taskManagement.loadMetasSafe).mockResolvedValue([{ taskId: "T1", status: "success" } as any]);

    startCommand.exitOverride();
    await startCommand.parseAsync(["node", "start", "--no-progress"], { from: "node" });

    expect(taskManagement.processTasksWithConcurrency).toHaveBeenCalled();
    expect(logging.logPollingCycle).toHaveBeenCalled();
  });
});
