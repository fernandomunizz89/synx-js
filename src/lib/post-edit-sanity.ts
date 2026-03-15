import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { runCommand, type ValidationCheckResult } from "./workspace-tools.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface PackageJsonShape {
  scripts?: Record<string, string>;
}

export interface PostEditSanityResult {
  checks: ValidationCheckResult[];
  failureSummaries: string[];
  blockingFailureSummaries: string[];
  outOfScopeFailureSummaries: string[];
}

interface SanityCommand {
  label: string;
  command: string;
  args: string[];
  note: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function selectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

function buildScriptCommand(
  manager: PackageManager,
  script: string,
): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["run", "--if-present", script] };
    case "yarn":
      return { command: "yarn", args: ["run", script] };
    case "bun":
      return { command: "bun", args: ["run", script] };
    case "npm":
    default:
      return { command: "npm", args: ["run", "--if-present", script] };
  }
}

async function readPackageScripts(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as PackageJsonShape;
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

function looksLikeCodeFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized) || normalized.endsWith("package.json");
}

function extractDiagnostics(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const out: string[] = [];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/\b(error|failed|cannot|not found|syntax|typeerror|referenceerror|ts\d{4})\b/i.test(line)) continue;
    out.push(line.length > 220 ? `${line.slice(0, 219)}…` : line);
    if (out.length >= 6) break;
  }
  return unique(out);
}

function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "");
}

function extractPathTokens(text: string): string[] {
  const out: string[] = [];
  const pattern = /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.(json|css|scss|md|yml|yaml))(?::\d+:\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const token = normalizePathToken(match[1]);
    if (token) out.push(token);
  }
  return unique(out);
}

function intersectsScope(paths: string[], scope: Set<string>): boolean {
  if (!scope.size) return true;
  if (!paths.length) return true;
  return paths.some((filePath) => {
    const normalized = normalizePathToken(filePath);
    if (scope.has(normalized)) return true;
    for (const scopePath of scope) {
      if (normalized.endsWith(scopePath) || scopePath.endsWith(normalized)) return true;
    }
    return false;
  });
}

function chooseSanityScripts(args: {
  scripts: Record<string, string>;
  changedFiles: string[];
}): string[] {
  const out: string[] = [];
  const changedCode = args.changedFiles.some(looksLikeCodeFile);
  const scripts = args.scripts;

  if (scripts.lint) out.push("lint");
  if (scripts.typecheck) out.push("typecheck");
  if (scripts.check && !out.includes("check")) out.push("check");
  if (changedCode && scripts.build && !out.includes("build")) out.push("build");

  // Keep this lightweight: enough to catch syntax/type issues without full test pipeline.
  return unique(out).slice(0, 2);
}

function hasChangedFile(changedFiles: string[], pattern: RegExp): boolean {
  return changedFiles.some((file) => pattern.test(file.toLowerCase()));
}

function buildTypeScriptNoEmitCommand(manager: PackageManager): SanityCommand {
  switch (manager) {
    case "pnpm":
      return {
        label: "pnpm exec tsc --noEmit",
        command: "pnpm",
        args: ["exec", "tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
      };
    case "yarn":
      return {
        label: "yarn tsc --noEmit",
        command: "yarn",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
      };
    case "bun":
      return {
        label: "bunx tsc --noEmit",
        command: "bunx",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
      };
    case "npm":
    default:
      return {
        label: "npx tsc --noEmit",
        command: "npx",
        args: ["tsc", "--noEmit"],
        note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
      };
  }
}

function buildFallbackLanguageCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  manager: PackageManager;
  scriptsChosen: string[];
}): SanityCommand[] {
  const out: SanityCommand[] = [];
  const { workspaceRoot, changedFiles, manager, scriptsChosen } = args;
  const hasTsConfig = existsSync(path.join(workspaceRoot, "tsconfig.json"));
  const hasTypeScriptChanges = hasChangedFile(changedFiles, /\.(ts|tsx)$/);
  const hasPythonChanges = hasChangedFile(changedFiles, /\.py$/);
  const hasGoChanges = hasChangedFile(changedFiles, /\.go$/);
  const hasRustChanges = hasChangedFile(changedFiles, /\.rs$/);
  const hasJavaChanges = hasChangedFile(changedFiles, /\.java$/);

  const scriptSet = new Set(scriptsChosen.map((x) => x.toLowerCase()));
  const alreadyHasTsScriptCoverage = scriptSet.has("typecheck") || scriptSet.has("check");
  if (hasTsConfig && (hasTypeScriptChanges || changedFiles.length === 0) && !alreadyHasTsScriptCoverage) {
    out.push(buildTypeScriptNoEmitCommand(manager));
  }

  if (
    hasPythonChanges &&
    (existsSync(path.join(workspaceRoot, "pyproject.toml"))
      || existsSync(path.join(workspaceRoot, "requirements.txt"))
      || existsSync(path.join(workspaceRoot, "setup.py")))
  ) {
    const pyFiles = changedFiles
      .filter((file) => /\.py$/i.test(file))
      .slice(0, 20);
    if (pyFiles.length) {
      out.push({
        label: `python3 -m py_compile ${pyFiles.join(" ")}`,
        command: "python3",
        args: ["-m", "py_compile", ...pyFiles],
        note: "Language-aware sanity check for Python syntax in changed files.",
      });
    }
  }

  if (hasGoChanges && existsSync(path.join(workspaceRoot, "go.mod"))) {
    out.push({
      label: "go test ./... -run ^$",
      command: "go",
      args: ["test", "./...", "-run", "^$"],
      note: "Language-aware sanity check for Go compile/link without running test bodies.",
    });
  }

  if (hasRustChanges && existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
    out.push({
      label: "cargo check",
      command: "cargo",
      args: ["check"],
      note: "Language-aware sanity check for Rust compilation.",
    });
  }

  if (hasJavaChanges && existsSync(path.join(workspaceRoot, "pom.xml"))) {
    out.push({
      label: "mvn -q -DskipTests compile",
      command: "mvn",
      args: ["-q", "-DskipTests", "compile"],
      note: "Language-aware sanity check for Java compilation (Maven).",
    });
  } else if (hasJavaChanges && existsSync(path.join(workspaceRoot, "gradlew"))) {
    out.push({
      label: "./gradlew -q classes",
      command: "./gradlew",
      args: ["-q", "classes"],
      note: "Language-aware sanity check for Java/Kotlin compilation (Gradle wrapper).",
    });
  }

  return out;
}

function resolveSanityCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scripts: Record<string, string>;
  manager: PackageManager;
}): SanityCommand[] {
  const scriptChoices = chooseSanityScripts({
    scripts: args.scripts,
    changedFiles: args.changedFiles,
  });
  const scriptCommands: SanityCommand[] = scriptChoices.map((script) => {
    const command = buildScriptCommand(args.manager, script);
    return {
      label: `${command.command} ${command.args.join(" ")}`,
      command: command.command,
      args: command.args,
      note: "Script-based post-edit sanity check.",
    };
  });

  const fallbackCommands = buildFallbackLanguageCommands({
    workspaceRoot: args.workspaceRoot,
    changedFiles: args.changedFiles,
    manager: args.manager,
    scriptsChosen: scriptChoices,
  });

  return [...scriptCommands, ...fallbackCommands].slice(0, 3);
}

export async function runPostEditSanityChecks(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scopeFiles?: string[];
  timeoutMsPerCheck?: number;
}): Promise<PostEditSanityResult> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const scripts = await readPackageScripts(workspaceRoot);
  const manager = selectPackageManager(workspaceRoot);
  const selectedCommands = resolveSanityCommands({
    workspaceRoot,
    changedFiles: args.changedFiles,
    scripts,
    manager,
  });

  if (!selectedCommands.length) {
    return {
      checks: [],
      failureSummaries: [],
      blockingFailureSummaries: [],
      outOfScopeFailureSummaries: [],
    };
  }

  const timeoutMs = args.timeoutMsPerCheck ?? 90_000;
  const checks: ValidationCheckResult[] = [];
  const scopeSet = new Set((args.scopeFiles || []).map((x) => normalizePathToken(x)).filter(Boolean));

  for (const sanityCommand of selectedCommands) {
    const result = await runCommand({
      command: sanityCommand.command,
      commandArgs: sanityCommand.args,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputChars: 8_000,
    });
    const diagnostics = extractDiagnostics(result.stdout, result.stderr);
    checks.push({
      command: sanityCommand.label,
      status: result.exitCode === 0 && !result.timedOut ? "passed" : "failed",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdoutPreview: result.stdout.slice(0, 1000),
      stderrPreview: result.stderr.slice(0, 1000),
      diagnostics,
      qaConfigNotes: [sanityCommand.note],
      artifacts: [],
    });
  }

  const failureSummaries: string[] = [];
  const blockingFailureSummaries: string[] = [];
  const outOfScopeFailureSummaries: string[] = [];

  for (const check of checks) {
    if (check.status !== "failed") continue;
    const detail = check.diagnostics?.[0] || check.stderrPreview || check.stdoutPreview || "No diagnostic captured.";
    const summary = `Post-edit sanity check failed: ${check.command} | ${detail.slice(0, 220)}`;
    const paths = extractPathTokens([
      ...(check.diagnostics || []),
      check.stderrPreview,
      check.stdoutPreview,
    ].join("\n"));
    const isInScope = intersectsScope(paths, scopeSet);
    failureSummaries.push(summary);
    if (isInScope) {
      blockingFailureSummaries.push(summary);
      continue;
    }
    outOfScopeFailureSummaries.push(summary);
  }

  return {
    checks,
    failureSummaries: unique(failureSummaries),
    blockingFailureSummaries: unique(blockingFailureSummaries),
    outOfScopeFailureSummaries: unique(outOfScopeFailureSummaries),
  };
}
