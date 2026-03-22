import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  createTaskService: vi.fn<(input: unknown) => Promise<{ taskId: string; taskPath: string }>>(),
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

vi.mock("../lib/services/task-services.js", () => ({
  createTaskService: mocks.createTaskService,
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
    mocks.createTaskService.mockReset().mockResolvedValue({
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
    // @ts-ignore - reset options to avoid interference between tests
    newCommand._optionValues = {};
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
    expect(mocks.createTaskService).toHaveBeenCalledTimes(1);
    const createTaskInput = mocks.createTaskService.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
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

  it("accepts --type in case-insensitive form and normalizes it", async () => {
    await newCommand.parseAsync([
      "node",
      "synx",
      "Normalize type parsing",
      "--type",
      "bUg",
      "--e2e",
      "required",
      "--e2e-framework",
      "playwright",
    ]);

    expect(mocks.createTaskService).toHaveBeenCalledTimes(1);
    const createTaskInput = mocks.createTaskService.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(createTaskInput).toBeDefined();
    expect(createTaskInput).toMatchObject({
      title: "Normalize type parsing",
      typeHint: "Bug",
    });
  });

  it("accepts --type with common feature typo alias", async () => {
    await newCommand.parseAsync([
      "node",
      "synx",
      "Alias type parsing",
      "--type",
      "Featute",
      "--e2e",
      "required",
      "--e2e-framework",
      "playwright",
    ]);

    expect(mocks.createTaskService).toHaveBeenCalledTimes(1);
    const createTaskInput = mocks.createTaskService.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(createTaskInput).toBeDefined();
    expect(createTaskInput).toMatchObject({
      title: "Alias type parsing",
      typeHint: "Feature",
    });
  });

  it("throws error on invalid --type", async () => {
    await expect(newCommand.parseAsync([
      "node",
      "synx",
      "Invalid type",
      "--type",
      "invalid-type"
    ])).rejects.toThrow('Invalid --type value "invalid-type"');
  });

  it("handles interactive prompts when title or type is missing", async () => {
    mocks.promptRequiredText.mockResolvedValue("Interactive Title");
    mocks.selectOption
      .mockResolvedValueOnce("Refactor") // type
      .mockResolvedValueOnce("skip")    // e2ePolicy
      .mockResolvedValueOnce("auto");    // e2eFramework

    await newCommand.parseAsync(["node", "synx"]);

    expect(mocks.promptRequiredText).toHaveBeenCalledWith(expect.stringContaining("Task title"));
    expect(mocks.selectOption).toHaveBeenCalledWith(expect.stringContaining("Choose task type"), expect.anything(), "Feature");
    expect(mocks.createTaskService).toHaveBeenCalledWith(expect.objectContaining({
      title: "Interactive Title",
      typeHint: "Refactor"
    }));
  });

  it("handles different E2E policy aliases", async () => {
    const scenarios = [
      { input: "yes", expected: "required" },
      { input: "no", expected: "skip" },
      { input: "auto", expected: "auto" }
    ];

    for (const { input, expected } of scenarios) {
      mocks.createTaskService.mockClear();
      await newCommand.parseAsync([
        "node",
        "synx",
        "Test E2E",
        "--type",
        "Feature",
        "--e2e",
        input,
        "--e2e-framework",
        "auto"
      ]);
      expect(mocks.createTaskService).toHaveBeenCalledWith(expect.objectContaining({
        extraContext: expect.objectContaining({
          qaPreferences: expect.objectContaining({
            e2ePolicy: expected
          })
        })
      }));
    }
  });

  it("throws error on invalid --e2e", async () => {
    await expect(newCommand.parseAsync([
      "node",
      "synx",
      "Invalid E2E",
      "--e2e",
      "maybe"
    ])).rejects.toThrow('Invalid --e2e value "maybe"');
  });

  it("handles different E2E frameworks", async () => {
    await newCommand.parseAsync([
      "node",
      "synx",
      "Test Framework",
      "--type",
      "Feature",
      "--e2e",
      "required",
      "--e2e-framework",
      "other"
    ]);
    expect(mocks.createTaskService).toHaveBeenCalledWith(expect.objectContaining({
      extraContext: expect.objectContaining({
        qaPreferences: expect.objectContaining({
          e2eFramework: "other"
        })
      })
    }));
  });

  it("throws error on invalid --e2e-framework", async () => {
    await expect(newCommand.parseAsync([
      "node",
      "synx",
      "Invalid Framework",
      "--e2e-framework",
      "selenium"
    ])).rejects.toThrow('Invalid --e2e-framework value "selenium"');
  });

  it("handles mixed/research/docs types", async () => {
    const types = ["Mixed", "Research", "Docs"];
    for (const type of types) {
      mocks.createTaskService.mockClear();
      await newCommand.parseAsync([
        "node", "synx", "Test " + type, "--type", type, "--e2e", "skip", "--e2e-framework", "auto"
      ]);
      const expectedType = type === "Docs" ? "Documentation" : type;
      expect(mocks.createTaskService).toHaveBeenCalledWith(expect.objectContaining({
        typeHint: expectedType
      }));
    }
  });

  it("shows warning when readiness is not ok", async () => {
    mocks.collectReadinessReport.mockResolvedValue({ ok: false, issues: [] });
    await newCommand.parseAsync([
        "node", "synx", "Warning test", "--type", "Bug", "--e2e", "skip", "--e2e-framework", "auto"
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("processing may fail until setup is fixed"));
  });
});
