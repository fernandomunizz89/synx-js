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

const SOURCE_PATH_PATTERN = /((?:src|app|apps|packages|services|libs|server|client|web|frontend|backend)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
const ABSOLUTE_SOURCE_PATH_PATTERN = /\/((?:src|app|apps|packages|services|libs|server|client|web|frontend|backend)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
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
  let match: RegExpExecArray | null;

  while ((match = SOURCE_PATH_PATTERN.exec(text))) {
    out.push(normalizePath(match[1]));
  }
  while ((match = ABSOLUTE_SOURCE_PATH_PATTERN.exec(text))) {
    out.push(normalizePath(match[1]));
  }

  return unique(out);
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
  const sourceHints = extractSourcePaths(text);

  if (
    /does not provide an export named|import\/export mismatch|cannot find module|module not found|undefined is not a function|cannot read properties of undefined|uncaught (?:syntaxerror|typeerror|referenceerror)/.test(lower)
  ) {
    appScore += 3;
    rationale.push("Runtime/import/export signals suggest a source-code defect.");
  }

  if (
    /build failed|failed to compile|error ts\d{4}|type error|syntax error|lint .* failed|no-unused-vars|all destructured elements are unused/.test(lower)
  ) {
    appScore += 2;
    rationale.push("Compile/lint/type diagnostics indicate code-level issues.");
  }

  if (/\bdata-cy\b|selector hook|missing selector|testid|data-testid/.test(lower)) {
    appScore += 2;
    rationale.push("Selector failures usually require source/UI markup updates.");
  }

  if (/assertion failed|parsing error|is not defined|test logic|spec syntax|flaky test/.test(lower)) {
    testScore += 3;
    rationale.push("Assertion/spec diagnostics indicate a likely test-side issue.");
  }

  if (/invalid .*config|configfile is invalid|baseurl|specpattern|cannot find.*config|missing env|configuration/.test(lower)) {
    configScore += 3;
    rationale.push("Diagnostics indicate configuration-level issues.");
  }

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
