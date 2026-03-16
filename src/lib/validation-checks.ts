import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { exists } from "./fs.js";
import { unique } from "./text-utils.js";
import {
  buildScriptCommand,
  runCommand,
  selectPackageManager,
  readPackageScripts,
  type PackageManager,
} from "./command-runner.js";
import { IGNORED_DIRS, normalizeInputPath } from "./workspace-scanner.js";

export interface ValidationCheckResult {
  command: string;
  status: "passed" | "failed" | "skipped";
  category?: "cheap" | "heavy";
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPreview: string;
  stderrPreview: string;
  diagnostics?: string[];
  qaConfigNotes?: string[];
  artifacts?: string[];
}

interface FallbackValidationCommand {
  label: string;
  command: string;
  args: string[];
  qaConfigNotes: string[];
}

export interface TestCapabilities {
  hasUnitTestScript: boolean;
  hasE2EScript: boolean;
  hasE2ESpecFiles: boolean;
  unitScripts: string[];
  e2eScripts: string[];
  e2eSpecFiles: string[];
}

export const BASE_CHECK_SCRIPT_ORDER = ["check", "test", "lint", "build"] as const;
const UNIT_SCRIPT_CANDIDATES = ["test", "unit", "test:unit", "test:ci"] as const;
export const E2E_SCRIPT_CANDIDATES = [
  "e2e",
  "test:e2e",
  "e2e:test",
  "test:e2e:ci",
  "playwright",
  "playwright:test",
] as const;

const E2E_SPEC_FILE_PATTERN = /\.(?:cy|spec)\.[cm]?[jt]sx?$/i;
const E2E_SPEC_DIR_CANDIDATES = ["e2e"] as const;

async function collectE2eSpecFiles(workspaceRoot: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!E2E_SPEC_FILE_PATTERN.test(entry.name)) continue;
      out.push(normalizeInputPath(path.relative(workspaceRoot, absolutePath)));
    }
  }

  for (const relativeDir of E2E_SPEC_DIR_CANDIDATES) {
    const absoluteDir = path.join(workspaceRoot, relativeDir);
    if (!(await exists(absoluteDir))) continue;
    await walk(absoluteDir);
  }

  return unique(out);
}

function compactCommandPreview(value: string, maxChars = 1200): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeSignalLine(value: string, maxChars = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function extractSignalLines(text: string, patterns: RegExp[], maxItems = 8): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeSignalLine(rawLine);
    if (!line) continue;
    if (!patterns.some((pattern) => pattern.test(line))) continue;
    out.push(line);
    if (out.length >= maxItems) break;
  }
  return unique(out);
}

function hasChangedFile(changedFiles: string[], pattern: RegExp): boolean {
  return changedFiles.some((file) => pattern.test(file.toLowerCase()));
}

function buildTypeScriptFallbackCommand(manager: PackageManager): FallbackValidationCommand {
  switch (manager) {
    case "pnpm":
      return {
        label: "pnpm exec tsc --noEmit",
        command: "pnpm",
        args: ["exec", "tsc", "--noEmit"],
        qaConfigNotes: ["Language-aware fallback check: TypeScript compile/type validation without emit."],
      };
    case "yarn":
      return {
        label: "yarn tsc --noEmit",
        command: "yarn",
        args: ["tsc", "--noEmit"],
        qaConfigNotes: ["Language-aware fallback check: TypeScript compile/type validation without emit."],
      };
    case "bun":
      return {
        label: "bunx tsc --noEmit",
        command: "bunx",
        args: ["tsc", "--noEmit"],
        qaConfigNotes: ["Language-aware fallback check: TypeScript compile/type validation without emit."],
      };
    case "npm":
    default:
      return {
        label: "npx tsc --noEmit",
        command: "npx",
        args: ["tsc", "--noEmit"],
        qaConfigNotes: ["Language-aware fallback check: TypeScript compile/type validation without emit."],
      };
  }
}

function buildFallbackValidationCommands(args: {
  workspaceRoot: string;
  changedFiles?: string[];
  manager: PackageManager;
}): FallbackValidationCommand[] {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const changedFiles = unique((args.changedFiles || []).map((file) => normalizeInputPath(file)));
  const out: FallbackValidationCommand[] = [];

  const hasTypeScriptChanges = hasChangedFile(changedFiles, /\.(ts|tsx)$/);
  const hasPythonChanges = hasChangedFile(changedFiles, /\.py$/);
  const hasGoChanges = hasChangedFile(changedFiles, /\.go$/);
  const hasRustChanges = hasChangedFile(changedFiles, /\.rs$/);
  const hasJavaChanges = hasChangedFile(changedFiles, /\.java$/);

  if (
    hasTypeScriptChanges
    && (existsSync(path.join(workspaceRoot, "tsconfig.json")) || existsSync(path.join(workspaceRoot, "tsconfig.app.json")))
  ) {
    out.push(buildTypeScriptFallbackCommand(args.manager));
  }

  if (
    hasPythonChanges
    && (
      existsSync(path.join(workspaceRoot, "pyproject.toml"))
      || existsSync(path.join(workspaceRoot, "requirements.txt"))
      || existsSync(path.join(workspaceRoot, "setup.py"))
    )
  ) {
    const pyFiles = changedFiles.filter((file) => /\.py$/i.test(file)).slice(0, 20);
    if (pyFiles.length) {
      out.push({
        label: `python3 -m py_compile ${pyFiles.join(" ")}`,
        command: "python3",
        args: ["-m", "py_compile", ...pyFiles],
        qaConfigNotes: ["Language-aware fallback check: Python syntax validation for changed files."],
      });
    }
  }

  if (hasGoChanges && existsSync(path.join(workspaceRoot, "go.mod"))) {
    out.push({
      label: "go test ./... -run ^$",
      command: "go",
      args: ["test", "./...", "-run", "^$"],
      qaConfigNotes: ["Language-aware fallback check: Go compile/link validation without running test bodies."],
    });
  }

  if (hasRustChanges && existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
    out.push({
      label: "cargo check",
      command: "cargo",
      args: ["check"],
      qaConfigNotes: ["Language-aware fallback check: Rust compilation validation."],
    });
  }

  if (hasJavaChanges && existsSync(path.join(workspaceRoot, "pom.xml"))) {
    out.push({
      label: "mvn -q -DskipTests compile",
      command: "mvn",
      args: ["-q", "-DskipTests", "compile"],
      qaConfigNotes: ["Language-aware fallback check: Java compilation validation (Maven)."],
    });
  } else if (hasJavaChanges && existsSync(path.join(workspaceRoot, "gradlew"))) {
    out.push({
      label: "./gradlew -q classes",
      command: "./gradlew",
      args: ["-q", "classes"],
      qaConfigNotes: ["Language-aware fallback check: Java/Kotlin compilation validation (Gradle wrapper)."],
    });
  }

  return out;
}

function isCommandUnavailableResult(stdout: string, stderr: string, exitCode: number | null): boolean {
  if (exitCode === 127) return true;
  const corpus = `${stdout}\n${stderr}`.toLowerCase();
  return /\bcommand not found\b|is not recognized as an internal|no such file or directory/.test(corpus);
}

async function buildCheckDiagnostics(args: {
  stdout: string;
  stderr: string;
}): Promise<{ diagnostics: string[]; artifacts: string[] }> {
  const combined = `${args.stdout}\n${args.stderr}`;
  const patterns = [
    /\b(assertionerror|typeerror|referenceerror|syntaxerror|failed|error)\b/i,
    /\bts\d{4}\b/i,
    /\bexpected\b.+\bto\b/i,
    /\btimed out\b/i,
    /\bdoes not provide an export named\b/i,
    /\bno spec files were found\b/i,
    /\bplaywright\b/i,
    /\be2e\b/i,
    /[A-Za-z0-9_./-]+\.[cm]?[jt]sx?:\d+:\d+/,
  ];

  const diagnostics = extractSignalLines(combined, patterns, 8);
  return {
    diagnostics,
    artifacts: [],
  };
}

export async function detectTestCapabilities(workspaceRoot: string): Promise<TestCapabilities> {
  const normalizedRoot = path.resolve(workspaceRoot);
  const scripts = await readPackageScripts(normalizedRoot);
  const unitScripts = UNIT_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name]));
  const e2eScripts = E2E_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name]));
  const e2eSpecFiles = await collectE2eSpecFiles(normalizedRoot);

  return {
    hasUnitTestScript: unitScripts.length > 0,
    hasE2EScript: e2eScripts.length > 0,
    hasE2ESpecFiles: e2eSpecFiles.length > 0,
    unitScripts,
    e2eScripts,
    e2eSpecFiles,
  };
}

export async function runProjectChecks(args: {
  workspaceRoot: string;
  timeoutMsPerCheck?: number;
  includeE2E?: boolean;
  changedFiles?: string[];
}): Promise<ValidationCheckResult[]> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const scripts = await readPackageScripts(workspaceRoot);
  const availableBase = BASE_CHECK_SCRIPT_ORDER.filter((name) => Boolean(scripts[name]));
  const includeE2E = args.includeE2E ?? true;
  const availableE2e = includeE2E ? E2E_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name])) : [];
  const available = unique([...availableBase, ...availableE2e]);
  const manager = selectPackageManager(workspaceRoot);
  const fallbackCommands = buildFallbackValidationCommands({
    workspaceRoot,
    changedFiles: args.changedFiles,
    manager,
  });

  if (!available.length && !fallbackCommands.length) {
    return [
      {
        command: "[no executable validation checks]",
        status: "skipped",
        exitCode: 0,
        timedOut: false,
        durationMs: 0,
        stdoutPreview: "",
        stderrPreview: "No check/test/lint/e2e scripts found in package.json and no language-aware fallback check matched changed files.",
      },
    ];
  }

  const timeoutMs = args.timeoutMsPerCheck ?? 120_000;
  const results: ValidationCheckResult[] = [];

  for (const script of available) {
    const command = buildScriptCommand(manager, script);

    const result = await runCommand({
      command: command.command,
      commandArgs: command.args,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputChars: 8_000,
    });
    const diagnostics = await buildCheckDiagnostics({
      stdout: result.stdout,
      stderr: result.stderr,
    });

    results.push({
      command: `${command.command} ${command.args.join(" ")}`,
      status: result.exitCode === 0 && !result.timedOut ? "passed" : "failed",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdoutPreview: compactCommandPreview(result.stdout),
      stderrPreview: compactCommandPreview(result.stderr),
      diagnostics: diagnostics.diagnostics,
      qaConfigNotes: [],
      artifacts: diagnostics.artifacts,
    });
  }

  if (!available.length) {
    for (const fallback of fallbackCommands) {
      const result = await runCommand({
        command: fallback.command,
        commandArgs: fallback.args,
        cwd: workspaceRoot,
        timeoutMs,
        maxOutputChars: 10_000,
      });
      const unavailable = isCommandUnavailableResult(result.stdout, result.stderr, result.exitCode);
      const diagnostics = await buildCheckDiagnostics({
        stdout: result.stdout,
        stderr: result.stderr,
      });
      const status = unavailable
        ? "skipped"
        : (result.exitCode === 0 && !result.timedOut ? "passed" : "failed");

      results.push({
        command: `${fallback.command} ${fallback.args.join(" ")}`,
        status,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdoutPreview: compactCommandPreview(result.stdout),
        stderrPreview: unavailable
          ? `Fallback check skipped because command is unavailable in this environment: ${fallback.label}`
          : compactCommandPreview(result.stderr),
        diagnostics: diagnostics.diagnostics,
        qaConfigNotes: fallback.qaConfigNotes,
        artifacts: diagnostics.artifacts,
      });
    }
  }

  return results;
}
