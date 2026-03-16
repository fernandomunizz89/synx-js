import { describe, expect, it } from "vitest";
import { extractProviderErrorMeta } from "./provider-error-meta.js";

describe("provider-error-meta", () => {
  it("returns defaults for non-object input", () => {
    const result = extractProviderErrorMeta("oops");
    expect(result).toEqual({
      parseRetries: 0,
      parseRetryAdditionalDurationMs: 0,
      parseFailureReasons: [],
      providerAttempts: 1,
      providerBackoffRetries: 0,
      providerBackoffWaitMs: 0,
      providerRateLimitWaitMs: 0,
      providerThrottleReasons: [],
    });
  });

  it("extracts and truncates valid metadata", () => {
    const result = extractProviderErrorMeta({
      parseRetries: 2,
      parseRetryAdditionalDurationMs: 1200,
      parseFailureReasons: ["a", "b", "c", "d"],
      providerAttempts: 3,
      providerBackoffRetries: 1,
      providerBackoffWaitMs: 500,
      providerRateLimitWaitMs: 300,
      providerThrottleReasons: ["x", "y", "z", "w"],
    });

    expect(result).toEqual({
      parseRetries: 2,
      parseRetryAdditionalDurationMs: 1200,
      parseFailureReasons: ["a", "b", "c"],
      providerAttempts: 3,
      providerBackoffRetries: 1,
      providerBackoffWaitMs: 500,
      providerRateLimitWaitMs: 300,
      providerThrottleReasons: ["x", "y", "z"],
    });
  });

  it("falls back to defaults when schema validation fails", () => {
    const result = extractProviderErrorMeta({
      parseRetries: "2",
      providerAttempts: 0,
      parseFailureReasons: [1, 2, 3],
    });
    expect(result.parseRetries).toBe(0);
    expect(result.providerAttempts).toBe(1);
    expect(result.parseFailureReasons).toEqual([]);
  });
});
