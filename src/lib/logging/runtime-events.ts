import path from "node:path";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import { nowIso } from "../utils.js";

export interface RuntimeEventEntry {
  at: string;
  event: string;
  taskId?: string;
  stage?: string;
  agent?: string;
  source?: string;
  payload?: Record<string, unknown>;
}

export async function logRuntimeEvent(entry: {
  event: string;
  taskId?: string;
  stage?: string;
  agent?: string;
  source?: string;
  payload?: Record<string, unknown>;
  at?: string;
}): Promise<void> {
  const payload: RuntimeEventEntry = {
    at: entry.at || nowIso(),
    event: entry.event,
    taskId: entry.taskId,
    stage: entry.stage,
    agent: entry.agent,
    source: entry.source,
    payload: entry.payload || {},
  };
  await appendText(path.join(logsDir(), "runtime-events.jsonl"), `${JSON.stringify(payload)}\n`);
}
