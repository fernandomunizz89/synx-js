import { Command } from "commander";
import path from "node:path";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { writeDaemonState, logDaemon } from "../lib/logging.js";
import { workers } from "../workers/index.js";
import { POLL_INTERVAL_MS } from "../lib/constants.js";
import { sleep, nowIso } from "../lib/utils.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { loadResolvedProjectConfig } from "../lib/config.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { createStartProgressRenderer } from "../lib/start-progress.js";
import { exists, readJson } from "../lib/fs.js";
import { runtimeDir } from "../lib/paths.js";

function resolvePollIntervalMs(): number {
  const raw = Number(process.env.AI_AGENTS_POLL_INTERVAL_MS || "");
  if (!Number.isFinite(raw)) return POLL_INTERVAL_MS;
  const normalized = Math.floor(raw);
  return normalized >= 200 ? normalized : POLL_INTERVAL_MS;
}

function resolveMaxImmediateCycles(): number {
  const raw = Number(process.env.AI_AGENTS_MAX_IMMEDIATE_CYCLES || "1");
  if (!Number.isFinite(raw)) return 1;
  const normalized = Math.floor(raw);
  if (normalized < 0) return 0;
  if (normalized > 20) return 20;
  return normalized;
}

function processIsRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "EPERM") {
      return true;
    }
    return false;
  }
}

export const startCommand = new Command("start")
  .description("Start the engine, recover unfinished work, and keep processing tasks")
  .option("--force", "start even when readiness checks fail")
  .option("--no-progress", "disable live progress indicator")
  .action(async (options: { force?: boolean; progress?: boolean }) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const daemonStatePath = path.join(runtimeDir(), "daemon-state.json");
    if (await exists(daemonStatePath)) {
      try {
        const currentState = await readJson<{ pid?: number; lastHeartbeatAt?: string }>(daemonStatePath);
        if (typeof currentState.pid === "number" && currentState.pid !== process.pid && processIsRunning(currentState.pid)) {
          console.log("\nAnother engine appears to be running already.");
          console.log(`- Running PID: ${currentState.pid}`);
          if (currentState.lastHeartbeatAt) {
            console.log(`- Last heartbeat: ${currentState.lastHeartbeatAt}`);
          }
          if (!options.force) {
            console.log(`Next step: stop the other process, then run \`${commandExample("start")}\`.`);
            console.log(`If you still want to start now, run \`${commandExample("start --force")}\`.`);
            return;
          }
          console.log("Continuing due to --force. Multiple engines may cause duplicated or inconsistent processing.");
        }
      } catch {
        // Ignore malformed daemon state and continue startup.
      }
    }

    const readiness = await collectReadinessReport({ includeProviderChecks: true });
    printReadinessReport(readiness, "Readiness checks");
    if (!readiness.ok && !options.force) {
      console.log(`\nStart aborted to prevent failed runs in a broken setup.`);
      console.log(`Next step: run \`${commandExample("setup")}\` and then \`${commandExample("start")}\`.`);
      console.log(`If you still want to start now, run \`${commandExample("start --force")}\`.`);
      return;
    }

    const config = await loadResolvedProjectConfig();
    const dispatcherHealth = await checkProviderHealth(config.providers.dispatcher);
    const plannerHealth = await checkProviderHealth(config.providers.planner);

    console.log("\nStartup checks");
    if (!config.humanReviewer.trim()) {
      console.log(`- Human reviewer: missing. Run \`${commandExample("setup")}\` to set it explicitly.`);
    } else {
      console.log(`- Human reviewer: ${config.humanReviewer}`);
    }
    console.log(`- Dispatcher provider: ${providerHealthToHuman(dispatcherHealth.message)}`);
    console.log(`- Planner provider: ${providerHealthToHuman(plannerHealth.message)}`);

    const staleLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();

    if (staleLocks.length) console.log(`- Cleared stale locks: ${staleLocks.length}`);
    if (recoveredWorking.length) console.log(`- Recovered unfinished working files: ${recoveredWorking.length}`);
    if (recoveredTasks.length) {
      console.log(`- Recovered interrupted tasks: ${recoveredTasks.filter((item) => item.action === "requeued").length}`);
    }

    console.log("\nEngine started. Press Ctrl+C to stop.");
    console.log(`Tip: in another terminal, run \`${commandExample("new")}\` and \`${commandExample("status")}\`.`);
    await logDaemon("Engine started.");
    await writeDaemonState({
      pid: process.pid,
      lastHeartbeatAt: nowIso(),
      loop: 0,
      taskCount: 0,
      workerCount: workers.length,
    });

    const engineStartedAtMs = Date.now();
    const progress = createStartProgressRenderer({ enabled: options.progress !== false });
    const pollIntervalMs = resolvePollIntervalMs();
    const maxImmediateCycles = resolveMaxImmediateCycles();

    let loop = 0;
    let immediateCycleStreak = 0;
    try {
      while (true) {
        loop += 1;
        const taskIds = await allTaskIds();
        let processedAny = false;

        for (const taskId of taskIds) {
          for (const worker of workers) {
            const processed = await worker.tryProcess(taskId);
            if (processed) processedAny = true;
          }
        }

        await writeDaemonState({
          pid: process.pid,
          lastHeartbeatAt: nowIso(),
          loop,
          taskCount: taskIds.length,
          workerCount: workers.length,
        });

        const metaResults = await Promise.allSettled(taskIds.map((taskId) => loadTaskMeta(taskId)));
        const metas = metaResults
          .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof loadTaskMeta>>> => item.status === "fulfilled")
          .map((item) => item.value);
        progress.render({
          loop,
          engineStartedAtMs,
          metas,
        });

        if (processedAny && immediateCycleStreak < maxImmediateCycles) {
          immediateCycleStreak += 1;
          continue;
        }
        immediateCycleStreak = 0;
        await sleep(pollIntervalMs);
      }
    } finally {
      progress.stop();
    }
  });
