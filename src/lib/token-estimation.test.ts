import { afterEach, describe, expect, it } from "vitest";
import {
  buildTokenEstimate,
  buildTokenEstimateFromCounts,
  estimateCostUsd,
  estimateTokens,
  estimateTokensFromChars,
  estimateTokensFromMessages,
} from "./token-estimation.js";

const INPUT_COST_ENV = "AI_AGENTS_PROVIDER_INPUT_COST_PER_1K_USD";
const OUTPUT_COST_ENV = "AI_AGENTS_PROVIDER_OUTPUT_COST_PER_1K_USD";
const originalInputCost = process.env[INPUT_COST_ENV];
const originalOutputCost = process.env[OUTPUT_COST_ENV];

function restoreCostEnv(): void {
  if (typeof originalInputCost === "string") process.env[INPUT_COST_ENV] = originalInputCost;
  else delete process.env[INPUT_COST_ENV];
  if (typeof originalOutputCost === "string") process.env[OUTPUT_COST_ENV] = originalOutputCost;
  else delete process.env[OUTPUT_COST_ENV];
}

describe.sequential("token-estimation", () => {
  afterEach(() => {
    restoreCostEnv();
  });

  it("estimates tokens from chars and text", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(4)).toBe(2);
    expect(estimateTokens("abcdefgh")).toBe(3);
  });

  it("estimates tokens from messages", () => {
    const total = estimateTokensFromMessages([
      { role: "system", content: "abcd" },
      { role: "user", content: "abcdefgh" },
    ]);
    expect(total).toBe(5);
  });

  it("uses model pricing fallback when env overrides are not set", () => {
    delete process.env[INPUT_COST_ENV];
    delete process.env[OUTPUT_COST_ENV];

    const gpt4oCost = estimateCostUsd({
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    const miniVariantCost = estimateCostUsd({
      model: "openai/gpt-4o-mini-2024-07-18",
      inputTokens: 1000,
      outputTokens: 1000,
    });

    expect(gpt4oCost).toBeCloseTo(0.0125, 6);
    expect(miniVariantCost).toBeCloseTo(0.00075, 6);
  });

  it("gives precedence to env pricing overrides", () => {
    process.env[INPUT_COST_ENV] = "1";
    process.env[OUTPUT_COST_ENV] = "2";

    const cost = estimateCostUsd({
      model: "custom-model",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(cost).toBe(3);
  });

  it("builds token estimates from text and counts", () => {
    delete process.env[INPUT_COST_ENV];
    delete process.env[OUTPUT_COST_ENV];

    const byText = buildTokenEstimate({
      model: "gpt-4o",
      inputText: "abcdefgh",
      outputText: "abcd",
    });
    expect(byText.inputTokens).toBe(3);
    expect(byText.outputTokens).toBe(2);
    expect(byText.totalTokens).toBe(5);
    expect(byText.estimatedCostUsd).toBeGreaterThan(0);

    const byCounts = buildTokenEstimateFromCounts({
      model: "gpt-4o",
      inputTokens: 10.8,
      outputTokens: -2,
    });
    expect(byCounts).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      totalTokens: 10,
      estimatedCostUsd: estimateCostUsd({
        model: "gpt-4o",
        inputTokens: 10,
        outputTokens: 0,
      }),
    });
  });
});
