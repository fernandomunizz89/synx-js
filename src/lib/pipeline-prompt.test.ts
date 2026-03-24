import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveStepPrompt } from "./pipeline-prompt.js";
import { loadPromptFile } from "./config.js";
import { exists, readText } from "./fs.js";
import { loadAgentDefinition } from "./agent-registry.js";

// Mocking dependencies
vi.mock("./config.js", () => ({
  loadPromptFile: vi.fn(),
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
  readText: vi.fn(),
}));

vi.mock("./agent-registry.js", () => ({
  loadAgentDefinition: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  agentsDir: () => "/agents",
  repoRoot: () => "/repo",
}));

describe("lib/pipeline-prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves built-in agent prompts", async () => {
    vi.mocked(loadPromptFile).mockResolvedValue("Dispatcher prompt content");
    const prompt = await resolveStepPrompt("Dispatcher");
    expect(prompt).toBe("Dispatcher prompt content");
    expect(loadPromptFile).toHaveBeenCalledWith("dispatcher.md");
  });

  it("resolves custom agent prompts if definition exists", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(loadAgentDefinition).mockResolvedValue({ prompt: "custom.md" } as any);
    vi.mocked(readText).mockResolvedValue("Custom prompt content");

    const prompt = await resolveStepPrompt("CustomAgent");
    expect(prompt).toBe("Custom prompt content");
  });

  it("throws error if agent is unknown", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await expect(resolveStepPrompt("UnknownAgent")).rejects.toThrow("Cannot resolve prompt");
  });
});
