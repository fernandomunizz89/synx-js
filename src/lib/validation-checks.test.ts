import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  detectTestCapabilities, 
  runProjectChecks,
  BASE_CHECK_SCRIPT_ORDER,
  E2E_SCRIPT_CANDIDATES
} from "./validation-checks.js";
import { readPackageScripts, runCommand } from "./command-runner.js";
import { existsSync, promises as fs } from "node:fs";

vi.mock("./command-runner.js", () => ({
  readPackageScripts: vi.fn(),
  runCommand: vi.fn(),
  selectPackageManager: vi.fn().mockReturnValue("npm"),
  buildScriptCommand: vi.fn((mgr, script) => ({ command: mgr, args: ["run", script] })),
}));

vi.mock("node:fs", async () => {
    const actual = await vi.importActual("node:fs");
    return {
      ...actual as any,
      existsSync: vi.fn(),
      promises: {
        ...actual.promises as any,
        readdir: vi.fn(),
      },
    };
  });

describe("validation-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectTestCapabilities", () => {
    it("should detect unit and e2e scripts", async () => {
      vi.mocked(readPackageScripts).mockResolvedValue({
        test: "vitest",
        e2e: "playwright",
      });
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const caps = await detectTestCapabilities("/root");
      expect(caps.hasUnitTestScript).toBe(true);
      expect(caps.hasE2EScript).toBe(true);
      expect(caps.unitScripts).toContain("test");
      expect(caps.e2eScripts).toContain("e2e");
    });
  });

  describe("runProjectChecks", () => {
    it("should return skipped if no checks available", async () => {
      vi.mocked(readPackageScripts).mockResolvedValue({});
      vi.mocked(existsSync).mockReturnValue(false);

      const results = await runProjectChecks({ workspaceRoot: "/root" });
      expect(results[0].status).toBe("skipped");
      expect(results[0].command).toContain("no executable validation checks");
    });

    it("should run available scripts", async () => {
      vi.mocked(readPackageScripts).mockResolvedValue({
        test: "vitest",
      });
      vi.mocked(runCommand).mockResolvedValue({
        command: "npm",
        args: ["run", "test"],
        exitCode: 0,
        timedOut: false,
        durationMs: 100,
        stdout: "All tests passed",
        stderr: "",
      });

      const results = await runProjectChecks({ workspaceRoot: "/root" });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("passed");
      expect(results[0].command).toBe("npm run test");
    });

    it("should handle failed scripts", async () => {
        vi.mocked(readPackageScripts).mockResolvedValue({
          test: "vitest",
        });
        vi.mocked(runCommand).mockResolvedValue({
          command: "npm",
          args: ["run", "test"],
          exitCode: 1,
          timedOut: false,
          durationMs: 100,
          stdout: "1 test failed",
          stderr: "AssertionError",
        });
  
        const results = await runProjectChecks({ workspaceRoot: "/root" });
        expect(results[0].status).toBe("failed");
        expect(results[0].diagnostics).toContain("AssertionError");
      });

      it("should use fallback commands if no scripts found but files changed", async () => {
          vi.mocked(readPackageScripts).mockResolvedValue({});
          vi.mocked(existsSync).mockImplementation((p: any) => p.toString().endsWith("tsconfig.json"));
          vi.mocked(runCommand).mockResolvedValue({
            command: "npx",
            args: ["tsc", "--noEmit"],
            exitCode: 0,
            timedOut: false,
            durationMs: 100,
            stdout: "",
            stderr: "",
          });

          const results = await runProjectChecks({ 
              workspaceRoot: "/root", 
              changedFiles: ["src/index.ts"] 
          });
          
          expect(results).toHaveLength(1);
          expect(results[0].command).toContain("tsc --noEmit");
          expect(results[0].status).toBe("passed");
      });

      it("should handle language-aware fallbacks (Python, Go, Rust, Java)", async () => {
          vi.mocked(readPackageScripts).mockResolvedValue({});
          vi.mocked(existsSync).mockImplementation((p: any) => {
              const pathStr = p.toString();
              return pathStr.endsWith("go.mod") || pathStr.endsWith("Cargo.toml") || pathStr.endsWith("pom.xml");
          });
          vi.mocked(runCommand).mockResolvedValue({
            command: "mock",
            args: [],
            exitCode: 0,
            timedOut: false,
            durationMs: 1,
            stdout: "",
            stderr: "",
          });

          const results = await runProjectChecks({ 
              workspaceRoot: "/root", 
              changedFiles: ["main.go", "lib.rs", "App.java"] 
          });
          
          const commands = results.map(r => r.command);
          expect(commands).toContain("go test ./... -run ^$");
          expect(commands).toContain("cargo check");
          expect(commands).toContain("mvn -q -DskipTests compile");
      });
  });
});
