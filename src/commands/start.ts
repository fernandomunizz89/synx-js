import { Command } from "commander";
import path from "node:path";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { writeDaemonState, logDaemon, logPollingCycle } from "../lib/logging.js";
import { workers } from "../workers/index.js";
import { POLL_INTERVAL_MS } from "../lib/constants.js";
import { sleep, nowIso } from "../lib/utils.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles, processIsRunning } from "../lib/runtime.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { loadResolvedProjectConfig } from "../lib/config.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { createStartProgressRenderer } from "../lib/start-progress.js";
import { exists, readJson } from "../lib/fs.js";
import { runtimeDir } from "../lib/paths.js";
import { envNumber } from "../lib/env.js";

function resolvePollIntervalMs(): number {
  return envNumber("AI_AGENTS_POLL_INTERVAL_MS", POLL_INTERVAL_MS, {
    integer: true,
    min: 200,
    max: 120_000,
  });
}

function resolveMaxImmediateCycles(): number {
  return envNumber("AI_AGENTS_MAX_IMMEDIATE_CYCLES", 3, {
    integer: true,
    min: 0,
    max: 20,
  });
}

function resolveTaskConcurrency(): number {
  return envNumber("AI_AGENTS_TASK_CONCURRENCY", 3, {
    integer: true,
    min: 1,
    max: 20,
  });
}

interface LoopActionDecision {
  action: "immediate" | "sleep";
  reason: string;
}

function decideLoopAction(args: {
  processedStages: number;
  activeTaskCount: number;
  immediateCycleStreak: number;
  maxImmediateCycles: number;
  wasPreviousLoopProductive: boolean;
}): LoopActionDecision {
  if (args.processedStages > 0) {
    return {
      action: "immediate",
      reason: "stage(s) were processed this loop; fast-path enabled to reduce handoff latency.",
    };
  }

  if (args.activeTaskCount > 0 && args.wasPreviousLoopProductive && args.immediateCycleStreak < args.maxImmediateCycles) {
    return {
      action: "immediate",
      reason: "active tasks remain after a productive loop; run one more aggressive check before sleeping.",
    };
  }

  if (args.activeTaskCount > 0) {
    return {
      action: "sleep",
      reason: "active tasks exist but no stage was processable in this loop.",
    };
  }

  return {
    action: "sleep",
    reason: "no active tasks available; sleeping with low CPU profile.",
  };
}

interface TaskProcessOutcome {
  taskId: string;
  processedStages: number;
}

async function processTaskWithWorkers(taskId: string): Promise<TaskProcessOutcome> {
  let processedStages = 0;
  for (const worker of workers) {
    const processed = await worker.tryProcess(taskId);
    if (processed) processedStages += 1;
  }
  return {
    taskId,
    processedStages,
  };
}

async function processTasksWithConcurrency(taskIds: string[], concurrency: number): Promise<TaskProcessOutcome[]> {
  if (!taskIds.length) return [];
  const safeConcurrency = Math.max(1, Math.min(concurrency, taskIds.length));
  const outcomes = new Array<TaskProcessOutcome>(taskIds.length);
  let cursor = 0;

  const runners = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const nextIndex = cursor;
      cursor += 1;
      if (nextIndex >= taskIds.length) return;
      const taskId = taskIds[nextIndex];
      outcomes[nextIndex] = await processTaskWithWorkers(taskId);
    }
  });

  await Promise.all(runners);
  return outcomes.filter((item): item is TaskProcessOutcome => Boolean(item));
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
    const taskConcurrency = resolveTaskConcurrency();

    let loop = 0;
    let immediateCycleStreak = 0;
    let immediateCyclesTotal = 0;
    let sleepsAvoidedTotal = 0;
    let sleepsTotal = 0;
    let totalProcessedStages = 0;
    let totalProcessedTasks = 0;
    let wasPreviousLoopProductive = false;
    let stopRequested = false;
    let stopSignal: NodeJS.Signals | "" = "";
    let lastActiveTaskCount = 0;

    const requestStop = (signal: NodeJS.Signals): void => {
      if (stopRequested) return;
      stopRequested = true;
      stopSignal = signal;
      console.log(`\n${signal} received. Waiting current cycle to finish for graceful shutdown...`);
    };

    process.on("SIGINT", requestStop);
    process.on("SIGTERM", requestStop);
    try {
      while (!stopRequested) {
        const loopStartedAtMs = Date.now();
        loop += 1;
        const taskIds = await allTaskIds();
        const outcomes = await processTasksWithConcurrency(taskIds, taskConcurrency);
        let processedStages = 0;
        const processedTaskIds = new Set<string>();

        for (const outcome of outcomes) {
          processedStages += outcome.processedStages;
          if (outcome.processedStages > 0) {
            processedTaskIds.add(outcome.taskId);
          }
        }
        totalProcessedStages += processedStages;
        totalProcessedTasks += processedTaskIds.size;

        const metaResults = await Promise.allSettled(taskIds.map((taskId) => loadTaskMeta(taskId)));
        const metas = metaResults
          .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof loadTaskMeta>>> => item.status === "fulfilled")
          .map((item) => item.value);
        const activeTaskCount = metas.filter((meta) => ["new", "in_progress", "waiting_agent"].includes(meta.status)).length;
        lastActiveTaskCount = activeTaskCount;
        progress.render({
          loop,
          engineStartedAtMs,
          metas,
        });

        const decision = decideLoopAction({
          processedStages,
          activeTaskCount,
          immediateCycleStreak,
          maxImmediateCycles,
          wasPreviousLoopProductive,
        });

        if (decision.action === "immediate") {
          immediateCycleStreak += 1;
          immediateCyclesTotal += 1;
          sleepsAvoidedTotal += 1;
        } else {
          immediateCycleStreak = 0;
          sleepsTotal += 1;
        }

        const loopDurationMs = Date.now() - loopStartedAtMs;
        await writeDaemonState({
          pid: process.pid,
          lastHeartbeatAt: nowIso(),
          loop,
          taskCount: taskIds.length,
          workerCount: workers.length,
          activeTaskCount,
          processedStagesLastLoop: processedStages,
          processedTasksLastLoop: processedTaskIds.size,
          totalProcessedStages,
          totalProcessedTasks,
          immediateCycleStreak,
          immediateCyclesTotal,
          sleepsAvoidedTotal,
          sleepsTotal,
          loopAction: decision.action,
          loopActionReason: decision.reason,
          loopDurationMs,
          pollIntervalMs,
          maxImmediateCycles,
          taskConcurrency,
        });
        await logPollingCycle({
          loop,
          pollIntervalMs,
          maxImmediateCycles,
          taskCount: taskIds.length,
          activeTaskCount,
          processedStages,
          processedTasks: processedTaskIds.size,
          immediateCycleStreak,
          immediateCyclesTotal,
          sleepsAvoidedTotal,
          sleepsTotal,
          loopDurationMs,
          action: decision.action,
          reason: decision.reason,
          sleepMs: decision.action === "sleep" ? pollIntervalMs : 0,
          taskConcurrency,
        });

        wasPreviousLoopProductive = processedStages > 0;
        if (stopRequested) break;
        if (decision.action === "immediate") continue;
        await sleep(pollIntervalMs);
      }
    } finally {
      process.off("SIGINT", requestStop);
      process.off("SIGTERM", requestStop);
      await logDaemon(`Engine stopped${stopSignal ? ` via ${stopSignal}` : ""}.`);
      await writeDaemonState({
        pid: process.pid,
        lastHeartbeatAt: nowIso(),
        loop,
        taskCount: 0,
        workerCount: workers.length,
        activeTaskCount: lastActiveTaskCount,
        processedStagesLastLoop: 0,
        processedTasksLastLoop: 0,
        totalProcessedStages,
        totalProcessedTasks,
        immediateCycleStreak,
        immediateCyclesTotal,
        sleepsAvoidedTotal,
        sleepsTotal,
        loopAction: "stopped",
        loopActionReason: stopSignal ? `graceful shutdown after ${stopSignal}` : "engine loop terminated",
        loopDurationMs: 0,
        pollIntervalMs,
        maxImmediateCycles,
        taskConcurrency,
      });
      progress.stop();
      console.log("Engine stopped.");
    }
  });
