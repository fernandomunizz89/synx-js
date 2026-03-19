import { formatSynxStreamLog } from "../synx-ui.js";

export function appendEvent(logLines: string[], message: string): void {
  logLines.push(formatSynxStreamLog(message, "SYNX"));
  while (logLines.length > 5) logLines.shift();
}

export function appendConsole(logLines: string[], message: string, level: "info" | "critical"): void {
  const prefix = level === "critical" ? "ERROR" : "INFO";
  logLines.push(`${prefix}: ${message}`);
  while (logLines.length > 5) logLines.shift();
}
