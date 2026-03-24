import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildManagerScriptCommand, extractDiagnostics, typeScriptNoEmitCommand, runBugTriageChecks, buildBugBrief } from "./bug-triage.js";

// Mocking dependencies
vi.mock("./workspace-tools.js", () => ({
  runCommand: vi.fn(),
}));

describe("lib/bug-triage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildManagerScriptCommand", () => {
    it("returns correct command for npm", () => {
      expect(buildManagerScriptCommand("npm", "test")).toEqual({ command: "npm", args: ["run", "--if-present", "test"] });
    });
    it("returns correct command for pnpm", () => {
      expect(buildManagerScriptCommand("pnpm", "test")).toEqual({ command: "pnpm", args: ["run", "--if-present", "test"] });
    });
    it("returns correct command for yarn", () => {
      expect(buildManagerScriptCommand("yarn", "test")).toEqual({ command: "yarn", args: ["run", "test"] });
    });
    it("returns correct command for bun", () => {
      expect(buildManagerScriptCommand("bun", "test")).toEqual({ command: "bun", args: ["run", "test"] });
    });
  });

  describe("extractDiagnostics", () => {
    it("extracts error lines from stdout/stderr", () => {
      const stdout = "Some info\nError: something broke\nMore info";
      const stderr = "fatal: path not found";
      const diagnostics = extractDiagnostics(stdout, stderr);
      expect(diagnostics).toContain("Error: something broke");
      expect(diagnostics).toContain("fatal: path not found");
    });

    it("limits the number of diagnostic lines", () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Error line ${i}`).join("\n");
      const diagnostics = extractDiagnostics(lines, "");
      expect(diagnostics.length).toBeLessThanOrEqual(8);
    });
  });

  describe("typeScriptNoEmitCommand", () => {
    it("returns correct npx command for npm", () => {
      expect(typeScriptNoEmitCommand("npm").command).toBe("npx");
    });
    it("returns correct pnpm exec command", () => {
      expect(typeScriptNoEmitCommand("pnpm").command).toBe("pnpm");
    });
  });

  describe("runBugTriageChecks", () => {
    it("runs typecheck and lint commands", async () => {
      const { runCommand } = await import("./workspace-tools.js");
      vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, durationMs: 100, stdout: "", stderr: "" } as any);

      const profile = {
        packageManager: "npm",
        scriptSummary: {
          typecheck: ["test:types"],
          lint: ["lint"],
          check: [],
        },
        tooling: { hasTsConfig: false },
      } as any;

      const results = await runBugTriageChecks({ workspaceRoot: "/root", profile });
      expect(results).toHaveLength(2);
      expect(results[0].command).toContain("npm run --if-present test:types");
      expect(results[1].command).toContain("npm run --if-present lint");
    });

    it("runs default tsc if no typecheck script but has tsconfig", async () => {
      const { runCommand } = await import("./workspace-tools.js");
      vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, durationMs: 100, stdout: "", stderr: "" } as any);

      const profile = {
        packageManager: "npm",
        scriptSummary: { typecheck: [], lint: [], check: [] },
        tooling: { hasTsConfig: true },
      } as any;

      const results = await runBugTriageChecks({ workspaceRoot: "/root", profile });
      expect(results[0].command).toContain("npx tsc --noEmit");
    });
  });

  describe("buildBugBrief", () => {
    it("assembles a brief from various outputs", () => {
      const triageChecks = [
        { command: "npm test", status: "failed", exitCode: 1, durationMs: 50, diagnostics: ["Error 1"] },
      ] as any;
      const dispatcherOutput = { assumptions: ["Assume X"] };
      const investigatorOutput = { likelyCauses: ["Cause Y"], suspectFiles: ["src/a.ts"] };

      const brief = buildBugBrief({
        taskTitle: "Fix bug",
        rawRequest: "Help me",
        dispatcherOutput,
        investigatorOutput,
        triageChecks,
      });

      expect(brief.symptomSummary).toBe("Fix bug");
      expect(brief.likelyRootCauses).toContain("Cause Y");
      expect(brief.likelyRootCauses).toContain("Assume X");
      expect(brief.suspectFiles).toContain("src/a.ts");
      expect(brief.reproductionEvidence).toEqual(expect.arrayContaining([expect.stringContaining("npm test => failed")]));
    });
  });
});
