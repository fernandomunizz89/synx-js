import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, exists, listFiles, readJson, statSafe } from "../fs.js";
import { locksDir } from "../paths.js";
import { STALE_LOCK_MINUTES } from "../constants.js";

export interface LockStatePayload {
  pid?: number;
  createdAt?: string;
}

export interface StaleLockResult {
  file: string;
  reason: string;
  ageMinutes: number;
  pid?: number;
}

export function processIsRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "EPERM") {
      return true;
    }
    return false;
  }
}

function getAgeMinutes(createdAtMs: number, fallbackMs: number): number {
  const sourceMs = Number.isFinite(createdAtMs) ? createdAtMs : fallbackMs;
  return (Date.now() - sourceMs) / 60000;
}

async function collectStaleLocks(): Promise<Array<{ filePath: string; result: StaleLockResult }>> {
  const dir = locksDir();
  if (!(await exists(dir))) return [];

  const files = await listFiles(dir);
  const stale: Array<{ filePath: string; result: StaleLockResult }> = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = await statSafe(fullPath);
    if (!stat) continue;

    let payload: LockStatePayload | null = null;
    try {
      payload = await readJson<LockStatePayload>(fullPath);
    } catch {
      payload = null;
    }

    const createdAtMs = payload?.createdAt ? new Date(payload.createdAt).getTime() : Number.NaN;
    const ageMinutes = getAgeMinutes(createdAtMs, stat.mtimeMs);
    const pid = payload?.pid;

    const reasons: string[] = [];
    if (ageMinutes >= STALE_LOCK_MINUTES) reasons.push(`older than ${STALE_LOCK_MINUTES} minutes`);
    if (typeof pid === "number" && !processIsRunning(pid)) reasons.push(`PID ${pid} is not running`);

    if (reasons.length) {
      stale.push({
        filePath: fullPath,
        result: {
          file,
          reason: reasons.join("; "),
          ageMinutes: Number(ageMinutes.toFixed(1)),
          pid,
        },
      });
    }
  }

  return stale;
}

export async function acquireLock(lockName: string): Promise<boolean> {
  const filePath = path.join(locksDir(), lockName);
  await ensureDir(path.dirname(filePath));
  try {
    await fs.writeFile(filePath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(lockName: string): Promise<void> {
  const filePath = path.join(locksDir(), lockName);
  if (await exists(filePath)) await fs.unlink(filePath);
}

export async function detectStaleLocks(): Promise<StaleLockResult[]> {
  const stale = await collectStaleLocks();
  return stale.map((item) => item.result);
}

export async function clearStaleLocks(): Promise<StaleLockResult[]> {
  const stale = await collectStaleLocks();
  const cleared: StaleLockResult[] = [];

  for (const entry of stale) {
    await fs.unlink(entry.filePath).catch(() => undefined);
    cleared.push(entry.result);
  }

  return cleared;
}
