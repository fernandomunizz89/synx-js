import { afterEach, describe, expect, it } from "vitest";
import {
  buildFailureSignature,
  buildRetryStrategyInstructions,
  decideAdaptiveRetry,
  resolveQualityRepairMaxAttempts,
  resolveRepeatedSignatureLimit,
} from "./quality-retry-policy.js";

const MAX_ATTEMPTS_ENV = "AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS";
const REPEAT_LIMIT_ENV = "AI_AGENTS_QUALITY_REPEAT_SIGNATURE_LIMIT";
const originalMaxAttempts = process.env[MAX_ATTEMPTS_ENV];
const originalRepeatLimit = process.env[REPEAT_LIMIT_ENV];

function restoreRetryEnv(): void {
  if (typeof originalMaxAttempts === "string") process.env[MAX_ATTEMPTS_ENV] = originalMaxAttempts;
  else delete process.env[MAX_ATTEMPTS_ENV];
  if (typeof originalRepeatLimit === "string") process.env[REPEAT_LIMIT_ENV] = originalRepeatLimit;
  else delete process.env[REPEAT_LIMIT_ENV];
}

describe.sequential("quality-retry-policy", () => {
  afterEach(() => {
    restoreRetryEnv();
  });

  it("resolves retry config with defaults and clamps", () => {
    delete process.env[MAX_ATTEMPTS_ENV];
    delete process.env[REPEAT_LIMIT_ENV];
    expect(resolveQualityRepairMaxAttempts()).toBe(3);
    expect(resolveRepeatedSignatureLimit()).toBe(2);

    process.env[MAX_ATTEMPTS_ENV] = "10";
    process.env[REPEAT_LIMIT_ENV] = "9";
    expect(resolveQualityRepairMaxAttempts()).toBe(5);
    expect(resolveRepeatedSignatureLimit()).toBe(6);
  });

  it("builds normalized failure signatures", () => {
    const signature = buildFailureSignature([
      " Error TS2322 at line 12..",
      "error   ts2322 at line 99.",
      "Another failure.",
    ]);
    expect(signature).toBe("another failure | error ts# at line #");
  });

  it("chooses local_patch for initial retry attempt", () => {
    const decision = decideAdaptiveRetry({
      attempt: 1,
      maxAttempts: 3,
      blockingFailures: ["TS2322 assignable to type"],
      blockingCount: 1,
      signature: "sig-a",
      signatureAttempts: 1,
      noProgressStreak: 0,
    });
    expect(decision.shouldContinue).toBe(true);
    expect(decision.strategy).toBe("local_patch");
    expect(decision.category).toBe("typing-contract");
  });

  it("escalates to expanded_context when signature repeats without improvement", () => {
    const decision = decideAdaptiveRetry({
      attempt: 2,
      maxAttempts: 3,
      blockingFailures: ["Module does not provide an export named useTimer"],
      blockingCount: 2,
      signature: "same-sig",
      signatureAttempts: 2,
      noProgressStreak: 1,
      previousAttempt: {
        strategy: "local_patch",
        signature: "same-sig",
        blockingCount: 1,
        category: "import-export",
      },
    });
    expect(decision.shouldContinue).toBe(true);
    expect(decision.strategy).toBe("expanded_context");
    expect(decision.reason).toContain("Repeated blocker signature");
  });

  it("aborts retry cycle when no progress streak is high", () => {
    const decision = decideAdaptiveRetry({
      attempt: 3,
      maxAttempts: 3,
      blockingFailures: ["Build failed"],
      blockingCount: 3,
      signature: "same-sig",
      signatureAttempts: 3,
      noProgressStreak: 2,
      previousAttempt: {
        strategy: "expanded_context",
        signature: "same-sig",
        blockingCount: 2,
        category: "build",
      },
    });
    expect(decision.shouldContinue).toBe(false);
    expect(decision.strategy).toBe("strategy_shift");
    expect(decision.reason).toContain("Consecutive retries failed");
  });

  it("formats strategy instructions for each retry strategy", () => {
    const local = buildRetryStrategyInstructions({
      strategy: "local_patch",
      attempt: 1,
      maxAttempts: 3,
      blockingFailures: ["lint failed"],
      changedFromPrevious: "none",
    });
    const expanded = buildRetryStrategyInstructions({
      strategy: "expanded_context",
      attempt: 2,
      maxAttempts: 3,
      blockingFailures: ["type mismatch"],
      changedFromPrevious: "upgraded",
    });
    const shifted = buildRetryStrategyInstructions({
      strategy: "strategy_shift",
      attempt: 3,
      maxAttempts: 3,
      blockingFailures: ["tests failed"],
      changedFromPrevious: "shift",
    });

    expect(local).toContain("local_patch");
    expect(expanded).toContain("expanded_context");
    expect(shifted).toContain("strategy_shift");
  });
});
