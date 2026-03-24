import { describe, expect, it, vi, beforeEach } from "vitest";
import { ensureGlobalInitialized, ensureProjectInitialized } from "./bootstrap.js";
import { exists, writeJson, writeText, ensureDir } from "./fs.js";
import { globalConfigPath } from "./paths.js";

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
  writeJson: vi.fn(),
  writeText: vi.fn(),
  ensureDir: vi.fn(),
  appendText: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  globalAiRoot: () => "/global/ai",
  globalConfigPath: () => "/global/ai/config.json",
  configDir: () => "/project/.ai-agents/config",
  promptsDir: () => "/project/.ai-agents/prompts",
  runtimeDir: () => "/project/.ai-agents/runtime",
  logsDir: () => "/project/.ai-agents/logs",
  tasksDir: () => "/project/.ai-agents/tasks",
}));

describe("lib/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureGlobalInitialized", () => {
    it("creates global config if missing", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      await ensureGlobalInitialized();
      expect(ensureDir).toHaveBeenCalledWith("/global/ai");
      expect(writeJson).toHaveBeenCalledWith("/global/ai/config.json", expect.any(Object));
    });

    it("skips if already exists", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      await ensureGlobalInitialized();
      expect(writeJson).not.toHaveBeenCalled();
    });
  });

  describe("ensureProjectInitialized", () => {
    it("creates project structure and default prompts", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      await ensureProjectInitialized();
      expect(ensureDir).toHaveBeenCalled();
      expect(writeJson).toHaveBeenCalled();
      expect(writeText).toHaveBeenCalled();
    });
  });
});
