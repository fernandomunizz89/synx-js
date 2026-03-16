import { afterEach, describe, expect, it } from "vitest";
import { envBoolean, envNumber, envOptionalNumber, envRequired } from "./env.js";

const ENV_NAME = "SYNX_TEST_ENV";
const originalValue = process.env[ENV_NAME];

function restoreEnv(): void {
  if (typeof originalValue === "string") process.env[ENV_NAME] = originalValue;
  else delete process.env[ENV_NAME];
}

describe.sequential("env helpers", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("reads required env value and throws when missing", () => {
    process.env[ENV_NAME] = "  hello  ";
    expect(envRequired(ENV_NAME)).toBe("hello");

    delete process.env[ENV_NAME];
    expect(() => envRequired(ENV_NAME)).toThrow(`Required environment variable ${ENV_NAME} is not set`);
  });

  it("parses booleans with defaults", () => {
    delete process.env[ENV_NAME];
    expect(envBoolean(ENV_NAME, true)).toBe(true);

    process.env[ENV_NAME] = "yes";
    expect(envBoolean(ENV_NAME, false)).toBe(true);

    process.env[ENV_NAME] = "OFF";
    expect(envBoolean(ENV_NAME, true)).toBe(false);

    process.env[ENV_NAME] = "invalid";
    expect(envBoolean(ENV_NAME, true)).toBe(true);
  });

  it("parses numbers with min/max/integer clamping", () => {
    delete process.env[ENV_NAME];
    expect(envNumber(ENV_NAME, 42)).toBe(42);

    process.env[ENV_NAME] = "10.9";
    expect(envNumber(ENV_NAME, 0, { integer: true })).toBe(10);
    expect(envNumber(ENV_NAME, 0, { min: 11 })).toBe(11);
    expect(envNumber(ENV_NAME, 0, { max: 9 })).toBe(9);

    process.env[ENV_NAME] = "not-a-number";
    expect(envNumber(ENV_NAME, 5)).toBe(5);
  });

  it("parses optional numbers and returns undefined for invalid/out-of-range", () => {
    delete process.env[ENV_NAME];
    expect(envOptionalNumber(ENV_NAME)).toBeUndefined();

    process.env[ENV_NAME] = "8";
    expect(envOptionalNumber(ENV_NAME)).toBe(8);
    expect(envOptionalNumber(ENV_NAME, { min: 9 })).toBeUndefined();
    expect(envOptionalNumber(ENV_NAME, { max: 7 })).toBeUndefined();

    process.env[ENV_NAME] = "abc";
    expect(envOptionalNumber(ENV_NAME)).toBeUndefined();
  });
});
