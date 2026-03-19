import path from "node:path";
import { appendText, writeJson } from "../fs.js";
import { logsDir } from "../paths.js";
import { nowIso } from "../utils.js";
import { formatSynxStreamLog } from "../synx-ui.js";

export function normalizeLogLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function logDaemon(message: string): Promise<void> {
  await appendText(path.join(logsDir(), "daemon.log"), `${formatSynxStreamLog(normalizeLogLine(message), "SYNX", nowIso())}\n`);
}

export async function writeDaemonState(state: unknown): Promise<void> {
  await writeJson(path.join(logsDir(), "..", "runtime", "daemon-state.json"), state);
}
