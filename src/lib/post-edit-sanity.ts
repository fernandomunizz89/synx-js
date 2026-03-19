import path from "node:path";
import { runCommand, type ValidationCheckResult } from "./workspace-tools.js";
import { unique } from "./text-utils.js";
import { extractDiagnostics, extractHiddenLogBlockers, extractPathTokens, intersectsScope, normalizePathToken } from "./sanity/diagnostics.js";
import { runCheapStaticHeuristics } from "./sanity/heuristics.js";
import { selectPackageManager, readPackageScripts } from "./sanity/package-manager.js";
import { resolveSanityCommands } from "./sanity/resolver.js";

export interface PostEditSanityResult {
  checks: ValidationCheckResult[];
  failureSummaries: string[];
  blockingFailureSummaries: string[];
  outOfScopeFailureSummaries: string[];
  metrics: {
    plannedChecks: number;
    executedChecks: number;
    cheapChecksExecuted: number;
    heavyChecksExecuted: number;
    fullBuildChecksExecuted: number;
    heavyChecksSkipped: number;
    earlyInScopeFailures: number;
  };
}

function checkFailureIsInScope(check: ValidationCheckResult, scopeSet: Set<string>): boolean {
  const paths = extractPathTokens([
    ...(check.diagnostics || []),
    check.stderrPreview,
    check.stdoutPreview,
  ].join("\n"));
  return intersectsScope(paths, scopeSet);
}

function isProjectWideBlockingCheck(check: ValidationCheckResult): boolean {
  return !check.command.toLowerCase().startsWith("heuristic:");
}

export async function runPostEditSanityChecks(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scopeFiles?: string[];
  timeoutMsPerCheck?: number;
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
  enforceCleanProject?: boolean;
  detectHiddenLogBlockers?: boolean;
}): Promise<PostEditSanityResult> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const scripts = await readPackageScripts(workspaceRoot);
  const manager = selectPackageManager(workspaceRoot);
  const detectHiddenLogBlockers = args.detectHiddenLogBlockers ?? true;
  const enforceCleanProject = Boolean(args.enforceCleanProject);
  const commandPlan = resolveSanityCommands({ workspaceRoot, changedFiles: args.changedFiles, scripts, manager, requireLintScript: args.requireLintScript, requireBuildScript: args.requireBuildScript });
  const heuristicChecks = await runCheapStaticHeuristics({ workspaceRoot, changedFiles: args.changedFiles });
  const metrics = {
    plannedChecks: heuristicChecks.length + commandPlan.cheap.length + commandPlan.heavy.length,
    executedChecks: 0, cheapChecksExecuted: 0, heavyChecksExecuted: 0, fullBuildChecksExecuted: 0, heavyChecksSkipped: 0, earlyInScopeFailures: 0,
  };

  if (!commandPlan.cheap.length && !commandPlan.heavy.length && !heuristicChecks.length) {
    return { checks: [], failureSummaries: [], blockingFailureSummaries: [], outOfScopeFailureSummaries: [], metrics };
  }

  const timeoutMs = args.timeoutMsPerCheck ?? 90_000;
  const checks: ValidationCheckResult[] = [];
  const scopeSet = new Set((args.scopeFiles || []).map((x) => normalizePathToken(x)).filter(Boolean));

  for (const h of heuristicChecks) {
    checks.push(h); metrics.executedChecks += 1; metrics.cheapChecksExecuted += 1;
    if (h.status === "failed" && checkFailureIsInScope(h, scopeSet)) metrics.earlyInScopeFailures += 1;
  }

  for (const cmd of commandPlan.cheap) {
    const res = await runCommand({ command: cmd.command, commandArgs: cmd.args, cwd: workspaceRoot, timeoutMs, maxOutputChars: 8_000 });
    const hidden = detectHiddenLogBlockers ? extractHiddenLogBlockers(res.stdout, res.stderr) : [];
    const diagnostics = unique([...extractDiagnostics(res.stdout, res.stderr), ...hidden]).slice(0, 6);
    checks.push({
      command: cmd.label, status: res.exitCode === 0 && !res.timedOut && !hidden.length ? "passed" : "failed",
      category: "cheap", exitCode: res.exitCode, timedOut: res.timedOut, durationMs: res.durationMs,
      stdoutPreview: res.stdout.slice(0, 1000), stderrPreview: res.stderr.slice(0, 1000), diagnostics,
      qaConfigNotes: [cmd.note, ...(hidden.length ? ["Hidden blocker signatures detected."] : [])], artifacts: [],
    });
    metrics.executedChecks += 1; metrics.cheapChecksExecuted += 1;
    if (checks[checks.length - 1].status === "failed" && checkFailureIsInScope(checks[checks.length - 1], scopeSet)) metrics.earlyInScopeFailures += 1;
  }

  if (metrics.earlyInScopeFailures > 0 && commandPlan.heavy.length) {
    for (const s of commandPlan.heavy) {
      checks.push({ command: s.label, status: "skipped", category: "heavy", exitCode: null, timedOut: false, durationMs: 0, stdoutPreview: "", stderrPreview: "", diagnostics: [], qaConfigNotes: [`${s.note} Skipped due to early failures.`], artifacts: [] });
      metrics.heavyChecksSkipped += 1;
    }
  } else {
    for (const cmd of commandPlan.heavy) {
      const res = await runCommand({ command: cmd.command, commandArgs: cmd.args, cwd: workspaceRoot, timeoutMs, maxOutputChars: 8_000 });
      const hidden = detectHiddenLogBlockers ? extractHiddenLogBlockers(res.stdout, res.stderr) : [];
      const diagnostics = unique([...extractDiagnostics(res.stdout, res.stderr), ...hidden]).slice(0, 6);
      checks.push({ command: cmd.label, status: res.exitCode === 0 && !res.timedOut && !hidden.length ? "passed" : "failed", category: "heavy", exitCode: res.exitCode, timedOut: res.timedOut, durationMs: res.durationMs, stdoutPreview: res.stdout.slice(0, 1000), stderrPreview: res.stderr.slice(0, 1000), diagnostics, qaConfigNotes: [cmd.note, ...(hidden.length ? ["Hidden blocker signatures detected."] : [])], artifacts: [] });
      metrics.executedChecks += 1; metrics.heavyChecksExecuted += 1;
      if (cmd.isFullBuild) metrics.fullBuildChecksExecuted += 1;
    }
  }

  const fail = [], block = [], out = [];
  for (const c of checks) {
    if (c.status !== "failed") continue;
    const detail = c.diagnostics?.[0] || c.stderrPreview || c.stdoutPreview || "No diagnostic captured.";
    const summary = `Post-edit sanity check failed: ${c.command} | ${detail.slice(0, 220)}`;
    const paths = extractPathTokens([...(c.diagnostics || []), c.stderrPreview, c.stdoutPreview].join("\n"));
    const isInScope = intersectsScope(paths, scopeSet);
    const isProjectWide = enforceCleanProject && isProjectWideBlockingCheck(c);
    fail.push(summary);
    if (isInScope || isProjectWide) block.push(summary); else out.push(summary);
  }

  return { checks, failureSummaries: unique(fail), blockingFailureSummaries: unique(block), outOfScopeFailureSummaries: unique(out), metrics };
}
