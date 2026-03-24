import { describe, expect, it, vi } from "vitest";
import { deriveQaFileHints, synthesizeQaSelectorHotfixEdits } from "./qa-remediation.js";

// Mocking dependencies
vi.mock("./fs.js", () => ({
  exists: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

describe("lib/qa-remediation", () => {
  describe("deriveQaFileHints", () => {
    it("extracts path hints from findings", () => {
      const findings = [
        {
          issue: "Error in src/components/Button.tsx",
          expectedResult: "",
          receivedResult: "",
          recommendedAction: "",
          evidence: ["Full path: /Users/me/project/src/lib/utils.ts"],
        },
      ] as any;
      const hints = deriveQaFileHints(findings);
      expect(hints).toContain("src/components/Button.tsx");
      expect(hints).toContain("src/lib/utils.ts");
    });

    it("adds playwright config if E2E signals are present", () => {
      const findings = [{ issue: "playwright.config is missing", evidence: [], expectedResult: "", receivedResult: "", recommendedAction: "" }] as any;
      const hints = deriveQaFileHints(findings);
      expect(hints).toContain("playwright.config.ts");
      expect(hints).toContain("package.json");
    });

    it("adds main-flow spec if missing spec signal is present", () => {
      const findings = [{ issue: "no spec files were found", evidence: [], expectedResult: "", receivedResult: "", recommendedAction: "" }] as any;
      const hints = deriveQaFileHints(findings);
      expect(hints).toContain("e2e/main-flow.spec.ts");
    });
  });

  describe("synthesizeQaSelectorHotfixEdits", () => {
    it("sanitizes data-cy from custom components in existing edits", async () => {
      const existingEdits = [
        {
          path: "src/App.tsx",
          action: "create",
          content: "<MyComponent data-cy=\"test-id\" />",
        },
      ] as any;
      const result = await synthesizeQaSelectorHotfixEdits({
        workspaceRoot: "/root",
        findings: [],
        existingEdits,
      });
      expect(result.edits[0].content).toBe("<MyComponent />");
      expect(result.notes[0]).toContain("removed data-cy props");
    });

    it("injects data-cy into HTML elements in existing edits", async () => {
      const existingEdits = [
        {
          path: "src/Button.tsx",
          action: "create",
          content: "<button>Click me</button>",
        },
      ] as any;
      const findings = [
        {
          issue: "Missing selector [data-cy=\"submit-btn\"]",
          recommendedAction: "Add data-cy=\"submit-btn\"",
          evidence: [],
          expectedResult: "",
          receivedResult: "",
        },
      ] as any;

      const result = await synthesizeQaSelectorHotfixEdits({
        workspaceRoot: "/root",
        findings,
        existingEdits,
      });

      // The logic matches "submit-btn" (btn keyword) to <button>
      expect(result.edits[0].content).toContain("<button data-cy=\"submit-btn\">");
      expect(result.notes).toEqual(expect.arrayContaining([expect.stringContaining("ensured data-cy=\"submit-btn\"")]));
    });

    it("warns if selector cannot be placed", async () => {
      const result = await synthesizeQaSelectorHotfixEdits({
        workspaceRoot: "/root",
        findings: [{ issue: "[data-cy=\"missing\"]", evidence: [], expectedResult: "", receivedResult: "", recommendedAction: "" }] as any,
        existingEdits: [],
      });
      expect(result.warnings[0]).toContain("could not place data-cy=\"missing\"");
    });
  });
});
