import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGlobalInitialized, ensureProjectInitialized } from "./bootstrap.js";
import { appendText, ensureDir, exists, readText, writeJson, writeText } from "./fs.js";

const pathMocks = vi.hoisted(() => ({
  repoRoot: vi.fn<() => string>(() => "/target/repo"),
}));

vi.mock("./fs.js", () => ({
  exists: vi.fn(),
  writeJson: vi.fn(),
  writeText: vi.fn(),
  readText: vi.fn(),
  ensureDir: vi.fn(),
  appendText: vi.fn(),
}));

vi.mock("./paths.js", () => ({
  globalAiRoot: () => "/global/ai",
  globalConfigPath: () => "/global/ai/config.json",
  repoRoot: pathMocks.repoRoot,
  configDir: () => path.join(pathMocks.repoRoot(), ".ai-agents/config"),
  promptsDir: () => path.join(pathMocks.repoRoot(), ".ai-agents/prompts"),
  runtimeDir: () => path.join(pathMocks.repoRoot(), ".ai-agents/runtime"),
  logsDir: () => path.join(pathMocks.repoRoot(), ".ai-agents/logs"),
  tasksDir: () => path.join(pathMocks.repoRoot(), ".ai-agents/tasks"),
}));

describe("lib/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathMocks.repoRoot.mockReset().mockReturnValue("/target/repo");
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
    it("creates .gitignore with .ai-agents/ when missing in target repo", async () => {
      vi.mocked(exists).mockImplementation(async (filePath: string) => filePath !== "/target/repo/.gitignore");
      await ensureProjectInitialized();
      expect(writeText).toHaveBeenCalledWith("/target/repo/.gitignore", ".ai-agents/\n");
    });

    it("appends .ai-agents/ when target gitignore exists without the entry", async () => {
      vi.mocked(exists).mockImplementation(async (filePath: string) => filePath === "/target/repo/.gitignore");
      vi.mocked(readText).mockResolvedValue("# Dependencies\nnode_modules/\n");
      await ensureProjectInitialized();
      expect(appendText).toHaveBeenCalledWith("/target/repo/.gitignore", ".ai-agents/\n");
    });

    it("never updates .gitignore when bootstrapping inside synx repository", async () => {
      const synxRepoRoot = process.cwd();
      pathMocks.repoRoot.mockReturnValue(synxRepoRoot);
      vi.mocked(exists).mockResolvedValue(false);
      await ensureProjectInitialized();
      expect(writeText).not.toHaveBeenCalledWith(path.join(synxRepoRoot, ".gitignore"), expect.any(String));
      expect(readText).not.toHaveBeenCalledWith(path.join(synxRepoRoot, ".gitignore"));
      expect(appendText).not.toHaveBeenCalledWith(path.join(synxRepoRoot, ".gitignore"), expect.any(String));
    });
  });
});
