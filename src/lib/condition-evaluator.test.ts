import { describe, expect, it } from "vitest";
import { evaluateCondition } from "./condition-evaluator.js";

describe("lib/condition-evaluator", () => {

  // ─── Basic equality and comparison ─────────────────────────────────────────

  it("strict equality — matching value returns true", () => {
    expect(evaluateCondition("output.type === 'bug'", { type: "bug" })).toBe(true);
  });

  it("strict equality — non-matching value returns false", () => {
    expect(evaluateCondition("output.type === 'bug'", { type: "feature" })).toBe(false);
  });

  it("numeric greater-than — above threshold returns true", () => {
    expect(evaluateCondition("output.score > 80", { score: 95 })).toBe(true);
  });

  it("numeric greater-than — below threshold returns false", () => {
    expect(evaluateCondition("output.score > 80", { score: 50 })).toBe(false);
  });

  it("boolean field — true returns true", () => {
    expect(evaluateCondition("output.approved === true", { approved: true })).toBe(true);
  });

  it("boolean field — false returns false", () => {
    expect(evaluateCondition("output.approved === true", { approved: false })).toBe(false);
  });

  it("loose truthiness — truthy value returns true", () => {
    expect(evaluateCondition("output.count", { count: 3 })).toBe(true);
  });

  it("loose truthiness — zero is falsy, returns false", () => {
    expect(evaluateCondition("output.count", { count: 0 })).toBe(false);
  });

  // ─── Safe error handling ────────────────────────────────────────────────────

  it("missing key — returns false without throwing", () => {
    expect(evaluateCondition("output.missing === 'x'", {})).toBe(false);
  });

  it("deep missing key — TypeError is swallowed, returns false", () => {
    expect(evaluateCondition("output.missing.deep === 'x'", {})).toBe(false);
  });

  it("syntax error in expression — returns false without throwing", () => {
    expect(evaluateCondition("output.type ===", { type: "x" })).toBe(false);
  });

  it("expression that throws explicitly — returns false", () => {
    expect(evaluateCondition("(function(){ throw new Error('x'); })()", {})).toBe(false);
  });

  it("empty string expression — returns false", () => {
    expect(evaluateCondition("", { type: "x" })).toBe(false);
  });

  it("whitespace-only expression — returns false", () => {
    expect(evaluateCondition("   ", { type: "x" })).toBe(false);
  });

  // ─── Compound expressions ──────────────────────────────────────────────────

  it("AND — both conditions true returns true", () => {
    expect(
      evaluateCondition(
        "output.type === 'bug' && output.severity === 'high'",
        { type: "bug", severity: "high" },
      ),
    ).toBe(true);
  });

  it("AND — one condition false returns false", () => {
    expect(
      evaluateCondition(
        "output.type === 'bug' && output.severity === 'high'",
        { type: "bug", severity: "low" },
      ),
    ).toBe(false);
  });

  it("OR — one truthy arm returns true", () => {
    expect(
      evaluateCondition(
        "output.type === 'bug' || output.type === 'hotfix'",
        { type: "hotfix" },
      ),
    ).toBe(true);
  });

  it("OR — both arms false returns false", () => {
    expect(
      evaluateCondition(
        "output.type === 'bug' || output.type === 'hotfix'",
        { type: "feature" },
      ),
    ).toBe(false);
  });

  it("ternary expression — evaluates correctly", () => {
    expect(evaluateCondition("output.x > 0 ? true : false", { x: 5 })).toBe(true);
    expect(evaluateCondition("output.x > 0 ? true : false", { x: -1 })).toBe(false);
  });

  // ─── Scope / safety notes ──────────────────────────────────────────────────

  it("process.exit is accessible in new Function scope but the evaluator returns false on throw", () => {
    // new Function runs in the global Node scope, so process is reachable.
    // A malicious condition calling process.exit(0) would actually terminate the process.
    // This is documented behaviour: the evaluator provides error-isolation, not a sandbox.
    // Conditions should only be authored by trusted users who control the pipeline files.
    // We test the safe-fail path using an expression that throws instead.
    expect(evaluateCondition("(function(){ throw new Error('simulated side-effect'); })()", {})).toBe(false);
  });

  // ─── Non-mutation guarantee ────────────────────────────────────────────────

  it("does not mutate the output object", () => {
    const output = { type: "bug" };
    const before = JSON.stringify(output);
    evaluateCondition("output.type === 'bug'", output);
    expect(JSON.stringify(output)).toBe(before);
  });
});
