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
import {
  formatSynxStatus,
  renderHeaderContextLine,
  renderSynxPanel,
  formatSynxStreamLog,
  renderSynxLogo,
  synxControlFlowDiagram,
  synxCritical,
  synxSuccess,
  synxWaiting,
} from "../lib/synx-ui.js";

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
    if (args.immediateCycleStreak < args.maxImmediateCycles) {
      return {
        action: "immediate",
        reason: "stage(s) were processed this loop; fast-path enabled to reduce handoff latency.",
      };
    }
    return {
      action: "sleep",
      reason: `immediate cycle budget reached (${args.immediateCycleStreak}/${args.maxImmediateCycles}).`,
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
  .option("--dry-run", "simulate workspace edits without writing files")
  .action(async (options: { force?: boolean; progress?: boolean; dryRun?: boolean }) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const progressCapable = options.progress !== false && Boolean(process.stdout.isTTY);

    const headerContextLines: string[] = [renderHeaderContextLine("Bootstrapping SYNX runtime...")];

    if (options.dryRun) {
      process.env.AI_AGENTS_DRY_RUN = "1";
      headerContextLines.push(renderHeaderContextLine("Dry-run mode enabled. Workspace edits will be simulated only."));
    }

    process.env.SYNX_STREAM_STDOUT = progressCapable ? "0" : "1";

    const daemonStatePath = path.join(runtimeDir(), "daemon-state.json");
    if (await exists(daemonStatePath)) {
      try {
        const currentState = await readJson<{ pid?: number; lastHeartbeatAt?: string }>(daemonStatePath);
        if (typeof currentState.pid === "number" && currentState.pid !== process.pid && processIsRunning(currentState.pid)) {
          const runningMessage = formatSynxStreamLog("Another engine appears to be running already.", "SYNX");
          headerContextLines.push(runningMessage);
          headerContextLines.push(`- Running PID: ${currentState.pid}`);
          if (currentState.lastHeartbeatAt) {
            headerContextLines.push(`- Last heartbeat: ${currentState.lastHeartbeatAt}`);
          }
          if (!options.force) {
            console.log(`Next step: stop the other process, then run \`${commandExample("start")}\`.`);
            console.log(`If you still want to start now, run \`${commandExample("start --force")}\`.`);
            return;
          }
          const forceMessage = formatSynxStreamLog("Continuing due to --force. Multiple engines may cause duplicated or inconsistent processing.");
          headerContextLines.push(forceMessage);
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

    const reviewerLine = !config.humanReviewer.trim()
      ? synxWaiting(`Human reviewer: missing (run \`${commandExample("setup")}\`)`)
      : synxSuccess(`Human reviewer: ${config.humanReviewer}`);
    const dispatcherLine = providerHealthToHuman(dispatcherHealth.message);
    const plannerLine = providerHealthToHuman(plannerHealth.message);
    const providerTone = (line: string): string => {
      const lower = line.toLowerCase();
      if (lower.includes("reachable") || lower.includes("available")) return synxSuccess(line);
      if (lower.includes("missing") || lower.includes("not")) return synxCritical(line);
      return synxWaiting(line);
    };

    const fixedControlPanelLines = [
      `Flow: ${synxControlFlowDiagram()}`,
      reviewerLine,
      `Dispatcher provider: ${providerTone(dispatcherLine)}`,
      `Planner provider: ${providerTone(plannerLine)}`,
      `Agent state palette: ${formatSynxStatus("processing")} | ${formatSynxStatus("success")} | ${formatSynxStatus("critical_error")} | ${formatSynxStatus("waiting_human")}`,
    ];

    const staleLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();

    if (staleLocks.length) {
      const message = formatSynxStreamLog(`Cleared stale locks: ${staleLocks.length}`);
      if (progressCapable) headerContextLines.push(message);
      else console.log(message);
    }
    if (recoveredWorking.length) {
      const message = formatSynxStreamLog(`Recovered unfinished working files: ${recoveredWorking.length}`);
      if (progressCapable) headerContextLines.push(message);
      else console.log(message);
    }
    if (recoveredTasks.length) {
      const message = formatSynxStreamLog(
        `Recovered interrupted tasks: ${recoveredTasks.filter((item) => item.action === "requeued").length}`,
      );
      if (progressCapable) headerContextLines.push(message);
      else console.log(message);
    }

    const enginePanelLines = [
      synxSuccess("SYNX engine started. Press Ctrl+C to stop."),
      `Tip: in another terminal, run \`${commandExample("new")}\` and \`${commandExample("status")}\`.`,
    ];
    await logDaemon("SYNX engine started.");
    await writeDaemonState({
      pid: process.pid,
      lastHeartbeatAt: nowIso(),
      loop: 0,
      taskCount: 0,
      workerCount: workers.length,
    });

    const engineStartedAtMs = Date.now();
    const progress = createStartProgressRenderer({ enabled: progressCapable });
    const progressEnabled = progress.enabled;
    if (progressEnabled) {
      progress.setStaticFrame({
        headerContextLines,
        fixedControlPanelLines,
        enginePanelLines,
      });
    } else {
      console.log(renderSynxLogo());
      for (const line of headerContextLines) console.log(line);
      console.log(renderSynxPanel({
        title: "SYNX CONTROL PANEL",
        lines: fixedControlPanelLines,
        borderColor: "cyan",
      }));
      console.log(renderSynxPanel({
        title: "ENGINE",
        lines: enginePanelLines,
        borderColor: "magenta",
      }));
    }
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
      console.log(`\n${formatSynxStreamLog(`${signal} received. Waiting current cycle to finish for graceful shutdown...`)}`);
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

        if (options.progress === false && processedStages > 0) {
          console.log(
            formatSynxStreamLog(
              `Processed ${processedStages} stage(s) across ${processedTaskIds.size} task(s).`,
            ),
          );
        }

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
      await logDaemon(`SYNX engine stopped${stopSignal ? ` via ${stopSignal}` : ""}.`);
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
      console.log(formatSynxStreamLog("Engine stopped."));
    }
  });
