import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCypressQaOverrides,
  collectSelectorsFromSpec,
  hasNativeDataCySelector,
  parseCypressJunitDiagnostics,
  readCypressReportDiagnostics,
  runCypressSelectorPreflight,
} from "./cypress-tools.js";

describe.sequential("cypress-tools", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-cypress-tools-"));
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("parses junit diagnostics and test locations", () => {
    const xml = `
<testsuites>
  <testsuite name="suite">
    <testcase name="should count down">
      <failure message="Timed out retrying after 6000ms">AssertionError at cypress/e2e/timer.cy.ts:10:5</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const diagnostics = parseCypressJunitDiagnostics(xml);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('Test "should count down": Timed out retrying after 6000ms'),
      expect.stringContaining("Location: cypress/e2e/timer.cy.ts:10:5"),
    ]));
  });

  it("collects selectors from specs and detects native data-cy usage", () => {
    const spec = `
      cy.get('[data-cy="timer"]')
      cy.get('[data-cy="timer-display"]')
      cy.get('[data-cy="timer"]')
    `;
    const selectors = collectSelectorsFromSpec(spec);
    expect(selectors).toEqual(["timer", "timer-display"]);

    expect(hasNativeDataCySelector(`<div data-cy="timer"></div>`, "timer")).toBe(true);
    expect(hasNativeDataCySelector(`<Timer data-cy="timer" />`, "timer")).toBe(true);
  });

  it("builds QA overrides and report diagnostics with missing/existing report files", async () => {
    const overrides = await buildCypressQaOverrides(root, "cypress:run");
    expect(overrides.extraArgs).toEqual(expect.arrayContaining(["--reporter", "junit", "--config"]));
    expect(overrides.qaConfigNotes.some((note) => note.includes("reporter=junit"))).toBe(true);
    expect(overrides.reportPath).toContain(".ai-agents/runtime/qa-cypress/");

    const missing = await readCypressReportDiagnostics({
      workspaceRoot: root,
      reportPath: path.join(root, "missing.xml"),
    });
    expect(missing.artifacts[0]).toContain("(not generated)");

    const reportPath = path.join(root, "report.xml");
    await fs.writeFile(reportPath, `
<testsuites>
  <testsuite>
    <testcase name="main flow">
      <failure message="Expected timer to update">at e2e/main-flow.cy.ts:20:1</failure>
    </testcase>
  </testsuite>
</testsuites>
`, "utf8");
    const parsed = await readCypressReportDiagnostics({
      workspaceRoot: root,
      reportPath,
    });
    expect(parsed.artifacts).toEqual(["report.xml"]);
    expect(parsed.diagnostics[0]).toContain('Test "main flow"');
  });

  it("runs selector preflight and reports missing data-cy entries", async () => {
    await fs.mkdir(path.join(root, "e2e"), { recursive: true });
    await fs.mkdir(path.join(root, "src", "components"), { recursive: true });
    await fs.writeFile(path.join(root, "e2e", "timer.cy.ts"), `
      cy.get('[data-cy="timer"]')
      cy.get('[data-cy="timer-display"]')
    `, "utf8");
    await fs.writeFile(path.join(root, "src", "components", "Timer.tsx"), `
      export function Timer() {
        return <div data-cy="timer">ok</div>;
      }
    `, "utf8");

    const preflight = await runCypressSelectorPreflight(root);
    expect(preflight.requiredSelectors.map((entry) => entry.selector)).toEqual(["timer", "timer-display"]);
    expect(preflight.missingSelectors.map((entry) => entry.selector)).toEqual(["timer-display"]);
  });
});
