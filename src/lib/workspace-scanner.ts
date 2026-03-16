import path from "node:path";
import { promises as fs } from "node:fs";
import { nowIso } from "./utils.js";
import { envBoolean, envNumber } from "./env.js";

export const IGNORED_DIRS = new Set([
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

export const STOPWORDS = new Set([
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

export const walkFilesCache = new Map<string, { cachedAtMs: number; files: string[] }>();

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

export function normalizeInputPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isBlockedPath(relativePath: string): boolean {
  const normalized = normalizeInputPath(relativePath);
  return normalized === ".ai-agents" || normalized.startsWith(".ai-agents/") || normalized === ".git" || normalized.startsWith(".git/");
}

function shouldReadFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (ALWAYS_ALLOWED_FILE_NAMES.has(base)) return true;
  const ext = path.extname(base).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

export function extractKeywords(text: string): string[] {
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

export function scoreText(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += 1;
  }
  return score;
}

export async function walkFiles(root: string, limits?: WorkspaceContextLimits): Promise<string[]> {
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

export function extensionPriority(filePath: string): number {
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

export function sortByScore(paths: string[], keywords: string[], related: Set<string>): string[] {
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

export function sanitizeForContext(content: string, maxFileContextChars = MAX_FILE_CONTEXT_CHARS): string {
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
