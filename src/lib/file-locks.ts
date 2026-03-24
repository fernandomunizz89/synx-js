/**
 * Phase 1.4 — File Conflict Detection
 *
 * Maintains a per-file lock map at .ai-agents/runtime/file-locks.json
 * to detect when two parallel tasks attempt to write the same file.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, readJson } from "./fs.js";
import { runtimeDir } from "./paths.js";
import { nowIso } from "./utils.js";

const SCOPE_PREFIX = "scope:";

export interface FileLockMap {
  version: 1;
  /** lock target (relative file path or scope:relative/dir) → taskId */
  locks: Record<string, string>;
  /** taskId → list of locked targets */
  byTask: Record<string, string[]>;
  updatedAt: string;
}

export interface FileConflict {
  file: string;
  heldBy: string;
  lockTarget?: string;
  kind?: "file" | "scope";
}

export interface AcquireFileLocksResult {
  acquired: string[];
  conflicts: FileConflict[];
}

export interface AcquireFileLocksOptions {
  allOrNothing?: boolean;
  includeParentScopes?: boolean;
  targetScopes?: string[];
}

function normalizeRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  return normalized || undefined;
}

function normalizeScope(scope: unknown): string | undefined {
  const normalized = normalizeRelativePath(scope);
  if (!normalized || normalized === ".") return undefined;
  return normalized;
}

function toScopeTarget(scope: string): string {
  return `${SCOPE_PREFIX}${scope}`;
}

function parseTarget(target: string): { kind: "file" | "scope"; value: string } {
  if (target.startsWith(SCOPE_PREFIX)) {
    return { kind: "scope", value: target.slice(SCOPE_PREFIX.length) };
  }
  return { kind: "file", value: target };
}

function dirnameScope(file: string): string | undefined {
  const normalized = normalizeRelativePath(file);
  if (!normalized) return undefined;
  const dir = path.posix.dirname(normalized);
  if (!dir || dir === ".") return undefined;
  return normalizeScope(dir);
}

function buildRequestedTargets(
  files: string[],
  options?: AcquireFileLocksOptions,
): string[] {
  const normalizedFiles = files
    .map((file) => normalizeRelativePath(file))
    .filter((file): file is string => Boolean(file));
  const scopeSet = new Set<string>();

  const explicitScopes = (options?.targetScopes || [])
    .map((scope) => normalizeScope(scope))
    .filter((scope): scope is string => Boolean(scope));
  for (const scope of explicitScopes) scopeSet.add(scope);

  if (options?.includeParentScopes) {
    for (const file of normalizedFiles) {
      const parentScope = dirnameScope(file);
      if (parentScope) scopeSet.add(parentScope);
    }
  }

  return Array.from(new Set([
    ...normalizedFiles,
    ...Array.from(scopeSet).map((scope) => toScopeTarget(scope)),
  ]));
}

function overlapsFileWithScope(file: string, scope: string): boolean {
  return file === scope || file.startsWith(`${scope}/`);
}

function overlapsScopeWithScope(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function lockTargetsOverlap(a: string, b: string): boolean {
  const left = parseTarget(a);
  const right = parseTarget(b);
  if (left.kind === "file" && right.kind === "file") {
    return left.value === right.value;
  }
  if (left.kind === "file" && right.kind === "scope") {
    return overlapsFileWithScope(left.value, right.value);
  }
  if (left.kind === "scope" && right.kind === "file") {
    return overlapsFileWithScope(right.value, left.value);
  }
  return overlapsScopeWithScope(left.value, right.value);
}

function uniqueConflicts(conflicts: FileConflict[]): FileConflict[] {
  const seen = new Set<string>();
  const deduped: FileConflict[] = [];
  for (const conflict of conflicts) {
    const key = `${conflict.file}::${conflict.heldBy}::${conflict.lockTarget || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(conflict);
  }
  return deduped;
}

function fileLockPath(): string {
  return path.join(runtimeDir(), "file-locks.json");
}

async function loadFileLockMap(): Promise<FileLockMap> {
  const p = fileLockPath();
  if (!(await exists(p))) {
    return { version: 1, locks: {}, byTask: {}, updatedAt: nowIso() };
  }
  try {
    return await readJson<FileLockMap>(p);
  } catch {
    return { version: 1, locks: {}, byTask: {}, updatedAt: nowIso() };
  }
}

async function saveFileLockMap(map: FileLockMap): Promise<void> {
  const p = fileLockPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ ...map, updatedAt: nowIso() }, null, 2), "utf8");
}

/**
 * Try to acquire locks for a set of files on behalf of taskId.
 * Files already locked by the SAME taskId are re-acquired (idempotent).
 * Files locked by a DIFFERENT taskId are conflicts.
 */
export async function acquireFileLocks(
  taskId: string,
  files: string[],
  options?: AcquireFileLocksOptions,
): Promise<AcquireFileLocksResult> {
  const requestedTargets = buildRequestedTargets(files, options);
  if (requestedTargets.length === 0) return { acquired: [], conflicts: [] };

  const map = await loadFileLockMap();
  const acquired: string[] = [];
  const conflicts: FileConflict[] = [];

  for (const requestedTarget of requestedTargets) {
    const requested = parseTarget(requestedTarget);
    const requestedConflicts: FileConflict[] = [];

    for (const [existingTarget, existingOwnerTaskId] of Object.entries(map.locks)) {
      if (existingOwnerTaskId === taskId) continue;
      if (!lockTargetsOverlap(requestedTarget, existingTarget)) continue;
      const existing = parseTarget(existingTarget);
      requestedConflicts.push({
        file: requested.value,
        heldBy: existingOwnerTaskId,
        lockTarget: existingTarget,
        kind: existing.kind,
      });
    }

    if (requestedConflicts.length > 0) {
      conflicts.push(...requestedConflicts);
      continue;
    }

    acquired.push(requestedTarget);
  }

  const dedupedConflicts = uniqueConflicts(conflicts);
  if (options?.allOrNothing && dedupedConflicts.length > 0) {
    return {
      acquired: [],
      conflicts: dedupedConflicts,
    };
  }

  if (acquired.length > 0) {
    for (const target of acquired) {
      map.locks[target] = taskId;
    }
    map.byTask[taskId] = Array.from(new Set([...(map.byTask[taskId] ?? []), ...acquired]));
    await saveFileLockMap(map);
  }

  return { acquired, conflicts: dedupedConflicts };
}

/**
 * Reserve file/scope locks before dispatching an LLM-backed worker stage.
 * Uses all-or-nothing semantics to avoid partial reservations.
 */
export async function reserveDispatchLocks(
  taskId: string,
  ownershipBoundaries: string[],
): Promise<AcquireFileLocksResult> {
  return acquireFileLocks(taskId, [], {
    allOrNothing: true,
    targetScopes: ownershipBoundaries,
  });
}

/**
 * Release all file locks held by taskId.
 */
export async function releaseFileLocks(taskId: string): Promise<string[]> {
  const map = await loadFileLockMap();
  const ownedFiles = map.byTask[taskId] ?? [];
  if (ownedFiles.length === 0) return [];

  for (const file of ownedFiles) {
    if (map.locks[file] === taskId) {
      delete map.locks[file];
    }
  }
  delete map.byTask[taskId];

  await saveFileLockMap(map);
  return ownedFiles;
}

/**
 * Check which files are currently locked by other tasks (read-only, no mutation).
 */
export async function getFileConflicts(
  taskId: string,
  files: string[],
  options?: AcquireFileLocksOptions,
): Promise<FileConflict[]> {
  const requestedTargets = buildRequestedTargets(files, options);
  if (requestedTargets.length === 0) return [];

  const map = await loadFileLockMap();
  const conflicts: FileConflict[] = [];
  for (const requestedTarget of requestedTargets) {
    const requested = parseTarget(requestedTarget);
    for (const [existingTarget, existingOwnerTaskId] of Object.entries(map.locks)) {
      if (existingOwnerTaskId === taskId) continue;
      if (!lockTargetsOverlap(requestedTarget, existingTarget)) continue;
      const existing = parseTarget(existingTarget);
      conflicts.push({
        file: requested.value,
        heldBy: existingOwnerTaskId,
        lockTarget: existingTarget,
        kind: existing.kind,
      });
    }
  }
  return uniqueConflicts(conflicts);
}

/**
 * Return all current file locks (for diagnostics).
 */
export async function listFileLocks(): Promise<FileLockMap> {
  return loadFileLockMap();
}
