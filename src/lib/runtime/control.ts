import path from "node:path";
import { promises as fs } from "node:fs";
import { exists, readJson, writeJson } from "../fs.js";
import { runtimeDir } from "../paths.js";
import { nowIso } from "../utils.js";

export type RuntimeControlCommand = "pause" | "resume" | "stop";

export interface RuntimeControlRequest {
  command: RuntimeControlCommand;
  requestedAt: string;
  requestedBy: string;
  reason: string;
}

function daemonControlFilePath(): string {
  return path.join(runtimeDir(), "daemon-control.json");
}

export async function writeRuntimeControl(args: {
  command: RuntimeControlCommand;
  requestedBy?: string;
  reason?: string;
}): Promise<RuntimeControlRequest> {
  const payload: RuntimeControlRequest = {
    command: args.command,
    requestedAt: nowIso(),
    requestedBy: String(args.requestedBy || "web-ui").trim() || "web-ui",
    reason: String(args.reason || "").trim(),
  };
  await writeJson(daemonControlFilePath(), payload);
  return payload;
}

export async function consumeRuntimeControl(): Promise<RuntimeControlRequest | null> {
  const file = daemonControlFilePath();
  if (!(await exists(file))) return null;

  try {
    const payload = await readJson<RuntimeControlRequest>(file);
    await fs.unlink(file).catch(() => undefined);
    if (!payload || typeof payload !== "object") return null;
    if (!payload.command || !["pause", "resume", "stop"].includes(payload.command)) return null;
    return payload;
  } catch {
    await fs.unlink(file).catch(() => undefined);
    return null;
  }
}
