import { describe, expect, it } from "vitest";
import { deriveQaRootCauseFocus } from "./root-cause-intelligence.js";

describe("root-cause-intelligence", () => {
  it("identifies app code issues from typical patterns", () => {
    const findings = [{
      issue: "Module not found: ./utils.js",
      expectedResult: "should work",
      receivedResult: "error",
      evidence: [],
      recommendedAction: "fix it"
    }];
    const result = deriveQaRootCauseFocus({ qaFailures: [], findings });
    expect(result.likelyAppCodeIssue).toBe(true);
    expect(result.mustPrioritizeSourceFix).toBe(true);
    expect(result.rationale).toContain("Runtime/import/export signals suggest a source-code defect.");
  });

  it("extracts source paths from text", () => {
    const qaFailures = ["Error in src/lib/utils.ts at line 10"];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.sourceHints).toContain("src/lib/utils.ts");
  });

  it("identifies test issues from assertion failures", () => {
    const qaFailures = ["assertion failed: expected true to be false"];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.likelyTestIssue).toBe(true);
    expect(result.mustPrioritizeSourceFix).toBe(false);
  });

  it("identifies config issues from invalid config signals", () => {
    const qaFailures = ["configfile is invalid: cypress.config.ts"];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.likelyConfigIssue).toBe(true);
  });

  it("handles complex mixed signals", () => {
    const qaFailures = [
      "cannot read properties of undefined",
      "assertion failed",
      "baseurl missing in configuration"
    ];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.likelyAppCodeIssue).toBe(true);
    expect(result.likelyTestIssue).toBe(true);
    expect(result.likelyConfigIssue).toBe(true);
  });

  it("extracts absolute paths correctly", () => {
    const qaFailures = ["Full path: /Users/me/Wokspace/synx-js/src/lib/repo.ts"];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.sourceHints).toContain("src/lib/repo.ts");
  });

  it("identifies selector failures", () => {
    const qaFailures = ["missing selector: [data-testid=submit]"];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.likelyAppCodeIssue).toBe(true);
    expect(result.rationale).toContain("Selector failures usually require source/UI markup updates.");
  });
  
  it("identifies compile/lint issues", () => {
    const qaFailures = ["error TS2322: Type 'string' is not assignable to type 'number'."];
    const result = deriveQaRootCauseFocus({ qaFailures, findings: [] });
    expect(result.likelyAppCodeIssue).toBe(true);
    expect(result.rationale).toContain("Compile/lint/type diagnostics indicate code-level issues.");
  });
});
