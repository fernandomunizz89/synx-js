import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveEslintDeps, ensureCodeQualityBootstrap } from "./code-quality-bootstrap.js";
import { promises as fs, existsSync } from "node:fs";
import { runCommand } from "./workspace-tools.js";
import path from "node:path";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock("./workspace-tools.js", () => ({
  runCommand: vi.fn(),
}));

describe("code-quality-bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveEslintDeps", () => {
    it("returns eslint when missing", () => {
      const deps = resolveEslintDeps({
        tsProject: false,
        pkg: { devDependencies: {} },
      });
      expect(deps).toContain("eslint");
    });

    it("returns TS deps for TS projects", () => {
      const deps = resolveEslintDeps({
        tsProject: true,
        pkg: { devDependencies: {} },
      });
      expect(deps).toContain("eslint");
      expect(deps).toContain("@typescript-eslint/parser");
      expect(deps).toContain("@typescript-eslint/eslint-plugin");
      expect(deps).toContain("typescript");
    });

    it("does not return existing deps", () => {
      const deps = resolveEslintDeps({
        tsProject: true,
        pkg: { devDependencies: { eslint: "1.0.0", typescript: "1.0.0" } },
      });
      expect(deps).not.toContain("eslint");
      expect(deps).not.toContain("typescript");
      expect(deps).toContain("@typescript-eslint/parser");
    });
  });

  describe("ensureCodeQualityBootstrap", () => {
    const workspaceRoot = "/mock/root";

    it("returns early if package.json does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await ensureCodeQualityBootstrap({ workspaceRoot });
      expect(result.changedFiles).toHaveLength(0);
    });

    it("reports warning if package.json is invalid", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockRejectedValue(new Error("read error"));
      const result = await ensureCodeQualityBootstrap({ workspaceRoot });
      expect(result.warnings).toContain("Code-quality bootstrap skipped: could not parse package.json.");
    });

    it("bootstraps typecheck for TS project without quality scripts", async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("package.json") || p.toString().endsWith("tsconfig.json"));
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: {} }));
      vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, timedOut: false, stdout: "", stderr: "" });
      
      const result = await ensureCodeQualityBootstrap({ workspaceRoot });
      expect(result.notes).toContain('Configured fallback quality script: package.json scripts.typecheck="tsc --noEmit".');
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalled();
    });

    it("handles failed dependency installation", async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("package.json"));
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: {} }));
      vi.mocked(runCommand).mockResolvedValue({ exitCode: 1, timedOut: false, stdout: "", stderr: "" });

      const result = await ensureCodeQualityBootstrap({ workspaceRoot });
      expect(result.warnings[0]).toContain("Failed to install ESLint bootstrap dependencies");
    });

    it("bootstraps eslint config if missing but dependency exists", async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("package.json"));
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ 
        scripts: { lint: "eslint ." },
        devDependencies: { eslint: "latest" }
      }));
      
      // existsSync returns false for config files by default in this mock setup
      const result = await ensureCodeQualityBootstrap({ workspaceRoot });
      expect(result.changedFiles).toContain("eslint.config.cjs");
      expect(result.notes).toContain("Created eslint.config.cjs with a conservative baseline ruleset.");
    });
    
    it("handles bun lockfiles", async () => {
       vi.mocked(existsSync).mockImplementation((p: any) => 
         p.toString().endsWith("package.json") || 
         p.toString().endsWith("bun.lockb")
       );
       vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ scripts: {} }));
       vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, timedOut: false, stdout: "", stderr: "" });
       
       const result = await ensureCodeQualityBootstrap({ workspaceRoot });
       expect(result.changedFiles).toContain("package.json");
    });
  });
});
