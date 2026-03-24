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

export interface FileLockMap {
  version: 1;
  /** filePath (relative to workspace root) → taskId */
  locks: Record<string, string>;
  /** taskId → list of locked filePaths */
  byTask: Record<string, string[]>;
  updatedAt: string;
}

export interface FileConflict {
  file: string;
  heldBy: string;
}

export interface AcquireFileLocksResult {
  acquired: string[];
  conflicts: FileConflict[];
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
): Promise<AcquireFileLocksResult> {
  if (files.length === 0) return { acquired: [], conflicts: [] };

  const map = await loadFileLockMap();
  const acquired: string[] = [];
  const conflicts: FileConflict[] = [];

  for (const file of files) {
    const existing = map.locks[file];
    if (!existing || existing === taskId) {
      map.locks[file] = taskId;
      acquired.push(file);
    } else {
      conflicts.push({ file, heldBy: existing });
    }
  }

  // Update byTask index
  map.byTask[taskId] = Array.from(new Set([...(map.byTask[taskId] ?? []), ...acquired]));

  if (acquired.length > 0) {
    await saveFileLockMap(map);
  }

  return { acquired, conflicts };
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
): Promise<FileConflict[]> {
  if (files.length === 0) return [];
  const map = await loadFileLockMap();
  return files
    .filter((f) => map.locks[f] && map.locks[f] !== taskId)
    .map((f) => ({ file: f, heldBy: map.locks[f] }));
}

/**
 * Return all current file locks (for diagnostics).
 */
export async function listFileLocks(): Promise<FileLockMap> {
  return loadFileLockMap();
}
