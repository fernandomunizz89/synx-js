import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectSelectorsFromSpec,
  hasNativeDataCySelector,
  runE2ESelectorPreflight,
} from "./e2e-selector-tools.js";

describe.sequential("e2e-selector-tools", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "synx-e2e-selector-tools-"));
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
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

    const preflight = await runE2ESelectorPreflight(root);
    expect(preflight.requiredSelectors.map((entry) => entry.selector)).toEqual(["timer", "timer-display"]);
    expect(preflight.missingSelectors.map((entry) => entry.selector)).toEqual(["timer-display"]);
  });
});
