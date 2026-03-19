import path from "node:path";
import { appendText } from "../fs.js";
import { logsDir } from "../paths.js";
import { nowIso } from "../utils.js";
import { formatSynxStreamLog } from "../synx-ui.js";
import type { TimingEntry } from "../types.js";
import { normalizeLogLine } from "./daemon-logs.js";

export async function logTaskEvent(taskPath: string, message: string): Promise<void> {
  const source = `TASK:${path.basename(taskPath)}`;
  await appendText(path.join(taskPath, "logs", "events.log"), `${formatSynxStreamLog(normalizeLogLine(message), source, nowIso())}\n`);
}

export async function logTiming(taskPath: string, entry: TimingEntry): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  await appendText(path.join(taskPath, "logs", "timings.jsonl"), line);
  await appendText(path.join(logsDir(), "stage-metrics.jsonl"), line);
}
