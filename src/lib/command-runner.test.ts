import { describe, it, expect, vi } from "vitest";
import { 
  selectPackageManager, 
  buildScriptCommand,
  runCommand,
  isGitRepository,
  readPackageScripts,
  getGitChangedFiles
} from "./command-runner.js";
import { existsSync } from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual as any,
    existsSync: vi.fn(),
  };
});

describe("command-runner", () => {
  describe("runCommand", () => {
    it("should successfully run a command", async () => {
      const res = await runCommand({
        command: "echo",
        commandArgs: ["hello"],
        cwd: process.cwd(),
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe("hello");
      expect(res.timedOut).toBe(false);
    });

    it("should handle command errors", async () => {
      const res = await runCommand({
        command: "nonexistent-command",
        commandArgs: [],
        cwd: process.cwd(),
      });
      expect(res.exitCode).toBe(-1);
      expect(res.stderr).toContain("spawn nonexistent-command ENOENT");
    });
  });

  describe("isGitRepository", () => {
    it("should return true for a git repo", async () => {
      expect(await isGitRepository(process.cwd())).toBe(true);
    });

    it("should return false for a non-git directory", async () => {
      const tmp = "/tmp/non-git-dir-" + Date.now();
      expect(await isGitRepository(tmp)).toBe(false);
    });
  });

  describe("readPackageScripts", () => {
    it("should read scripts from package.json", async () => {
      // Assuming we are in the repo root
      const scripts = await readPackageScripts(process.cwd());
      expect(scripts).toBeDefined();
      expect(scripts.test).toBeDefined();
    });

    it("should return empty object if package.json does not exist", async () => {
      const scripts = await readPackageScripts("/tmp");
      expect(scripts).toEqual({});
    });
  });

  describe("buildScriptCommand", () => {
    it("should build npm command", () => {
      const res = buildScriptCommand("npm", "test");
      expect(res.command).toBe("npm");
      expect(res.args).toContain("run");
    });

    it("should handle yarn and bun", () => {
      expect(buildScriptCommand("yarn", "test").command).toBe("yarn");
      expect(buildScriptCommand("bun", "test").command).toBe("bun");
    });
  });

  describe("getGitChangedFiles", () => {
    it("should return files for a git repo", async () => {
      // This will run on the actual repo we are in
      const files = await getGitChangedFiles(process.cwd());
      expect(Array.isArray(files)).toBe(true);
    });

    it("should return empty array for non-repo", async () => {
      expect(await getGitChangedFiles("/tmp")).toEqual([]);
    });
  });
});
