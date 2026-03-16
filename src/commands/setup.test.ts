import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGlobalInitialized: vi.fn<() => Promise<void>>(),
  ensureProjectInitialized: vi.fn<() => Promise<void>>(),
  readJson: vi.fn<(filePath: string) => Promise<unknown>>(),
  writeJson: vi.fn<(filePath: string, data: unknown) => Promise<void>>(),
  checkProviderHealth: vi.fn(),
  discoverProviderModels: vi.fn(),
  confirmAction: vi.fn(),
  promptRequiredText: vi.fn(),
  promptTextWithDefault: vi.fn(),
  selectOption: vi.fn(),
  providerHealthToHuman: vi.fn<(value: string) => string>(),
  commandExample: vi.fn<(value: string) => string>(),
}));

vi.mock("../lib/bootstrap.js", () => ({
  ensureGlobalInitialized: mocks.ensureGlobalInitialized,
  ensureProjectInitialized: mocks.ensureProjectInitialized,
}));

vi.mock("../lib/fs.js", () => ({
  readJson: mocks.readJson,
  writeJson: mocks.writeJson,
}));

vi.mock("../lib/provider-health.js", () => ({
  checkProviderHealth: mocks.checkProviderHealth,
  discoverProviderModels: mocks.discoverProviderModels,
}));

vi.mock("../lib/interactive.js", () => ({
  confirmAction: mocks.confirmAction,
  promptRequiredText: mocks.promptRequiredText,
  promptTextWithDefault: mocks.promptTextWithDefault,
  selectOption: mocks.selectOption,
}));

vi.mock("../lib/human-messages.js", () => ({
  providerHealthToHuman: mocks.providerHealthToHuman,
}));

vi.mock("../lib/cli-command.js", () => ({
  commandExample: mocks.commandExample,
}));

import { setupCommand } from "./setup.js";

describe.sequential("commands/setup", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    mocks.ensureGlobalInitialized.mockReset().mockResolvedValue(undefined);
    mocks.ensureProjectInitialized.mockReset().mockResolvedValue(undefined);
    mocks.readJson.mockReset()
      .mockResolvedValueOnce({
        providers: {
          dispatcher: { type: "mock", model: "old-dispatcher" },
          planner: { type: "mock", model: "old-planner" },
        },
        defaults: {
          humanReviewer: "Old Reviewer",
        },
      })
      .mockResolvedValueOnce({
        projectName: "my-pomodoro",
        language: "TypeScript",
        framework: "React",
        humanReviewer: "Old Reviewer",
        tasksDir: ".ai-agents/tasks",
      });
    mocks.writeJson.mockReset().mockResolvedValue(undefined);
    mocks.promptRequiredText.mockReset().mockResolvedValue("Fernando Muniz");
    mocks.selectOption.mockReset().mockResolvedValue("mock");
    mocks.checkProviderHealth.mockReset().mockResolvedValue({
      reachable: true,
      modelFound: true,
      message: "Provider is reachable and configured model is available.",
    });
    mocks.providerHealthToHuman.mockReset().mockImplementation((value: string) => value);
    mocks.commandExample.mockReset().mockImplementation((value: string) => `synx ${value}`);
    mocks.confirmAction.mockReset().mockResolvedValue(true);
    mocks.promptTextWithDefault.mockReset().mockResolvedValue("");
    mocks.discoverProviderModels.mockReset().mockResolvedValue({
      reachable: true,
      models: ["mock-model"],
      message: "ok",
    });
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("completes setup using mock provider choice and persists configs", async () => {
    await setupCommand.parseAsync(["node", "synx"]);

    expect(mocks.writeJson).toHaveBeenCalledTimes(2);
    const globalConfigWrite = mocks.writeJson.mock.calls[0]?.[1] as unknown as {
      defaults: { humanReviewer: string };
      providers: { dispatcher: { type: string }; planner: { type: string } };
    };
    const localConfigWrite = mocks.writeJson.mock.calls[1]?.[1] as unknown as { humanReviewer: string };

    expect(globalConfigWrite.defaults.humanReviewer).toBe("Fernando Muniz");
    expect(globalConfigWrite.providers.dispatcher.type).toBe("mock");
    expect(globalConfigWrite.providers.planner.type).toBe("mock");
    expect(localConfigWrite.humanReviewer).toBe("Fernando Muniz");

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Setup complete.");
    expect(output).toContain("synx start");
  });
});
