import { describe, expect, it, vi, beforeEach } from "vitest";
import { selectPackageManager, readPackageJson, walkFiles, detectLanguages, detectFrameworksFromDeps, summarizeScripts, collectProjectProfile } from "./project-detector.js";
import { existsSync, promises as fs } from "node:fs";

// Mocking dependencies
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

vi.mock("./workspace-tools.js", () => ({
  detectTestCapabilities: vi.fn().mockResolvedValue({ hasVitest: true, hasJest: false, hasPlaywright: true }),
}));

describe("lib/project-detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selectPackageManager", () => {
    it("detects pnpm", () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.includes("pnpm-lock.yaml"));
      expect(selectPackageManager("/root")).toBe("pnpm");
    });
    it("detects yarn", () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.includes("yarn.lock"));
      expect(selectPackageManager("/root")).toBe("yarn");
    });
    it("detects bun", () => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.includes("bun.lockb"));
      expect(selectPackageManager("/root")).toBe("bun");
    });
    it("defaults to npm", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(selectPackageManager("/root")).toBe("npm");
    });
  });

  describe("readPackageJson", () => {
    it("reads and parses package.json", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: "test-pkg" } as any));
      const pkg = await readPackageJson("/root");
      expect(pkg.name).toBe("test-pkg");
    });
    it("returns empty object on error", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("missing"));
      const pkg = await readPackageJson("/root");
      expect(pkg).toEqual({});
    });
  });

  describe("detectLanguages", () => {
    it("detects TypeScript and JavaScript", () => {
      const files = ["src/main.ts", "src/comp.tsx", "src/utils.js", "README.md"];
      const langs = detectLanguages(files);
      expect(langs).toContain("TypeScript");
      expect(langs).toContain("JavaScript");
      expect(langs).not.toContain("Python");
    });
  });

  describe("detectFrameworksFromDeps", () => {
    it("detects React and Next.js", () => {
      const deps = ["react", "next", "lodash"];
      const frameworks = detectFrameworksFromDeps(deps);
      expect(frameworks).toContain("React");
      expect(frameworks).toContain("Next.js");
    });
  });

  describe("summarizeScripts", () => {
    it("groups scripts by purpose", () => {
      const scripts = {
        lint: "eslint .",
        test: "vitest",
        "test:e2e": "playwright test",
        build: "tsc",
      };
      const summary = summarizeScripts(scripts);
      expect(summary.lint).toContain("lint");
      expect(summary.test).toContain("test");
      expect(summary.e2e).toContain("test:e2e");
      expect(summary.build).toContain("build");
    });
  });

  describe("collectProjectProfile", () => {
    it("collects a full project profile", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        scripts: { test: "vitest" },
        dependencies: { react: "18.0.0" },
      }));
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        if (path === "/root") {
          return Promise.resolve([
            { name: "src", isDirectory: () => true, isFile: () => false },
            { name: "package.json", isDirectory: () => false, isFile: () => true },
          ] as any);
        }
        return Promise.resolve([]);
      });
      vi.mocked(existsSync).mockReturnValue(true);

      const profile = await collectProjectProfile({
        workspaceRoot: "/root",
        taskTitle: "Fix UI",
        taskType: "bug",
        config: { projectName: "test", language: "ts", framework: "react" } as any,
      });

      expect(profile.taskTitle).toBe("Fix UI");
      expect(profile.packageManager).toBe("pnpm"); // because existsSync returns true for all
      expect(profile.scriptSummary.test).toContain("test");
      expect(profile.detectedFrameworks).toContain("React");
      expect(profile.tooling.hasTsConfig).toBe(true);
    });
  });
});
