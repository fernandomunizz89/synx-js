import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, listDirectories, listFiles, readJson } from "./fs.js";
import { logsDir, tasksDir } from "./paths.js";
import type { TaskMeta } from "./types.js";
import {
  toMs,
  inWindow,
  type AgentAuditEntry,
  type JsonlLoadResult,
  type MetricsWindow,
} from "./metrics-helpers.js";

export async function loadJsonlByPath<T>(
  filePath: string,
  timeWindow: MetricsWindow,
  getTime: (row: T) => number | null
): Promise<JsonlLoadResult<T>> {
  if (!(await exists(filePath))) {
    return {
      rows: [],
      lineCount: 0,
      byteCount: 0,
    };
  }

  const raw = await fs.readFile(filePath, "utf8");
  let lineCount = 0;
  let byteCount = 0;
  const rows: T[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: T;
    try {
      parsed = JSON.parse(line) as T;
    } catch {
      continue;
    }
    const atMs = getTime(parsed);
    if (!inWindow(atMs, timeWindow)) continue;
    lineCount += 1;
    byteCount += Buffer.byteLength(line, "utf8");
    rows.push(parsed);
  }

  return {
    rows,
    lineCount,
    byteCount,
  };
}

export async function loadAgentAudit(timeWindow: MetricsWindow): Promise<JsonlLoadResult<AgentAuditEntry>> {
  const dir = path.join(logsDir(), "agent-audit");
  if (!(await exists(dir))) {
    return { rows: [], lineCount: 0, byteCount: 0 };
  }

  const files = await listFiles(dir);
  const entries: AgentAuditEntry[] = [];
  let lineCount = 0;
  let byteCount = 0;

  for (const file of files) {
    const loaded = await loadJsonlByPath<AgentAuditEntry>(
      path.join(dir, file),
      timeWindow,
      (row) => toMs(row.at)
    );
    entries.push(...loaded.rows);
    lineCount += loaded.lineCount;
    byteCount += loaded.byteCount;
  }

  return {
    rows: entries,
    lineCount,
    byteCount,
  };
}

export async function loadTaskMetaMap(): Promise<Map<string, TaskMeta>> {
  const map = new Map<string, TaskMeta>();
  const root = tasksDir();
  if (!(await exists(root))) return map;

  const ids = await listDirectories(root);
  for (const taskId of ids) {
    const metaPath = path.join(root, taskId, "meta.json");
    if (!(await exists(metaPath))) continue;
    try {
      const meta = await readJson<TaskMeta>(metaPath);
      map.set(taskId, meta);
    } catch {
      continue;
    }
  }
  return map;
}
