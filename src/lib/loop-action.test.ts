import { describe, expect, it } from "vitest";
import { decideLoopAction } from "./loop-action.js";

describe("loop-action", () => {
  it("uses immediate fast-path when stages were processed and budget allows", () => {
    const decision = decideLoopAction({
      processedStages: 2,
      activeTaskCount: 3,
      immediateCycleStreak: 1,
      maxImmediateCycles: 3,
      wasPreviousLoopProductive: true,
    });
    expect(decision.action).toBe("immediate");
    expect(decision.reason).toContain("fast-path");
  });

  it("sleeps when processed stages exist but immediate budget is exhausted", () => {
    const decision = decideLoopAction({
      processedStages: 1,
      activeTaskCount: 2,
      immediateCycleStreak: 3,
      maxImmediateCycles: 3,
      wasPreviousLoopProductive: true,
    });
    expect(decision.action).toBe("sleep");
    expect(decision.reason).toContain("budget reached");
  });

  it("uses one aggressive immediate cycle when previous loop was productive", () => {
    const decision = decideLoopAction({
      processedStages: 0,
      activeTaskCount: 1,
      immediateCycleStreak: 0,
      maxImmediateCycles: 3,
      wasPreviousLoopProductive: true,
    });
    expect(decision.action).toBe("immediate");
    expect(decision.reason).toContain("active tasks remain");
  });

  it("sleeps when active tasks exist but no stage is processable", () => {
    const decision = decideLoopAction({
      processedStages: 0,
      activeTaskCount: 2,
      immediateCycleStreak: 3,
      maxImmediateCycles: 3,
      wasPreviousLoopProductive: false,
    });
    expect(decision.action).toBe("sleep");
    expect(decision.reason).toContain("no stage was processable");
  });

  it("sleeps in low-cpu mode when there are no active tasks", () => {
    const decision = decideLoopAction({
      processedStages: 0,
      activeTaskCount: 0,
      immediateCycleStreak: 0,
      maxImmediateCycles: 3,
      wasPreviousLoopProductive: false,
    });
    expect(decision.action).toBe("sleep");
    expect(decision.reason).toContain("low CPU profile");
  });
});
