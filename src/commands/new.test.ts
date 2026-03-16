import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  createTask: vi.fn<(input: unknown) => Promise<{ taskId: string; taskPath: string }>>(),
  collectReadinessReport: vi.fn<() => Promise<{ ok: boolean; issues: Array<{ severity: "error" | "warning"; message: string }> }>>(),
  printReadinessReport: vi.fn(),
  promptRequiredText: vi.fn<() => Promise<string>>(),
  selectOption: vi.fn<() => Promise<string>>(),
  resolveTaskQaPreferences: vi.fn(),
  commandExample: vi.fn<(value: string) => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/task.js", () => ({
  createTask: mocks.createTask,
}));

vi.mock("../lib/readiness.js", () => ({
  collectReadinessReport: mocks.collectReadinessReport,
  printReadinessReport: mocks.printReadinessReport,
}));

vi.mock("../lib/interactive.js", () => ({
  promptRequiredText: mocks.promptRequiredText,
  selectOption: mocks.selectOption,
}));

vi.mock("../lib/qa-preferences.js", () => ({
  resolveTaskQaPreferences: mocks.resolveTaskQaPreferences,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

import { newCommand } from "./new.js";

describe.sequential("commands/new", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.createTask.mockReset().mockResolvedValue({
      taskId: "task-1",
      taskPath: "/tmp/task-1",
    });
    mocks.collectReadinessReport.mockReset().mockResolvedValue({ ok: true, issues: [] });
    mocks.printReadinessReport.mockReset();
    mocks.promptRequiredText.mockReset();
    mocks.selectOption.mockReset();
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.resolveTaskQaPreferences.mockReset().mockReturnValue({
      e2ePolicy: "required",
      e2eFramework: "playwright",
      objective: "Make Playwright E2E tests pass.",
    });
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task from explicit CLI options without interactive prompts", async () => {
    await newCommand.parseAsync([
      "node",
      "synx",
      "Fix timer export",
      "--type",
      "Bug",
      "--project",
      "my-pomodoro",
      "--raw",
      "Uncaught SyntaxError",
      "--e2e",
      "required",
      "--e2e-framework",
      "playwright",
      "--qa-objective",
      "Pass all main flows",
    ]);

    expect(mocks.promptRequiredText).not.toHaveBeenCalled();
    expect(mocks.selectOption).not.toHaveBeenCalled();
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    const createTaskInput = mocks.createTask.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(createTaskInput).toBeDefined();
    expect(createTaskInput).toMatchObject({
      title: "Fix timer export",
      typeHint: "Bug",
      project: "my-pomodoro",
      rawRequest: "Uncaught SyntaxError",
      extraContext: {
        qaPreferences: {
          e2ePolicy: "required",
          e2eFramework: "playwright",
          objective: "Make Playwright E2E tests pass.",
        },
      },
    });
  });
});
