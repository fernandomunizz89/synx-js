import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { ensureDir, exists } from "./fs.js";
import { nowIso } from "./utils.js";
import { envBoolean, envNumber } from "./env.js";

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
const DEFAULT_WORKSPACE_SCAN_CACHE_TTL_MS = 3000;

const walkFilesCache = new Map<string, { cachedAtMs: number; files: string[] }>();

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

export interface WorkspaceContextLimits {
  maxScanFiles?: number;
  maxFileSizeBytes?: number;
  maxFileContextChars?: number;
  maxContextFiles?: number;
  maxTotalContextChars?: number;
}

export interface AppliedWorkspaceEdits {
  appliedFiles: string[];
  changedFiles: string[];
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

export interface CypressSelectorUsage {
  selector: string;
  specPaths: string[];
}

export interface CypressSelectorPreflightResult {
  requiredSelectors: CypressSelectorUsage[];
  missingSelectors: CypressSelectorUsage[];
}

export interface TestCapabilities {
  hasUnitTestScript: boolean;
  hasE2EScript: boolean;
  hasE2ESpecFiles: boolean;
  unitScripts: string[];
  e2eScripts: string[];
  e2eSpecFiles: string[];
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

function isWorkspaceScanCacheDisabled(): boolean {
  return envBoolean("AI_AGENTS_DISABLE_WORKSPACE_SCAN_CACHE", false);
}

function resolveWorkspaceScanCacheTtlMs(): number {
  return envNumber("AI_AGENTS_WORKSPACE_SCAN_CACHE_TTL_MS", DEFAULT_WORKSPACE_SCAN_CACHE_TTL_MS, {
    integer: true,
    min: 1,
    max: 120_000,
  });
}

function buildWalkFilesCacheKey(root: string, maxScanFiles: number, maxFileSizeBytes: number): string {
  return `${path.resolve(root)}::scan=${maxScanFiles}::size=${maxFileSizeBytes}`;
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

async function walkFiles(root: string, limits?: WorkspaceContextLimits): Promise<string[]> {
  const maxScanFiles = limits?.maxScanFiles ?? MAX_SCAN_FILES;
  const maxFileSizeBytes = limits?.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const cacheDisabled = isWorkspaceScanCacheDisabled();
  const cacheTtlMs = resolveWorkspaceScanCacheTtlMs();
  const cacheKey = buildWalkFilesCacheKey(root, maxScanFiles, maxFileSizeBytes);

  if (!cacheDisabled) {
    const cached = walkFilesCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAtMs) <= cacheTtlMs) {
      return [...cached.files];
    }
  }

  const out: string[] = [];

  async function walk(current: string): Promise<void> {
    if (out.length >= maxScanFiles) return;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (out.length >= maxScanFiles) break;
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
      if (!stat || stat.size > maxFileSizeBytes) continue;
      out.push(relativePath);
    }
  }

  await walk(root);

  if (!cacheDisabled) {
    if (walkFilesCache.size > 60) walkFilesCache.clear();
    walkFilesCache.set(cacheKey, {
      cachedAtMs: Date.now(),
      files: [...out],
    });
  }

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

function sanitizeForContext(content: string, maxFileContextChars = MAX_FILE_CONTEXT_CHARS): string {
  const withoutNull = content.replace(/\0/g, "");
  if (withoutNull.length <= maxFileContextChars) return withoutNull;
  return `${withoutNull.slice(0, maxFileContextChars)}\n/* ... truncated ... */`;
}

export async function buildWorkspaceContextSnapshot(args: {
  workspaceRoot: string;
  query: string;
  relatedFiles?: string[];
  limits?: WorkspaceContextLimits;
}): Promise<WorkspaceContextSnapshot> {
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const maxContextFiles = args.limits?.maxContextFiles ?? MAX_CONTEXT_FILES;
  const maxTotalContextChars = args.limits?.maxTotalContextChars ?? MAX_TOTAL_CONTEXT_CHARS;
  const maxFileContextChars = args.limits?.maxFileContextChars ?? MAX_FILE_CONTEXT_CHARS;
  const keywords = extractKeywords(args.query);
  const related = new Set((args.relatedFiles || []).map((x) => normalizeInputPath(x)).filter(Boolean));

  const candidates = await walkFiles(workspaceRoot, args.limits);
  const sorted = sortByScore(candidates, keywords, related);

  const files: WorkspaceFileContext[] = [];
  let totalChars = 0;

  for (const relativePath of sorted) {
    if (files.length >= maxContextFiles) break;
    if (totalChars >= maxTotalContextChars) break;

    const absolutePath = path.join(workspaceRoot, relativePath);
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw.trim()) continue;

    const sanitized = sanitizeForContext(raw, maxFileContextChars);
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
  const changedFiles: string[] = [];
  const skippedEdits: string[] = [];
  const warnings: string[] = [];

  for (const edit of args.edits) {
    try {
      const { absolutePath, relativePath } = resolveWorkspacePath(args.workspaceRoot, edit.path);

      if (edit.action === "delete") {
        if (await exists(absolutePath)) {
          await fs.unlink(absolutePath);
          appliedFiles.push(relativePath);
          changedFiles.push(relativePath);
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
        if (next === current) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: replacement produced no changes)`);
          continue;
        }
        await fs.writeFile(absolutePath, next, "utf8");
        appliedFiles.push(relativePath);
        changedFiles.push(relativePath);
        continue;
      }

      if (typeof edit.content !== "string") {
        skippedEdits.push(`${relativePath} (${edit.action} skipped: missing content)`);
        continue;
      }

      const existed = await exists(absolutePath);
      if (existed) {
        const current = await fs.readFile(absolutePath, "utf8").catch(() => null);
        if (typeof current === "string" && current === edit.content) {
          skippedEdits.push(`${relativePath} (${edit.action} skipped: content unchanged)`);
          continue;
        }
      }

      await ensureDir(path.dirname(absolutePath));
      await fs.writeFile(absolutePath, edit.content, "utf8");
      appliedFiles.push(relativePath);
      changedFiles.push(relativePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Edit skipped for "${edit.path}": ${message}`);
    }
  }

  return {
    appliedFiles: unique(appliedFiles),
    changedFiles: unique(changedFiles),
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
      const appended = value + chunk.toString("utf8");
      if (appended.length <= maxOutputChars) return appended;
      // Keep the tail so we preserve final assertion/failure lines.
      return appended.slice(appended.length - maxOutputChars);
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

function buildScriptCommand(
  manager: "npm" | "pnpm" | "yarn" | "bun",
  script: string,
  extraArgs: string[] = [],
): { command: string; args: string[] } {
  const withExtra = (base: string[]): string[] => {
    if (!extraArgs.length) return base;
    return [...base, "--", ...extraArgs];
  };

  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: withExtra(["run", "--if-present", script]) };
    case "yarn":
      return { command: "yarn", args: withExtra(["run", script]) };
    case "bun":
      return { command: "bun", args: withExtra(["run", script]) };
    case "npm":
    default:
      return { command: "npm", args: withExtra(["run", "--if-present", script]) };
  }
}

const BASE_CHECK_SCRIPT_ORDER = ["check", "test", "lint", "build"] as const;
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

const E2E_SPEC_FILE_PATTERN = /\.(?:cy|spec)\.[cm]?[jt]sx?$/i;
const E2E_SPEC_DIR_CANDIDATES = ["e2e", "cypress/e2e"] as const;

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

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseCypressJunitDiagnostics(xml: string, maxItems = 6): string[] {
  const out: string[] = [];
  const testcaseRegex = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi;
  let match: RegExpExecArray | null;

  while ((match = testcaseRegex.exec(xml)) && out.length < maxItems) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (!/<failure\b/i.test(body)) continue;

    const nameMatch = /name="([^"]*)"/i.exec(attrs);
    const testcaseName = decodeXmlEntities(nameMatch?.[1] || "unknown testcase");

    const failureTagMatch = /<failure\b([^>]*)>/i.exec(body);
    const failureAttrs = failureTagMatch?.[1] || "";
    const messageAttr = decodeXmlEntities((/message="([^"]*)"/i.exec(failureAttrs)?.[1] || "").trim());

    const failureBodyMatch = /<failure\b[^>]*>([\s\S]*?)<\/failure>/i.exec(body);
    const failureBody = decodeXmlEntities((failureBodyMatch?.[1] || "").replace(/<[^>]+>/g, " "));

    const headline = normalizeSignalLine(messageAttr || failureBody || `Failure in ${testcaseName}`);
    const locationMatch = /([A-Za-z0-9_./-]+\.(?:cy|spec)\.[cm]?[jt]sx?:\d+:\d+)/.exec(failureBody);

    if (headline) out.push(`Test "${testcaseName}": ${headline}`);
    if (locationMatch?.[1]) out.push(`Location: ${locationMatch[1]}`);
  }

  return unique(out).slice(0, maxItems);
}

function safeToken(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return token.slice(0, 48) || "check";
}

function isCypressScript(script: string, scripts: Record<string, string>): boolean {
  const scriptName = script.toLowerCase();
  const body = (scripts[script] || "").toLowerCase();
  return scriptName.includes("cypress") || /\bcypress\b/.test(body);
}

function hasChangedFile(changedFiles: string[], pattern: RegExp): boolean {
  return changedFiles.some((file) => pattern.test(file.toLowerCase()));
}

function buildTypeScriptFallbackCommand(manager: "npm" | "pnpm" | "yarn" | "bun"): FallbackValidationCommand {
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
  manager: "npm" | "pnpm" | "yarn" | "bun";
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

async function buildCypressQaOverrides(workspaceRoot: string, script: string): Promise<{
  extraArgs: string[];
  reportPath: string;
  qaConfigNotes: string[];
}> {
  const outDir = path.join(workspaceRoot, ".ai-agents", "runtime", "qa-cypress");
  await ensureDir(outDir);
  const reportPath = path.join(outDir, `${safeToken(script)}-${Date.now()}.xml`);

  return {
    extraArgs: [
      "--reporter",
      "junit",
      "--reporter-options",
      `mochaFile=${reportPath},toConsole=true`,
      "--config",
      "video=false,screenshotOnRunFailure=false,trashAssetsBeforeRuns=false,defaultCommandTimeout=6000",
    ],
    reportPath,
    qaConfigNotes: [
      "QA Cypress override: reporter=junit (console + XML output).",
      "QA Cypress override: screenshotOnRunFailure=false, video=false, and defaultCommandTimeout=6000 for lower-noise diagnostics.",
    ],
  };
}

async function buildCheckDiagnostics(args: {
  workspaceRoot: string;
  isCypress: boolean;
  stdout: string;
  stderr: string;
  cypressReportPath?: string;
}): Promise<{ diagnostics: string[]; artifacts: string[] }> {
  const combined = `${args.stdout}\n${args.stderr}`;
  const genericPatterns = [
    /\b(assertionerror|typeerror|referenceerror|syntaxerror|failed|error)\b/i,
    /\bts\d{4}\b/i,
    /\bexpected\b.+\bto\b/i,
    /\btimed out\b/i,
    /\bdoes not provide an export named\b/i,
    /[A-Za-z0-9_./-]+\.[cm]?[jt]sx?:\d+:\d+/,
  ];
  const cypressPatterns = [
    /\bcypresserror\b/i,
    /\bassertionerror\b/i,
    /\btimed out retrying\b/i,
    /\bfailing\b/i,
    /\bconfigfile is invalid\b/i,
    /\byour configfile is invalid\b/i,
    /\bsupportfile\b/i,
    /\bproject does not contain a default supportfile\b/i,
    /\bcypress\/support\/e2e\.[jt]sx?\b/i,
    /\bts\d{4}\b/i,
    /\bexports is not defined in es module scope\b/i,
    /\breferenceerror:\s*exports is not defined\b/i,
    /\bdoes not provide an export named\b/i,
    /\bcypress\.config\.[cm]?[jt]s\b/i,
    /\bno spec files were found\b/i,
    /\bcan'?t run because no spec files were found\b/i,
    /[A-Za-z0-9_./-]+\.(?:cy|spec)\.[cm]?[jt]sx?:\d+:\d+/,
  ];

  const lineDiagnostics = extractSignalLines(combined, args.isCypress ? cypressPatterns : genericPatterns, args.isCypress ? 10 : 5);
  const artifacts: string[] = [];
  let reportDiagnostics: string[] = [];
  let reportArtifact = "";

  if (args.isCypress && args.cypressReportPath) {
    reportArtifact = normalizeInputPath(path.relative(args.workspaceRoot, args.cypressReportPath));
    if (await exists(args.cypressReportPath)) {
      const xml = await fs.readFile(args.cypressReportPath, "utf8").catch(() => "");
      reportDiagnostics = xml ? parseCypressJunitDiagnostics(xml, 8) : [];
      artifacts.push(reportArtifact);
    } else {
      artifacts.push(`${reportArtifact} (not generated)`);
    }
  }

  const combinedDiagnostics = unique([...reportDiagnostics, ...lineDiagnostics]).slice(0, 10);
  if (args.isCypress && combinedDiagnostics.length === 0) {
    if (/project does not contain a default supportfile|supportfile to exist|support-file-missing-or-invalid|supportfile is not necessary/i.test(combined)) {
      return {
        diagnostics: ["Cypress supportFile is missing or invalid; create cypress/support/e2e.ts or set supportFile=false in cypress config."],
        artifacts: artifacts.length ? artifacts : reportArtifact ? [`${reportArtifact} (not generated)`] : [],
      };
    }
    if (/configfile is invalid|your configfile is invalid|cypress\.config\.[cm]?[jt]s|exports is not defined in es module scope|referenceerror:\s*exports is not defined/i.test(combined)) {
      return {
        diagnostics: ["Cypress config is invalid at runtime (config file could not be loaded)."],
        artifacts: artifacts.length ? artifacts : reportArtifact ? [`${reportArtifact} (not generated)`] : [],
      };
    }
    if (/no spec files were found|can'?t run because no spec files were found/i.test(combined)) {
      return {
        diagnostics: [
          "Cypress did not find E2E spec files; add specs under cypress/e2e/** or e2e/** and ensure Cypress specPattern includes them.",
        ],
        artifacts: artifacts.length ? artifacts : reportArtifact ? [`${reportArtifact} (not generated)`] : [],
      };
    }
    const fallback = "No actionable Cypress assertion text was captured; adjust Cypress output/reporter config for terminal-readable failure details.";
    return {
      diagnostics: [fallback],
      artifacts: artifacts.length ? artifacts : reportArtifact ? [`${reportArtifact} (not generated)`] : [],
    };
  }

  return {
    diagnostics: combinedDiagnostics,
    artifacts,
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
    const cypressScript = isCypressScript(script, scripts);
    let cypressReportPath: string | undefined;
    let qaConfigNotes: string[] = [];
    let command = buildScriptCommand(manager, script);
    if (cypressScript) {
      const overrides = await buildCypressQaOverrides(workspaceRoot, script);
      cypressReportPath = overrides.reportPath;
      qaConfigNotes = overrides.qaConfigNotes;
      command = buildScriptCommand(manager, script, overrides.extraArgs);
    }

    const result = await runCommand({
      command: command.command,
      commandArgs: command.args,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputChars: cypressScript ? 12_000 : 5_000,
    });
    const diagnostics = await buildCheckDiagnostics({
      workspaceRoot,
      isCypress: cypressScript,
      stdout: result.stdout,
      stderr: result.stderr,
      cypressReportPath,
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
      qaConfigNotes,
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
        workspaceRoot,
        isCypress: false,
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

function normalizeSpecPath(workspaceRoot: string, absolutePath: string): string {
  return normalizeInputPath(path.relative(workspaceRoot, absolutePath));
}

function collectSelectorsFromSpec(content: string): string[] {
  const selectors: string[] = [];
  const selectorPattern = /\[data-cy=["']([^"']+)["']\]/g;
  let match: RegExpExecArray | null;
  while ((match = selectorPattern.exec(content))) {
    const selector = (match[1] || "").trim();
    if (selector) selectors.push(selector);
  }
  return unique(selectors);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNativeDataCySelector(content: string, selector: string): boolean {
  const escapedSelector = escapeRegExp(selector);
  const nativeTagPattern = new RegExp(
    `<\\s*[a-z][a-z0-9:-]*\\b[^>]*\\bdata-cy\\s*=\\s*["']${escapedSelector}["'][^>]*>`,
    "i",
  );
  return nativeTagPattern.test(content);
}

export async function runCypressSelectorPreflight(workspaceRoot: string): Promise<CypressSelectorPreflightResult> {
  const root = path.resolve(workspaceRoot);
  const allFiles = await walkFiles(root, {
    maxScanFiles: 2_000,
    maxFileSizeBytes: 400_000,
  });
  const specFiles = allFiles.filter((filePath) => /(^|\/)e2e\/.*\.cy\.[cm]?[jt]sx?$/.test(filePath));
  const scaffoldSpecPattern = /(^|\/)(example|sample)\.cy\.[cm]?[jt]sx?$/i;
  const nonScaffoldSpecFiles = specFiles.filter((filePath) => !scaffoldSpecPattern.test(filePath));
  const effectiveSpecFiles = nonScaffoldSpecFiles.length ? nonScaffoldSpecFiles : specFiles;
  const sourceFiles = allFiles.filter((filePath) => /^src\/.*\.[cm]?[jt]sx?$/.test(filePath));

  const selectorToSpecs = new Map<string, Set<string>>();
  for (const relativePath of effectiveSpecFiles) {
    const absolutePath = path.join(root, relativePath);
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw) continue;
    const selectors = collectSelectorsFromSpec(raw);
    for (const selector of selectors) {
      if (!selectorToSpecs.has(selector)) selectorToSpecs.set(selector, new Set<string>());
      selectorToSpecs.get(selector)?.add(normalizeSpecPath(root, absolutePath));
    }
  }

  const sourceContent = await Promise.all(
    sourceFiles.map(async (relativePath) => {
      const absolutePath = path.join(root, relativePath);
      const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
      return { relativePath, raw };
    }),
  );

  const requiredSelectors: CypressSelectorUsage[] = [];
  const missingSelectors: CypressSelectorUsage[] = [];
  for (const [selector, specSet] of selectorToSpecs.entries()) {
    const usage: CypressSelectorUsage = {
      selector,
      specPaths: Array.from(specSet).sort(),
    };
    requiredSelectors.push(usage);

    const existsInSource = sourceContent.some((entry) => hasNativeDataCySelector(entry.raw, selector));
    if (!existsInSource) {
      missingSelectors.push(usage);
    }
  }

  requiredSelectors.sort((a, b) => a.selector.localeCompare(b.selector));
  missingSelectors.sort((a, b) => a.selector.localeCompare(b.selector));
  return {
    requiredSelectors,
    missingSelectors,
  };
}
