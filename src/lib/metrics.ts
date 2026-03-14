import path from "node:path";
import { promises as fs } from "node:fs";
import { exists } from "./fs.js";
import { logsDir } from "./paths.js";
import type { TimingEntry } from "./types.js";

export interface MetricsSummaryRow {
  stage: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export async function loadTimingEntries(): Promise<TimingEntry[]> {
  const filePath = path.join(logsDir(), "stage-metrics.jsonl");
  if (!(await exists(filePath))) return [];
  const raw = await fs.readFile(filePath, "utf8");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as TimingEntry);
}

export async function summarizeMetrics(): Promise<MetricsSummaryRow[]> {
  const entries = await loadTimingEntries();
  const map = new Map<string, MetricsSummaryRow>();

  for (const entry of entries) {
    const current = map.get(entry.stage) ?? {
      stage: entry.stage,
      count: 0,
      totalMs: 0,
      avgMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
    };
    current.count += 1;
    current.totalMs += entry.durationMs;
    current.minMs = Math.min(current.minMs, entry.durationMs);
    current.maxMs = Math.max(current.maxMs, entry.durationMs);
    current.avgMs = Math.round(current.totalMs / current.count);
    map.set(entry.stage, current);
  }

  return [...map.values()].sort((a, b) => b.avgMs - a.avgMs);
}
