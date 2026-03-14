import path from "node:path";
import { appendText, writeJson } from "./fs.js";
import { logsDir } from "./paths.js";
import type { TimingEntry } from "./types.js";
import { nowIso } from "./utils.js";

export async function logDaemon(message: string): Promise<void> {
  await appendText(path.join(logsDir(), "daemon.log"), `[${nowIso()}] ${message}\n`);
}

export async function logTaskEvent(taskPath: string, message: string): Promise<void> {
  await appendText(path.join(taskPath, "logs", "events.log"), `[${nowIso()}] ${message}\n`);
}

export async function logTiming(taskPath: string, entry: TimingEntry): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  await appendText(path.join(taskPath, "logs", "timings.jsonl"), line);
  await appendText(path.join(logsDir(), "stage-metrics.jsonl"), line);
}

export async function writeDaemonState(state: unknown): Promise<void> {
  await writeJson(path.join(logsDir(), "..", "runtime", "daemon-state.json"), state);
}
