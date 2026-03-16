export interface LoopActionDecision {
  action: "immediate" | "sleep";
  reason: string;
}

export function decideLoopAction(args: {
  processedStages: number;
  activeTaskCount: number;
  immediateCycleStreak: number;
  maxImmediateCycles: number;
  wasPreviousLoopProductive: boolean;
}): LoopActionDecision {
  if (args.processedStages > 0) {
    if (args.immediateCycleStreak < args.maxImmediateCycles) {
      return {
        action: "immediate",
        reason: "stage(s) were processed this loop; fast-path enabled to reduce handoff latency.",
      };
    }
    return {
      action: "sleep",
      reason: `immediate cycle budget reached (${args.immediateCycleStreak}/${args.maxImmediateCycles}).`,
    };
  }

  if (args.activeTaskCount > 0 && args.wasPreviousLoopProductive && args.immediateCycleStreak < args.maxImmediateCycles) {
    return {
      action: "immediate",
      reason: "active tasks remain after a productive loop; run one more aggressive check before sleeping.",
    };
  }

  if (args.activeTaskCount > 0) {
    return {
      action: "sleep",
      reason: "active tasks exist but no stage was processable in this loop.",
    };
  }

  return {
    action: "sleep",
    reason: "no active tasks available; sleeping with low CPU profile.",
  };
}
