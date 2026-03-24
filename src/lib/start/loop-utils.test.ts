import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolvePollIntervalMs, resolveMaxImmediateCycles, resolveTaskConcurrency } from "./loop-utils.js";
import { envNumber } from "../env.js";

vi.mock("../env.js", () => ({
  envNumber: vi.fn(),
}));

describe("lib/start/loop-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves poll interval from env with defaults and bounds", () => {
    vi.mocked(envNumber).mockReturnValue(5000);
    expect(resolvePollIntervalMs()).toBe(5000);
    expect(envNumber).toHaveBeenCalledWith("AI_AGENTS_POLL_INTERVAL_MS", expect.any(Number), expect.objectContaining({ min: 200, max: 120000 }));
  });

  it("resolves max immediate cycles", () => {
    vi.mocked(envNumber).mockReturnValue(5);
    expect(resolveMaxImmediateCycles()).toBe(5);
  });

  it("resolves task concurrency", () => {
    vi.mocked(envNumber).mockReturnValue(10);
    expect(resolveTaskConcurrency()).toBe(10);
  });
});
