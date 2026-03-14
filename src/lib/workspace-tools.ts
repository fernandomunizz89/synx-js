import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { ensureDir, exists } from "./fs.js";
import { nowIso } from "./utils.js";

const IGNORED_DIRS = new Set([
  ".git",
  ".ai-agents",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".txt",
  ".toml",
  ".xml",
  ".svg",
]);

const ALWAYS_ALLOWED_FILE_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "into",
  "have",
  "will",
  "would",
  "should",
  "could",
  "please",
  "task",
  "need",
  "make",
  "change",
  "update",
  "fix",
  "bug",
  "feature",
  "refactor",
]);

const MAX_SCAN_FILES = 1200;
const MAX_FILE_SIZE_BYTES = 300_000;
const MAX_FILE_CONTEXT_CHARS = 7000;
const MAX_CONTEXT_FILES = 12;
const MAX_TOTAL_CONTEXT_CHARS = 30_000;

export type WorkspaceEditAction = "create" | "replace" | "replace_snippet" | "delete";

export interface WorkspaceEdit {
  path: string;
  action: WorkspaceEditAction;
  content?: string;
  find?: string;
  replace?: string;
}

export interface WorkspaceFileContext {
  path: string;
  content: string;
  truncated: boolean;
  score: number;
}

export interface WorkspaceContextSnapshot {
  root: string;
  generatedAt: string;
  keywords: string[];
  files: WorkspaceFileContext[];
}

export interface AppliedWorkspaceEdits {
  appliedFiles: string[];
  skippedEdits: string[];
  warnings: string[];
}

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface ValidationCheckResult {
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface TestCapabilities {
  hasUnitTestScript: boolean;
  hasE2EScript: boolean;
  unitScripts: string[];
  e2eScripts: string[];
}

function normalizeInputPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function isInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function isBlockedPath(relativePath: string): boolean {
  const normalized = normalizeInputPath(relativePath);
  return normalized === ".ai-agents" || normalized.startsWith(".ai-agents/") || normalized === ".git" || normalized.startsWith(".git/");
}

function shouldReadFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (ALWAYS_ALLOWED_FILE_NAMES.has(base)) return true;
  const ext = path.extname(base).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !STOPWORDS.has(x));
  return Array.from(new Set(words)).slice(0, 14);
}

function scoreText(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += 1;
  }
  return score;
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(current: string): Promise<void> {
    if (out.length >= MAX_SCAN_FILES) return;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (out.length >= MAX_SCAN_FILES) break;
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (isBlockedPath(relativePath)) continue;
      if (!shouldReadFile(relativePath)) continue;

      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || stat.size > MAX_FILE_SIZE_BYTES) continue;
      out.push(relativePath);
    }
  }

  await walk(root);
  return out;
}

function extensionPriority(filePath: string): number {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return 5;
    case ".tsx":
    case ".jsx":
    case ".vue":
    case ".svelte":
      return 4;
    case ".ts":
    case ".js":
    case ".mjs":
    case ".cjs":
      return 3;
    case ".html":
    case ".htm":
      return 2;
    default:
      return 1;
  }
}

function sortByScore(paths: string[], keywords: string[], related: Set<string>): string[] {
  return [...paths].sort((a, b) => {
    const aNorm = normalizeInputPath(a);
    const bNorm = normalizeInputPath(b);
    const aRelated = related.has(aNorm) ? 1 : 0;
    const bRelated = related.has(bNorm) ? 1 : 0;
    if (aRelated !== bRelated) return bRelated - aRelated;

    const scoreA = scoreText(aNorm, keywords);
    const scoreB = scoreText(bNorm, keywords);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const extA = extensionPriority(aNorm);
    const extB = extensionPriority(bNorm);
    if (extA !== extB) return extB - extA;

    return aNorm.localeCompare(bNorm);
  });
}

function sanitizeForContext(content: string): string {
  const withoutNull = content.replace(/\0/g, "");
  if (withoutNull.length <= MAX_FILE_CONTEXT_CHARS) return withoutNull;
  return `${withoutNull.slice(0, MAX_FILE_CONTEXT_CHARS)}\n/* ... truncated ... */`;
}

export async function buildWorkspaceContextSnapshot(args: {
  workspaceRoot: string;
  query: string;
  relatedFiles?: string[];
}): Promise<WorkspaceContextSnapshot> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const keywords = extractKeywords(args.query);
  const related = new Set((args.relatedFiles || []).map((x) => normalizeInputPath(x)).filter(Boolean));

  const candidates = await walkFiles(workspaceRoot);
  const sorted = sortByScore(candidates, keywords, related);

  const files: WorkspaceFileContext[] = [];
  let totalChars = 0;

  for (const relativePath of sorted) {
    if (files.length >= MAX_CONTEXT_FILES) break;
    if (totalChars >= MAX_TOTAL_CONTEXT_CHARS) break;

    const absolutePath = path.join(workspaceRoot, relativePath);
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw.trim()) continue;

    const sanitized = sanitizeForContext(raw);
    const truncated = sanitized.includes("/* ... truncated ... */");
    const contentScore = scoreText(sanitized, keywords);
    const pathScore = scoreText(relativePath, keywords);
    const finalScore = (related.has(normalizeInputPath(relativePath)) ? 4 : 0) + (contentScore * 2) + pathScore + extensionPriority(relativePath);

    files.push({
      path: normalizeInputPath(relativePath),
      content: sanitized,
      truncated,
      score: finalScore,
    });

    totalChars += sanitized.length;
  }

  files.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    root: workspaceRoot,
    generatedAt: nowIso(),
    keywords,
    files,
  };
}

export function resolveWorkspacePath(workspaceRoot: string, filePath: string): { absolutePath: string; relativePath: string } {
  const root = path.resolve(workspaceRoot);
  const normalizedInput = normalizeInputPath(filePath);
  if (!normalizedInput) throw new Error("Edit path is empty.");

  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(root, normalizedInput);

  if (!isInsideRoot(root, absolutePath)) {
    throw new Error(`Path escapes workspace root: ${filePath}`);
  }

  const relativePath = normalizeInputPath(path.relative(root, absolutePath));
  if (isBlockedPath(relativePath)) {
    throw new Error(`Path is protected and cannot be edited: ${relativePath}`);
  }

  return { absolutePath, relativePath };
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export async function applyWorkspaceEdits(args: {
  workspaceRoot: string;
  edits: WorkspaceEdit[];
}): Promise<AppliedWorkspaceEdits> {
  const appliedFiles: string[] = [];
  const skippedEdits: string[] = [];
  const warnings: string[] = [];

  for (const edit of args.edits) {
    try {
      const { absolutePath, relativePath } = resolveWorkspacePath(args.workspaceRoot, edit.path);

      if (edit.action === "delete") {
        if (await exists(absolutePath)) {
          await fs.unlink(absolutePath);
          appliedFiles.push(relativePath);
        } else {
          skippedEdits.push(`${relativePath} (delete skipped: file does not exist)`);
        }
        continue;
      }

      if (edit.action === "replace_snippet") {
        if (!(await exists(absolutePath))) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: file does not exist)`);
          continue;
        }
        if (typeof edit.find !== "string" || !edit.find.length || typeof edit.replace !== "string") {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: missing find/replace)`);
          continue;
        }

        const current = await fs.readFile(absolutePath, "utf8");
        if (!current.includes(edit.find)) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: target snippet not found)`);
          continue;
        }

        const next = current.replace(edit.find, edit.replace);
        await fs.writeFile(absolutePath, next, "utf8");
        appliedFiles.push(relativePath);
        continue;
      }

      if (typeof edit.content !== "string") {
        skippedEdits.push(`${relativePath} (${edit.action} skipped: missing content)`);
        continue;
      }

      await ensureDir(path.dirname(absolutePath));
      await fs.writeFile(absolutePath, edit.content, "utf8");
      appliedFiles.push(relativePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Edit skipped for "${edit.path}": ${message}`);
    }
  }

  return {
    appliedFiles: unique(appliedFiles),
    skippedEdits: unique(skippedEdits),
    warnings: unique(warnings),
  };
}

export async function runCommand(args: {
  command: string;
  commandArgs: string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}): Promise<CommandResult> {
  const timeoutMs = args.timeoutMs ?? 120_000;
  const maxOutputChars = args.maxOutputChars ?? 12_000;

  return new Promise<CommandResult>((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const limit = (value: string, chunk: Buffer): string => {
      if (value.length >= maxOutputChars) return value;
      const appended = value + chunk.toString("utf8");
      return appended.length > maxOutputChars ? appended.slice(0, maxOutputChars) : appended;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = limit(stdout, chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = limit(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);

    const finalize = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command: args.command,
        args: args.commandArgs,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    };

    child.on("error", (error) => {
      stderr = `${stderr}\n${error.message}`.trim();
      finalize(-1);
    });

    child.on("close", (code) => {
      finalize(code);
    });
  });
}

export async function isGitRepository(workspaceRoot: string): Promise<boolean> {
  const probe = await runCommand({
    command: "git",
    commandArgs: ["rev-parse", "--is-inside-work-tree"],
    cwd: workspaceRoot,
    timeoutMs: 8000,
    maxOutputChars: 300,
  });

  return probe.exitCode === 0 && probe.stdout.trim() === "true";
}

export async function getGitChangedFiles(workspaceRoot: string): Promise<string[]> {
  if (!(await isGitRepository(workspaceRoot))) return [];

  const trackedResult = await runCommand({
    command: "git",
    commandArgs: ["diff", "--name-only", "--"],
    cwd: workspaceRoot,
    timeoutMs: 12_000,
    maxOutputChars: 50_000,
  });

  if (trackedResult.exitCode !== 0) return [];

  const untrackedResult = await runCommand({
    command: "git",
    commandArgs: ["ls-files", "--others", "--exclude-standard"],
    cwd: workspaceRoot,
    timeoutMs: 12_000,
    maxOutputChars: 50_000,
  });

  const tracked = trackedResult.stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const untracked = untrackedResult.exitCode === 0
    ? untrackedResult.stdout
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
    : [];

  return unique([...tracked, ...untracked])
    .map((x) => x.trim())
    .filter((x) => Boolean(x) && !x.startsWith(".ai-agents/") && !x.startsWith(".git/"));
}

function selectPackageManager(workspaceRoot: string): "npm" | "pnpm" | "yarn" | "bun" {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  return "npm";
}

async function readPackageScripts(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!(await exists(packageJsonPath))) return {};

  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

function buildScriptCommand(manager: "npm" | "pnpm" | "yarn" | "bun", script: string): { command: string; args: string[] } {
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

const BASE_CHECK_SCRIPT_ORDER = ["check", "test", "lint"] as const;
const UNIT_SCRIPT_CANDIDATES = ["test", "unit", "test:unit", "test:ci"] as const;
const E2E_SCRIPT_CANDIDATES = [
  "e2e",
  "test:e2e",
  "e2e:test",
  "test:e2e:ci",
  "playwright",
  "playwright:test",
  "cypress",
  "cypress:run",
] as const;

export async function detectTestCapabilities(workspaceRoot: string): Promise<TestCapabilities> {
  const scripts = await readPackageScripts(path.resolve(workspaceRoot));
  const unitScripts = UNIT_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name]));
  const e2eScripts = E2E_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name]));

  return {
    hasUnitTestScript: unitScripts.length > 0,
    hasE2EScript: e2eScripts.length > 0,
    unitScripts,
    e2eScripts,
  };
}

export async function runProjectChecks(args: {
  workspaceRoot: string;
  timeoutMsPerCheck?: number;
}): Promise<ValidationCheckResult[]> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const scripts = await readPackageScripts(workspaceRoot);
  const availableBase = BASE_CHECK_SCRIPT_ORDER.filter((name) => Boolean(scripts[name]));
  const availableE2e = E2E_SCRIPT_CANDIDATES.filter((name) => Boolean(scripts[name]));
  const available = unique([...availableBase, ...availableE2e]);

  if (!available.length) {
    return [
      {
        command: "[no package scripts]",
        status: "skipped",
        exitCode: 0,
        timedOut: false,
        durationMs: 0,
        stdoutPreview: "",
        stderrPreview: "No check/test/lint/e2e scripts found in package.json",
      },
    ];
  }

  const manager = selectPackageManager(workspaceRoot);
  const timeoutMs = args.timeoutMsPerCheck ?? 120_000;
  const results: ValidationCheckResult[] = [];

  for (const script of available) {
    const command = buildScriptCommand(manager, script);
    const result = await runCommand({
      command: command.command,
      commandArgs: command.args,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputChars: 14_000,
    });

    results.push({
      command: `${command.command} ${command.args.join(" ")}`,
      status: result.exitCode === 0 && !result.timedOut ? "passed" : "failed",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdoutPreview: result.stdout,
      stderrPreview: result.stderr,
    });
  }

  return results;
}
