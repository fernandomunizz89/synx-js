import { trimText, unique, uniqueNormalized } from "./text-utils.js";
import path from "node:path";
import { exists, readJson } from "./fs.js";
import { taskDir } from "./paths.js";
import { DONE_FILE_NAMES } from "./constants.js";

export function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "");
}

export function extractQaFailures(previousStage: unknown): string[] {
  if (!previousStage || typeof previousStage !== "object") return [];
  const output = (previousStage as { output?: unknown }).output;
  if (!output || typeof output !== "object") return [];
  const failures = (output as { failures?: unknown }).failures;
  if (!Array.isArray(failures)) return [];
  return failures.filter((x): x is string => typeof x === "string");
}

export function contextMentionsE2e(text: string): boolean {
  return /\be2e\b|playwright/i.test(text);
}

export function textSignalsMissingE2eSpecs(text: string): boolean {
  return /no spec files were found|can'?t run because no spec files were found|did not find e2e spec files|missing e2e spec/i.test(text);
}

export function hasQaMissingE2eSpecSignal(args: {
  qaFailures: string[];
  latestFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
  cumulativeFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
}): boolean {
  const corpus = [
    ...args.qaFailures,
    ...args.latestFindings.flatMap((item) => [item.issue, item.expectedResult, item.receivedResult, item.recommendedAction, ...item.evidence]),
    ...args.cumulativeFindings.flatMap((item) => [item.issue, item.expectedResult, item.receivedResult, item.recommendedAction, ...item.evidence]),
  ].join("\n").toLowerCase();
  return textSignalsMissingE2eSpecs(corpus);
}

export function formatQaFindingsForView(
  findings: Array<{ issue: string; expectedResult: string; receivedResult: string; recommendedAction: string }>,
): string {
  if (!findings.length) return "- [none]";
  return findings
    .map((item, index) => `${index + 1}. ${item.issue}
   Expected: ${item.expectedResult}
   Received: ${item.receivedResult}
   Recommended action: ${item.recommendedAction || "[none]"}`)
    .join("\n");
}

export function compactQaFindingsForModel(
  findings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>,
  maxItems = 5,
): Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }> {
  return findings.slice(0, maxItems).map((item) => ({
    issue: trimText(item.issue, 180),
    expectedResult: trimText(item.expectedResult, 180),
    receivedResult: trimText(item.receivedResult, 180),
    evidence: item.evidence.map((x) => trimText(x, 160)).slice(0, 3),
    recommendedAction: trimText(item.recommendedAction, 220),
  }));
}

export function compactQaHistoryForModel(
  history: Array<{ attempt: number; summary: string; returnedTo: string; findings: Array<{ issue: string }> }>,
): Array<{ attempt: number; summary: string; returnedTo: string; findingIssues: string[] }> {
  return history.slice(-4).map((entry) => ({
    attempt: entry.attempt,
    summary: trimText(entry.summary, 180),
    returnedTo: entry.returnedTo,
    findingIssues: entry.findings.map((x) => trimText(x.issue, 120)).slice(0, 4),
  }));
}

export function buildQaFeedbackQuery(args: {
  title: string;
  rawRequest: string;
  qaFailures: string[];
  latestFindings: Array<{ issue: string; expectedResult: string; receivedResult: string; evidence: string[]; recommendedAction: string }>;
  repeatedIssues: string[];
}): string {
  const lines: string[] = [];
  lines.push(args.title);
  lines.push(args.rawRequest);
  if (args.qaFailures.length) {
    lines.push("QA Failures:");
    for (const item of args.qaFailures.slice(0, 6)) lines.push(`- ${trimText(item, 180)}`);
  }
  if (args.latestFindings.length) {
    lines.push("Latest QA Expected vs Received:");
    for (const item of args.latestFindings.slice(0, 5)) {
      lines.push(`- ${trimText(item.issue, 120)}`);
      lines.push(`  expected=${trimText(item.expectedResult, 120)}`);
      lines.push(`  received=${trimText(item.receivedResult, 120)}`);
      if (item.recommendedAction) lines.push(`  action=${trimText(item.recommendedAction, 140)}`);
      if (item.evidence.length) lines.push(`  evidence=${item.evidence.map((x) => trimText(x, 80)).join(" | ")}`);
    }
  }
  if (args.repeatedIssues.length) {
    lines.push("Repeated QA Issues:");
    for (const issue of args.repeatedIssues.slice(0, 5)) lines.push(`- ${trimText(issue, 120)}`);
  }
  return lines.join("\n");
}

export function contextLimitsForIteration(qaAttempt: number) {
  if (qaAttempt >= 2) {
    return {
      maxContextFiles: 8,
      maxTotalContextChars: 16_000,
      maxFileContextChars: 2_800,
      maxScanFiles: 900,
    };
  }

  return {
    maxContextFiles: 10,
    maxTotalContextChars: 22_000,
    maxFileContextChars: 4_200,
    maxScanFiles: 1_100,
  };
}

export function editSignature(edits: Array<{ path: string; action: string; find?: string; replace?: string; content?: string }>): string {
  return edits
    .map((edit) => {
      const p = edit.path.replace(/\\/g, "/").trim().toLowerCase();
      const find = (edit.find || "").trim().slice(0, 80);
      const replace = (edit.replace || "").trim().slice(0, 80);
      const contentSample = (edit.content || "").trim().slice(0, 80);
      return `${edit.action}|${p}|${find}|${replace}|${contentSample.length}`;
    })
    .sort()
    .join("||");
}

export async function loadPreviousBugFixerSignature(taskId: string): Promise<string | null> {
  const donePath = path.join(taskDir(taskId), "done", DONE_FILE_NAMES.bugFixer);
  if (!(await exists(donePath))) return null;
  try {
    const envelope = await readJson<{ output?: { edits?: Array<{ path: string; action: string; find?: string; replace?: string; content?: string }> } }>(donePath);
    const edits = envelope.output?.edits;
    if (!Array.isArray(edits) || edits.length === 0) return null;
    return editSignature(edits);
  } catch {
    return null;
  }
}

export async function loadPreviousSkippedSnippetPaths(taskId: string): Promise<string[]> {
  const donePath = path.join(taskDir(taskId), "done", DONE_FILE_NAMES.bugFixer);
  if (!(await exists(donePath))) return [];
  try {
    const envelope = await readJson<{ output?: { risks?: unknown } }>(donePath);
    const risks = envelope.output?.risks;
    if (!Array.isArray(risks)) return [];
    return unique(
      risks
        .filter((item): item is string => typeof item === "string")
        .map((item) => {
          const match = item.match(/^Skipped edit:\s*([^\s].*?)\s*\(replace_snippet skipped: target snippet not found\)/i);
          return match ? match[1].trim() : "";
        })
        .filter(Boolean),
    );
  } catch {
    return [];
  }
}

export function hasE2eInfraEdits(edits: Array<{ path: string }>): boolean {
  return edits.some((edit) => {
    const p = edit.path.replace(/\\/g, "/").toLowerCase();
    return (
      p === "package.json" ||
      p.includes("/e2e/") ||
      p.endsWith(".spec.ts") ||
      p.endsWith(".spec.tsx") ||
      p.includes("playwright")
    );
  });
}

export function hasSourceEdits(edits: Array<{ path: string }>): boolean {
  return edits.some((edit) => edit.path.replace(/\\/g, "/").startsWith("src/"));
}

export function extractSymbolContractFileHints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hints: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const modulePath = typeof row.modulePath === "string" ? row.modulePath.trim() : "";
    const importerPath = typeof row.importerPath === "string" ? row.importerPath.trim() : "";
    if (modulePath) hints.push(modulePath);
    if (importerPath) hints.push(importerPath);
  }
  return unique(hints);
}
