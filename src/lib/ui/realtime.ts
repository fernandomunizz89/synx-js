import path from "node:path";
import { exists, readText } from "../fs.js";
import { logsDir } from "../paths.js";
import { nowIso } from "../utils.js";

export interface UiStreamEvent {
  id: number;
  at: string;
  type: "runtime.updated" | "task.updated" | "task.review_required" | "task.decision_recorded" | "metrics.updated";
  taskId?: string;
  stage?: string;
  payload?: Record<string, unknown>;
}

function mapRuntimeEventType(event: string): UiStreamEvent["type"] {
  if (event === "task.review_required") return "task.review_required";
  if (event === "task.approved" || event === "task.reproved" || event === "task.decision_recorded") return "task.decision_recorded";
  if (event.startsWith("task.")) return "task.updated";
  if (event.startsWith("engine.")) return "runtime.updated";
  return "runtime.updated";
}

async function parseJsonl(filePath: string): Promise<Array<Record<string, unknown>>> {
  if (!(await exists(filePath))) return [];
  try {
    const raw = await readText(filePath);
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object") rows.push(parsed as Record<string, unknown>);
      } catch {
        // ignore malformed line
      }
    }
    return rows;
  } catch {
    return [];
  }
}

export function createUiRealtime(args?: { pollMs?: number }) {
  const listeners = new Set<(event: UiStreamEvent) => void>();
  const pollMs = Math.max(500, Number(args?.pollMs || 1200));
  const runtimeEventsPath = path.join(logsDir(), "runtime-events.jsonl");
  const stageMetricsPath = path.join(logsDir(), "stage-metrics.jsonl");
  const daemonLogPath = path.join(logsDir(), "daemon.log");
  let disposed = false;
  let seq = 0;
  let runtimeCursor = 0;
  let lastStageMetricsLineCount = 0;
  let lastDaemonLogLineCount = 0;
  let timer: NodeJS.Timeout | null = null;

  const emit = (event: Omit<UiStreamEvent, "id" | "at"> & { at?: string }) => {
    const payload: UiStreamEvent = {
      id: ++seq,
      at: event.at || nowIso(),
      type: event.type,
      taskId: event.taskId,
      stage: event.stage,
      payload: event.payload || {},
    };
    for (const listener of listeners) {
      listener(payload);
    }
  };

  const poll = async () => {
    if (disposed) return;

    const runtimeRows = await parseJsonl(runtimeEventsPath);
    if (runtimeRows.length > runtimeCursor) {
      for (let i = runtimeCursor; i < runtimeRows.length; i++) {
        const row = runtimeRows[i];
        const rawEvent = typeof row.event === "string" ? row.event : "runtime.updated";
        emit({
          type: mapRuntimeEventType(rawEvent),
          at: typeof row.at === "string" ? row.at : nowIso(),
          taskId: typeof row.taskId === "string" ? row.taskId : undefined,
          stage: typeof row.stage === "string" ? row.stage : undefined,
          payload: {
            rawEvent,
            source: typeof row.source === "string" ? row.source : "",
            payload: row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {},
          },
        });
      }
      runtimeCursor = runtimeRows.length;
    }

    const stageRows = await parseJsonl(stageMetricsPath);
    if (stageRows.length !== lastStageMetricsLineCount) {
      emit({
        type: "metrics.updated",
        payload: {
          previousCount: lastStageMetricsLineCount,
          currentCount: stageRows.length,
        },
      });
      lastStageMetricsLineCount = stageRows.length;
    }

    let daemonLineCount = 0;
    if (await exists(daemonLogPath)) {
      try {
        const daemonRaw = await readText(daemonLogPath);
        daemonLineCount = daemonRaw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
      } catch {
        daemonLineCount = 0;
      }
    }
    if (daemonLineCount !== lastDaemonLogLineCount) {
      if (lastDaemonLogLineCount > 0) {
        emit({
          type: "runtime.updated",
          payload: {
            source: "daemon-log",
            previousCount: lastDaemonLogLineCount,
            currentCount: daemonLineCount,
          },
        });
      }
      lastDaemonLogLineCount = daemonLineCount;
    }
  };

  timer = setInterval(() => {
    void poll();
  }, pollMs);
  timer.unref();
  void poll();

  return {
    subscribe(listener: (event: UiStreamEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      disposed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      listeners.clear();
    },
  };
}
