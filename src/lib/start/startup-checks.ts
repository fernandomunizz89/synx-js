import path from "node:path";
import { exists, readJson } from "../fs.js";
import { runtimeDir } from "../paths.js";
import { processIsRunning } from "../runtime.js";
import { formatSynxStreamLog, renderHeaderContextLine } from "../synx-ui.js";
import { commandExample } from "../cli-command.js";
import { collectReadinessReport, type ReadinessReport } from "../readiness.js";
import { checkProviderHealth } from "../provider-health.js";
import { loadResolvedProjectConfig } from "../config.js";
import type { GlobalConfig, ResolvedProjectConfig, ProviderHealth } from "../types.js";

export async function checkExistingDaemon(options: { force?: boolean }): Promise<{ shouldAbort: boolean; messages: string[] }> {
  const messages: string[] = [];
  const daemonStatePath = path.join(runtimeDir(), "daemon-state.json");

  if (await exists(daemonStatePath)) {
    try {
      const currentState = await readJson<{ pid?: number; lastHeartbeatAt?: string }>(daemonStatePath);
      if (typeof currentState.pid === "number" && currentState.pid !== process.pid && processIsRunning(currentState.pid)) {
        messages.push(formatSynxStreamLog("Another engine appears to be running already.", "SYNX"));
        messages.push(`- Running PID: ${currentState.pid}`);
        if (currentState.lastHeartbeatAt) {
          messages.push(`- Last heartbeat: ${currentState.lastHeartbeatAt}`);
        }
        if (!options.force) {
          return { shouldAbort: true, messages };
        }
        messages.push(formatSynxStreamLog("Continuing due to --force. Multiple engines may cause duplicated or inconsistent processing."));
      }
    } catch {
      // Ignore malformed daemon state
    }
  }
  return { shouldAbort: false, messages };
}

export async function performReadinessChecks(options: { force?: boolean }): Promise<{ shouldAbort: boolean; report: ReadinessReport }> {
  const readiness = await collectReadinessReport({ includeProviderChecks: true });
  if (!readiness.ok && !options.force) {
    return { shouldAbort: true, report: readiness };
  }
  return { shouldAbort: false, report: readiness };
}

export async function getProviderStatus(): Promise<{ config: ResolvedProjectConfig; health: ProviderHealth }> {
  const config = await loadResolvedProjectConfig();
  const health = await checkProviderHealth(config.providers.dispatcher);
  return { config, health };
}
