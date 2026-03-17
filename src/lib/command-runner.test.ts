import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  selectPackageManager, 
  buildScriptCommand,
  buildScriptCommand as _buildScriptCommand // Alias for testing different managers
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
  describe("selectPackageManager", () => {
    it("should select pnpm if pnpm-lock.yaml exists", () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("pnpm-lock.yaml"));
      expect(selectPackageManager("/root")).toBe("pnpm");
    });

    it("should select yarn if yarn.lock exists", () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("yarn.lock"));
      expect(selectPackageManager("/root")).toBe("yarn");
    });

    it("should default to npm", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(selectPackageManager("/root")).toBe("npm");
    });
  });

  describe("buildScriptCommand", () => {
    it("should build npm command", () => {
      const res = buildScriptCommand("npm", "test");
      expect(res.command).toBe("npm");
      expect(res.args).toContain("run");
      expect(res.args).toContain("test");
    });

    it("should build pnpm command with if-present", () => {
      const res = buildScriptCommand("pnpm", "build");
      expect(res.command).toBe("pnpm");
      expect(res.args).toContain("--if-present");
    });

    it("should include extra args", () => {
      const res = buildScriptCommand("npm", "test", ["--watch"]);
      expect(res.args).toContain("--watch");
      expect(res.args).toContain("--");
    });
  });
});
