export type RetryStrategy = "local_patch" | "expanded_context" | "strategy_shift";

export interface RetryContextLimits {
  maxContextFiles: number;
  maxTotalContextChars: number;
  maxFileContextChars: number;
  maxScanFiles: number;
}

export interface RetryDecision {
  shouldContinue: boolean;
  strategy: RetryStrategy;
  reason: string;
  hypothesis: string;
  changedFromPrevious: string;
  successCriteria: string;
  abandonCriteria: string;
  contextLimits: RetryContextLimits;
  category: string;
}

export interface RetryDecisionInput {
  attempt: number;
  maxAttempts: number;
  blockingFailures: string[];
  blockingCount: number;
  signature: string;
  signatureAttempts: number;
  noProgressStreak: number;
  previousAttempt?: {
    strategy: RetryStrategy;
    signature: string;
    blockingCount: number;
    category: string;
  };
}

function normalizeIssueLine(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map((x) => normalizeIssueLine(x)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function resolveQualityRepairMaxAttempts(): number {
  const raw = Number(process.env.AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS || "");
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(5, Math.floor(raw));
  }
  return 3;
}

export function resolveRepeatedSignatureLimit(): number {
  const raw = Number(process.env.AI_AGENTS_QUALITY_REPEAT_SIGNATURE_LIMIT || "2");
  if (Number.isFinite(raw) && raw >= 2) {
    return Math.min(6, Math.floor(raw));
  }
  return 2;
}

export function buildFailureSignature(lines: string[]): string {
  return uniqueNormalized(lines)
    .map((line) => line.toLowerCase().replace(/\d+/g, "#"))
    .sort()
    .join(" | ");
}

function classifyFailureCategory(lines: string[]): string {
  const corpus = lines.join("\n").toLowerCase();
  if (/no-unused-vars|ts6133|ts6198/.test(corpus)) return "lint-unused";
  if (/eslint|lint/.test(corpus)) return "lint";
  if (/ts2322|intrinsicattributes|assignable to type/.test(corpus)) return "typing-contract";
  if (/cannot find module|does not provide an export|import|export|module/.test(corpus)) return "import-export";
  if (/ts\d{4}|type error|typing/.test(corpus)) return "typing";
  if (/syntax|unexpected token|parsing error/.test(corpus)) return "syntax";
  if (/cypress|playwright|e2e|test/.test(corpus)) return "tests";
  if (/build/.test(corpus)) return "build";
  return "unknown";
}

function categoryHypothesis(category: string): string {
  switch (category) {
    case "lint-unused":
      return "The patch likely introduced unused bindings or dead imports in recently touched files.";
    case "lint":
      return "Lint rules in the touched scope are still violated after the previous patch.";
    case "typing-contract":
      return "Type or component contract mismatch remains between caller and callee.";
    case "import-export":
      return "Import/export contract is still inconsistent in touched modules.";
    case "typing":
      return "TypeScript constraints are still violated in the modified scope.";
    case "syntax":
      return "A syntax-level issue is blocking validation before runtime.";
    case "tests":
      return "Tests still fail due to implementation behavior or test harness mismatch.";
    case "build":
      return "Build-level compatibility issue remains unresolved.";
    default:
      return "A quality-gate blocker remains and needs targeted remediation in touched files.";
  }
}

function strategyContextLimits(strategy: RetryStrategy): RetryContextLimits {
  switch (strategy) {
    case "local_patch":
      return {
        maxContextFiles: 8,
        maxTotalContextChars: 12_000,
        maxFileContextChars: 2_400,
        maxScanFiles: 800,
      };
    case "expanded_context":
      return {
        maxContextFiles: 14,
        maxTotalContextChars: 20_000,
        maxFileContextChars: 3_000,
        maxScanFiles: 1_200,
      };
    case "strategy_shift":
      return {
        maxContextFiles: 18,
        maxTotalContextChars: 28_000,
        maxFileContextChars: 3_600,
        maxScanFiles: 1_600,
      };
  }
}

function strategyChangeMessage(strategy: RetryStrategy): string {
  if (strategy === "local_patch") {
    return "Use targeted local edits only in the smallest relevant scope.";
  }
  if (strategy === "expanded_context") {
    return "Expand context to adjacent files/importers and address the dominant blocker family.";
  }
  return "Apply a different remediation approach from prior attempts, not a minor variant of the same patch.";
}

export function decideAdaptiveRetry(input: RetryDecisionInput): RetryDecision {
  const category = classifyFailureCategory(input.blockingFailures);
  const hypothesis = categoryHypothesis(category);
  const hasPrevious = Boolean(input.previousAttempt);
  const repeatedSignature = hasPrevious && input.previousAttempt!.signature === input.signature;
  const blockingNotImproved = hasPrevious && input.blockingCount >= input.previousAttempt!.blockingCount;

  if (hasPrevious && input.noProgressStreak >= 2 && input.blockingCount >= input.previousAttempt!.blockingCount) {
    return {
      shouldContinue: false,
      strategy: "strategy_shift",
      reason: "Consecutive retries failed to reduce blocking failures; aborting to avoid low-yield loop.",
      hypothesis,
      changedFromPrevious: "Aborting retries early to avoid repeating low-yield attempts.",
      successCriteria: "Not applicable (retry cycle terminated).",
      abandonCriteria: "No blocker reduction for two consecutive retries.",
      contextLimits: strategyContextLimits("strategy_shift"),
      category,
    };
  }

  let strategy: RetryStrategy = "local_patch";
  let reason = "Initial retry: apply a cheap, local correction for current blockers.";
  if (input.attempt >= 2) {
    if (repeatedSignature && blockingNotImproved) {
      strategy = input.attempt === 2 ? "expanded_context" : "strategy_shift";
      reason = "Repeated blocker signature without improvement; escalating retry strategy.";
    } else if (repeatedSignature) {
      strategy = "expanded_context";
      reason = "Signature repeated with partial progress; widen context to finish remaining blockers.";
    } else if (input.previousAttempt && input.previousAttempt.category !== category) {
      strategy = "expanded_context";
      reason = "Failure category changed; widen context to resolve cross-file side effects.";
    } else {
      strategy = "local_patch";
      reason = "Previous retry showed progress; continue with focused local corrections.";
    }
  }

  const changedFromPrevious = hasPrevious
    ? `Previous strategy=${input.previousAttempt!.strategy}; now strategy=${strategy}. ${strategyChangeMessage(strategy)}`
    : `No previous retry. Strategy=${strategy}. ${strategyChangeMessage(strategy)}`;

  return {
    shouldContinue: true,
    strategy,
    reason,
    hypothesis,
    changedFromPrevious,
    successCriteria: "Blocking failures should decrease or clear, and no new blocker signature should dominate.",
    abandonCriteria: "Abort when the same blocker signature repeats without progress for two consecutive retries.",
    contextLimits: strategyContextLimits(strategy),
    category,
  };
}

export function buildRetryStrategyInstructions(args: {
  strategy: RetryStrategy;
  attempt: number;
  maxAttempts: number;
  blockingFailures: string[];
  changedFromPrevious: string;
}): string {
  const dominantBlocker = args.blockingFailures[0] || "[no blocker summary]";
  if (args.strategy === "local_patch") {
    return [
      `RETRY STRATEGY: local_patch (${args.attempt}/${args.maxAttempts})`,
      "- Goal: cheapest viable fix in current scope.",
      "- Fix the dominant blocker first and avoid broad refactors.",
      `- Dominant blocker: ${dominantBlocker}`,
      `- Strategy change note: ${args.changedFromPrevious}`,
      "- Prefer one minimal edit batch before re-validation.",
    ].join("\n");
  }
  if (args.strategy === "expanded_context") {
    return [
      `RETRY STRATEGY: expanded_context (${args.attempt}/${args.maxAttempts})`,
      "- Goal: resolve blockers that likely span caller/callee or adjacent files.",
      "- Inspect and patch related importers/exports/contracts when needed.",
      `- Dominant blocker: ${dominantBlocker}`,
      `- Strategy change note: ${args.changedFromPrevious}`,
      "- Avoid repeating the exact same patch shape from the previous retry.",
    ].join("\n");
  }
  return [
    `RETRY STRATEGY: strategy_shift (${args.attempt}/${args.maxAttempts})`,
    "- Goal: switch approach because prior retries did not converge.",
    "- Apply a materially different fix path than previous attempts.",
    `- Dominant blocker: ${dominantBlocker}`,
    `- Strategy change note: ${args.changedFromPrevious}`,
    "- Do not submit a no-op or cosmetic variation of earlier edits.",
  ].join("\n");
}
