import { describe, expect, it } from "vitest";
import { projectProfileFactLines, bugBriefFactLines, symbolContractFactLines } from "./project-handoff.js";

describe("lib/project-handoff", () => {
  describe("projectProfileFactLines", () => {
    it("formats project profile facts correctly", () => {
      const profile = {
        packageManager: "npm",
        detectedLanguages: ["TypeScript", "JavaScript"],
        detectedFrameworks: ["React", "Next.js"],
        scriptSummary: {
          lint: ["npm run lint"],
          typecheck: ["tsc"],
          e2e: ["playwright test"],
        },
        tooling: {
          hasTsConfig: true,
          hasPlaywrightConfig: true,
        },
      } as any;

      const lines = projectProfileFactLines(profile);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain("manager=npm");
      expect(lines[1]).toContain("lint=npm run lint");
      expect(lines[2]).toContain("tsconfig=yes");
    });

    it("handles unknown values gracefully", () => {
      const profile = {
        packageManager: "unknown",
        detectedLanguages: [],
        detectedFrameworks: [],
        scriptSummary: { lint: [], typecheck: [], e2e: [] },
        tooling: { hasTsConfig: false, hasPlaywrightConfig: false },
      } as any;

      const lines = projectProfileFactLines(profile);
      expect(lines[0]).toContain("languages=unknown");
      expect(lines[1]).toContain("lint=[none]");
      expect(lines[2]).toContain("tsconfig=no");
    });
  });

  describe("bugBriefFactLines", () => {
    it("formats bug brief facts correctly", () => {
      const brief = {
        symptomSummary: "Crash on startup",
        primaryHypothesis: "Missing env var",
        suspectFiles: ["src/index.ts", "src/config.ts"],
        triageChecks: [
          { command: "npm run test", status: "failed", exitCode: 1 },
        ],
        blockerPatterns: ["P1", "P2"],
        builderChecks: ["C1"],
      } as any;

      const lines = bugBriefFactLines(brief);
      expect(lines).toContain("Bug brief: Crash on startup");
      expect(lines).toContain("Suspect files: src/index.ts, src/config.ts.");
      expect(lines).toContain("npm run test => failed (exit=1)");
    });
  });

  describe("symbolContractFactLines", () => {
    it("formats symbol contract facts correctly", () => {
      const contracts = [
        {
          symbol: "MyFunc",
          modulePath: "src/lib.ts",
          importerPath: "src/main.ts",
          mismatchSummary: "type mismatch",
        },
      ] as any;

      const lines = symbolContractFactLines(contracts);
      expect(lines[0]).toContain("Symbol contract: MyFunc");
      expect(lines[0]).toContain("importer=src/main.ts");
      expect(lines[0]).toContain("type mismatch");
    });
  });
});
