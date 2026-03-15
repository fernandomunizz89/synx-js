export interface QaFindingLike {
  issue: string;
  expectedResult: string;
  receivedResult: string;
  evidence: string[];
  recommendedAction: string;
}

export interface QaRootCauseFocus {
  mustPrioritizeSourceFix: boolean;
  likelyAppCodeIssue: boolean;
  likelyTestIssue: boolean;
  likelyConfigIssue: boolean;
  sourceHints: string[];
  rationale: string[];
}

const TIMER_SOURCE_HINTS = [
  "src/hooks/useTimer.ts",
  "src/store/pomodoroStore.ts",
  "src/components/CircularTimer/CircularTimer.tsx",
  "src/components/Timer/Timer.tsx",
];

const SELECTOR_HINTS: Record<string, string[]> = {
  timer: ["src/components/Timer/Timer.tsx"],
  "timer-title": ["src/components/Timer/Timer.tsx"],
  "timer-display": [
    "src/components/CircularTimer/CircularTimer.tsx",
    "src/components/Timer/Timer.tsx",
  ],
  "circular-timer": [
    "src/components/CircularTimer/CircularTimer.tsx",
    "src/components/Timer/Timer.tsx",
  ],
  "timer-controls": [
    "src/components/Controls/Controls.tsx",
    "src/components/Timer/Timer.tsx",
  ],
  "start-button": [
    "src/components/Controls/Controls.tsx",
    "src/components/Timer/Timer.tsx",
    "src/components/CircularTimer/CircularTimer.tsx",
  ],
  "pause-button": [
    "src/components/Controls/Controls.tsx",
    "src/components/Timer/Timer.tsx",
    "src/components/CircularTimer/CircularTimer.tsx",
  ],
  "reset-button": [
    "src/components/Controls/Controls.tsx",
    "src/components/Timer/Timer.tsx",
    "src/components/CircularTimer/CircularTimer.tsx",
  ],
  "app-container": ["src/components/Layout/Layout.tsx"],
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function findingBlob(finding: QaFindingLike): string {
  return [
    finding.issue,
    finding.expectedResult,
    finding.receivedResult,
    finding.recommendedAction,
    ...finding.evidence,
  ].join("\n");
}

function extractSourcePaths(text: string): string[] {
  const out: string[] = [];
  const pattern = /((?:src|e2e)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    out.push(normalizePath(match[1]));
  }
  return unique(out);
}

function collectSelectorHints(text: string): string[] {
  const hints: string[] = [];
  for (const [selector, selectorHints] of Object.entries(SELECTOR_HINTS)) {
    const selectorPattern = new RegExp(`data-cy\\s*=\\s*["']${selector}["']|\\b${selector}\\b`, "i");
    if (selectorPattern.test(text)) hints.push(...selectorHints);
  }
  return unique(hints);
}

function analyzeSignals(text: string): {
  appScore: number;
  testScore: number;
  configScore: number;
  rationale: string[];
  sourceHints: string[];
} {
  const lower = text.toLowerCase();
  let appScore = 0;
  let testScore = 0;
  let configScore = 0;
  const rationale: string[] = [];
  const sourceHints: string[] = [];

  if (/does not provide an export named|import\/export mismatch|cannot find module|undefined is not a function/.test(lower)) {
    appScore += 3;
    rationale.push("Import/export/runtime contract suggests source-code defect.");
  }

  if (/timer is not counting down|timer value did not advance|expected '25:00' to not equal '25:00'|not decrementing/.test(lower)) {
    appScore += 3;
    rationale.push("Behavioral timer failure suggests runtime/state defect in application code.");
    sourceHints.push(...TIMER_SOURCE_HINTS);
  }

  if (/missing data-cy|selector hook|data-cy=/.test(lower)) {
    appScore += 2;
    rationale.push("Missing selector hooks map to UI component source files.");
    sourceHints.push(...collectSelectorHints(text));
  }

  if (/parsing error|timebefore is not defined|variable scoping|syntax error.+e2e/.test(lower)) {
    testScore += 3;
    rationale.push("Parsing/scoping diagnostics indicate test-file defects.");
  }

  if (/configfile is invalid|invalid cypress config|baseurl|specpattern|cypress\.config/.test(lower)) {
    configScore += 3;
    rationale.push("Diagnostics indicate configuration-level issue.");
  }

  const extracted = extractSourcePaths(text).filter((filePath) => filePath.startsWith("src/"));
  sourceHints.push(...extracted);

  return {
    appScore,
    testScore,
    configScore,
    rationale: unique(rationale),
    sourceHints: unique(sourceHints),
  };
}

export function deriveQaRootCauseFocus(args: {
  qaFailures: string[];
  findings: QaFindingLike[];
}): QaRootCauseFocus {
  const texts: string[] = [...args.qaFailures];
  for (const finding of args.findings) {
    texts.push(findingBlob(finding));
  }
  const combined = texts.join("\n");
  const signal = analyzeSignals(combined);
  const likelyAppCodeIssue = signal.appScore >= 2;
  const likelyTestIssue = signal.testScore >= 2;
  const likelyConfigIssue = signal.configScore >= 2;

  const mustPrioritizeSourceFix = likelyAppCodeIssue && signal.appScore >= signal.testScore;

  return {
    mustPrioritizeSourceFix,
    likelyAppCodeIssue,
    likelyTestIssue,
    likelyConfigIssue,
    sourceHints: unique(signal.sourceHints),
    rationale: unique(signal.rationale),
  };
}
