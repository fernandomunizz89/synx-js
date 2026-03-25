import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ciCommand } from "./ci.js";
import { Command } from "commander";

describe("ciCommand", () => {
  it("is a Command instance named 'ci'", () => {
    expect(ciCommand).toBeInstanceOf(Command);
    expect(ciCommand.name()).toBe("ci");
  });

  it("has expected options: --timeout, --dry-run, --fail-fast", () => {
    const optionNames = ciCommand.options.map((o) => o.long);
    expect(optionNames).toContain("--timeout");
    expect(optionNames).toContain("--dry-run");
    expect(optionNames).toContain("--fail-fast");
  });

  it("description includes CI/CD", () => {
    expect(ciCommand.description()).toMatch(/CI\/CD/i);
  });
});

// ── Action handler tests ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  clearStaleLocks: vi.fn<() => Promise<void>>(),
  recoverWorkingFiles: vi.fn<() => Promise<unknown[]>>(),
  recoverInterruptedTasks: vi.fn<() => Promise<unknown[]>>(),
  logDaemon: vi.fn<() => Promise<void>>(),
  logRuntimeEvent: vi.fn<() => Promise<void>>(),
  writeDaemonState: vi.fn<() => Promise<void>>(),
  allTaskIds: vi.fn<() => Promise<string[]>>(),
  loadTaskMeta: vi.fn<() => Promise<any>>(),
  processTasksWithConcurrency: vi.fn<() => Promise<any[]>>(),
  persistProjectGraphState: vi.fn<() => Promise<any>>(),
  resolvePollIntervalMs: vi.fn<() => number>(),
  resolveMaxImmediateCycles: vi.fn<() => number>(),
  resolveTaskConcurrency: vi.fn<() => number>(),
  sleep: vi.fn<() => Promise<void>>(),
  nowIso: vi.fn<() => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/runtime.js", () => ({
  clearStaleLocks: mocks.clearStaleLocks,
  recoverWorkingFiles: mocks.recoverWorkingFiles,
  recoverInterruptedTasks: mocks.recoverInterruptedTasks,
}));

vi.mock("../lib/logging.js", () => ({
  logDaemon: mocks.logDaemon,
  logRuntimeEvent: mocks.logRuntimeEvent,
  writeDaemonState: mocks.writeDaemonState,
}));

vi.mock("../lib/task.js", () => ({
  allTaskIds: mocks.allTaskIds,
  loadTaskMeta: mocks.loadTaskMeta,
}));

vi.mock("../lib/start/task-management.js", () => ({
  processTasksWithConcurrency: mocks.processTasksWithConcurrency,
}));

vi.mock("../lib/project-graph.js", () => ({
  persistProjectGraphState: mocks.persistProjectGraphState,
}));

vi.mock("../lib/start/loop-utils.js", () => ({
  resolvePollIntervalMs: mocks.resolvePollIntervalMs,
  resolveMaxImmediateCycles: mocks.resolveMaxImmediateCycles,
  resolveTaskConcurrency: mocks.resolveTaskConcurrency,
}));

vi.mock("../lib/utils.js", () => ({
  sleep: mocks.sleep,
  nowIso: mocks.nowIso,
}));

vi.mock("../workers/index.js", () => ({
  workerList: [{ name: "mock-worker" }],
}));

describe.sequential("ciCommand action handler", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`EXIT:${code}`);
    });

    mocks.ensureGlobalInitialized.mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockResolvedValue(undefined);
    mocks.clearStaleLocks.mockResolvedValue(undefined);
    mocks.recoverWorkingFiles.mockResolvedValue([]);
    mocks.recoverInterruptedTasks.mockResolvedValue([]);
    mocks.logDaemon.mockResolvedValue(undefined);
    mocks.logRuntimeEvent.mockResolvedValue(undefined);
    mocks.writeDaemonState.mockResolvedValue(undefined);
    mocks.resolvePollIntervalMs.mockReturnValue(1000);
    mocks.resolveMaxImmediateCycles.mockReturnValue(3);
    mocks.resolveTaskConcurrency.mockReturnValue(1);
    mocks.nowIso.mockReturnValue("2026-01-01T00:00:00.000Z");
    mocks.allTaskIds.mockResolvedValue(["t-1"]);
    mocks.loadTaskMeta.mockResolvedValue({ taskId: "t-1", title: "Test", status: "done", type: "Feature" });
    mocks.persistProjectGraphState.mockResolvedValue({ readyTaskIds: [] });
    mocks.processTasksWithConcurrency.mockResolvedValue([]);
    mocks.sleep.mockResolvedValue(undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("calls process.exit(0) when all tasks are terminal (done)", async () => {
    await expect(
      ciCommand.parseAsync(["node", "synx", "ci", "--timeout", "10000"])
    ).rejects.toThrow("EXIT:0");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.ensureGlobalInitialized).toHaveBeenCalled();
    expect(mocks.allTaskIds).toHaveBeenCalled();
  });

  it("sets DRY_RUN env when --dry-run is passed", async () => {
    delete process.env.AI_AGENTS_DRY_RUN;
    await expect(
      ciCommand.parseAsync(["node", "synx", "ci", "--timeout", "10000", "--dry-run"])
    ).rejects.toThrow("EXIT:");

    expect(process.env.AI_AGENTS_DRY_RUN).toBe("1");
    delete process.env.AI_AGENTS_DRY_RUN;
  });
});
