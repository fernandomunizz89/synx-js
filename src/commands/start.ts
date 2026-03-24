import { Command } from "commander";
import readline from "node:readline";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { writeDaemonState, logDaemon, logPollingCycle, logRuntimeEvent } from "../lib/logging.js";
import { workerList as workers } from "../workers/index.js";
import { sleep, nowIso } from "../lib/utils.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles, consumeRuntimeControl } from "../lib/runtime.js";
import { commandExample } from "../lib/cli-command.js";
import { createStartProgressRenderer } from "../lib/start-progress.js";
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
import { parseHumanInputCommand, parseInlineCommand } from "../lib/start-inline-command.js";
import type { TaskMeta } from "../lib/types.js";
import { buildHumanInputLines, loadMetasSafe, processTasksWithConcurrency, resolveHumanTask } from "../lib/start/task-management.js";
import { appendConsole, appendEvent } from "../lib/start/ui-renderer.js";
import { runInlineCommand } from "../lib/start/command-handler.js";
import { checkExistingDaemon, performReadinessChecks, getProviderStatus } from "../lib/start/startup-checks.js";
import { resolvePollIntervalMs, resolveMaxImmediateCycles, resolveTaskConcurrency } from "../lib/start/loop-utils.js";
import { setupKeypressHandler } from "../lib/start/interaction-handler.js";
import { decideLoopAction } from "../lib/loop-action.js";
import { providerHealthToHuman } from "../lib/human-messages.js";

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

    const daemonCheck = await checkExistingDaemon({ force: options.force });
    headerContextLines.push(...daemonCheck.messages);
    if (daemonCheck.shouldAbort) {
      console.log(`Next step: stop the other process, then run \`${commandExample("start")}\`.`);
      console.log(`If you still want to start now, run \`${commandExample("start --force")}\`.`);
      return;
    }

    const readiness = await performReadinessChecks({ force: options.force });
    if (readiness.shouldAbort) {
      console.log("\nStart aborted to prevent failed runs in a broken setup.");
      console.log(`Next step: run \`${commandExample("setup")}\` and then \`${commandExample("start")}\`.`);
      console.log(`If you still want to start now, run \`${commandExample("start --force")}\`.`);
      return;
    }

    const { config, health } = await getProviderStatus();
    const reviewerLine = !config.humanReviewer.trim() ? synxWaiting(`Human reviewer: missing (run \`${commandExample("setup")}\`)`) : synxSuccess(`Human reviewer: ${config.humanReviewer}`);
    const providerTone = (line: string): string => (line.toLowerCase().includes("reachable") || line.toLowerCase().includes("available")) ? synxSuccess(line) : (line.toLowerCase().includes("missing") || line.toLowerCase().includes("not")) ? synxCritical(line) : synxWaiting(line);

    const fixedControlPanelLines = [
      `Flow: ${synxControlFlowDiagram()}`,
      reviewerLine,
      `Dispatcher provider: ${providerTone(providerHealthToHuman(health.message))}`,
      `Agent state palette: ${formatSynxStatus("processing")} | ${formatSynxStatus("success")} | ${formatSynxStatus("critical_error")} | ${formatSynxStatus("waiting_human")}`,
    ];

    const staleLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();
    [staleLocks, recoveredWorking, recoveredTasks].forEach((list, idx) => {
      if (list.length) {
        const msg = formatSynxStreamLog(`${["Cleared stale locks", "Recovered unfinished working files", "Recovered interrupted tasks"][idx]}: ${list.length}`);
        if (progressCapable) headerContextLines.push(msg); else console.log(msg);
      }
    });

    const engineStartedAtMs = Date.now();
    const progress = createStartProgressRenderer({ enabled: progressCapable });
    const progressEnabled = progress.enabled;
    const enginePanelLines = [synxSuccess("SYNX engine started. Press Ctrl+C to stop.")];
    if (progressEnabled) progress.setStaticFrame({ headerContextLines, fixedControlPanelLines, enginePanelLines });
    else { console.log(renderSynxLogo()); headerContextLines.forEach(l => console.log(l)); console.log(renderSynxPanel({ title: "SYNX CONTROL PANEL", lines: fixedControlPanelLines, borderColor: "cyan" })); console.log(renderSynxPanel({ title: "ENGINE", lines: enginePanelLines, borderColor: "magenta" })); }

    await logDaemon("SYNX engine started.");
    await logRuntimeEvent({
      event: "engine.started",
      source: "start-command",
      payload: {
        pid: process.pid,
        pollIntervalMs: resolvePollIntervalMs(),
      },
    });
    await writeDaemonState({ pid: process.pid, lastHeartbeatAt: nowIso(), loop: 0, taskCount: 0, workerCount: workers.length });

    const pollIntervalMs = resolvePollIntervalMs();
    const maxImmediateCycles = resolveMaxImmediateCycles();
    const taskConcurrency = resolveTaskConcurrency();

    let loop = 0, immediateCycleStreak = 0, immediateCyclesTotal = 0, sleepsAvoidedTotal = 0, sleepsTotal = 0, totalProcessedStages = 0, totalProcessedTasks = 0, wasPreviousLoopProductive = false, stopRequested = false, stopSignal: NodeJS.Signals | "" = "", lastActiveTaskCount = 0;
    const uiState = {
      paused: false,
      enginePanelHasCritical: false,
      logViewMode: "console" as const,
      interactionMode: "command" as "command" | "human_input",
      inputBuffer: "",
      consoleLogLines: [] as string[],
      eventLogLines: [] as string[],
      humanInputLines: [] as string[],
      preferredHumanTaskId: "",
      metas: [] as TaskMeta[]
    };

    const pushEvent = (message: string, level: "info" | "critical" = "info"): void => { appendEvent(uiState.eventLogLines, message); appendConsole(uiState.consoleLogLines, message, level); if (level === "critical") uiState.enginePanelHasCritical = true; };
    const renderUI = (): void => progress.render({ ...uiState, loop, engineStartedAtMs });
    const refreshMetas = async (): Promise<void> => { const ids = await allTaskIds(); uiState.metas = await loadMetasSafe(ids); };
    const requestStop = (signal: NodeJS.Signals, source = "signal", reason = ""): void => {
      if (stopRequested) return;
      stopRequested = true;
      stopSignal = signal;
      pushEvent(`${signal} received. Waiting current cycle...`);
      void logRuntimeEvent({
        event: "engine.stop_requested",
        source,
        payload: {
          signal,
          reason,
        },
      });
      renderUI();
    };

    let commandExecution = Promise.resolve();
    const queueCommand = (cmd: any): void => { commandExecution = commandExecution.then(() => runInlineCommand(cmd, { pushEvent, requestStop })).then(refreshMetas).catch(e => pushEvent(`Command error: ${e.message}`, "critical")).finally(renderUI); };

    if (progressEnabled && process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on("keypress", setupKeypressHandler({
        state: uiState,
        queueCommand,
        requestStop,
        pushEvent,
        render: renderUI,
        onPauseToggle: (paused) => {
          void logRuntimeEvent({
            event: paused ? "engine.paused" : "engine.resumed",
            source: "tui",
            payload: {
              loop,
            },
          });
        },
      }));
      process.stdin.resume();
      pushEvent("Inline command mode active. Use ? or F1 for help. Press F4 to switch Console/Event Stream.");
      renderUI();
    }

    try {
      while (!stopRequested) {
        const loopStartedAtMs = Date.now();
        loop += 1;

        const runtimeControl = await consumeRuntimeControl();
        if (runtimeControl) {
          if (runtimeControl.command === "pause") {
            if (!uiState.paused) {
              uiState.paused = true;
              pushEvent("Engine paused by external command.");
            }
            await logRuntimeEvent({
              event: "engine.paused",
              source: "runtime-control",
              payload: {
                requestedBy: runtimeControl.requestedBy,
                reason: runtimeControl.reason,
              },
            });
          }
          if (runtimeControl.command === "resume") {
            if (uiState.paused) {
              uiState.paused = false;
              pushEvent("Engine resumed by external command.");
            }
            await logRuntimeEvent({
              event: "engine.resumed",
              source: "runtime-control",
              payload: {
                requestedBy: runtimeControl.requestedBy,
                reason: runtimeControl.reason,
              },
            });
          }
          if (runtimeControl.command === "stop") {
            requestStop("SIGTERM", "runtime-control", runtimeControl.reason);
          }
        }

        const taskIds = await allTaskIds();
        const outcomes = uiState.paused ? [] : await processTasksWithConcurrency(taskIds, taskConcurrency);
        let processedStages = outcomes.reduce((sum, o) => sum + o.processedStages, 0);
        let processedTaskCount = outcomes.filter(o => o.processedStages > 0).length;

        totalProcessedStages += processedStages;
        totalProcessedTasks += processedTaskCount;
        uiState.metas = await loadMetasSafe(taskIds);
        const humanTask = resolveHumanTask(uiState.metas);
        const prevHumanId = uiState.preferredHumanTaskId;
        uiState.preferredHumanTaskId = humanTask?.taskId || "";
        uiState.humanInputLines = buildHumanInputLines(humanTask);
        if (uiState.preferredHumanTaskId) { uiState.interactionMode = "human_input"; if (uiState.preferredHumanTaskId !== prevHumanId) pushEvent(`Human input required for ${uiState.preferredHumanTaskId}.`); }
        else if (uiState.interactionMode === "human_input") { uiState.interactionMode = "command"; pushEvent("No pending review. Prompt focus returned."); }

        lastActiveTaskCount = uiState.metas.filter((m: TaskMeta) => ["new", "in_progress", "waiting_agent"].includes(m.status)).length;
        renderUI();

        const decision = uiState.paused ? { action: "sleep" as const, reason: "paused" } : decideLoopAction({ processedStages, activeTaskCount: lastActiveTaskCount, immediateCycleStreak, maxImmediateCycles, wasPreviousLoopProductive });
        if (decision.action === "immediate") { immediateCycleStreak += 1; immediateCyclesTotal += 1; sleepsAvoidedTotal += 1; }
        else { immediateCycleStreak = 0; sleepsTotal += 1; }

        await writeDaemonState({ pid: process.pid, lastHeartbeatAt: nowIso(), loop, taskCount: taskIds.length, workerCount: workers.length, activeTaskCount: lastActiveTaskCount, processedStagesLastLoop: processedStages, processedTasksLastLoop: processedTaskCount, totalProcessedStages, totalProcessedTasks, immediateCycleStreak, immediateCyclesTotal, sleepsAvoidedTotal, sleepsTotal, loopAction: decision.action, loopActionReason: decision.reason, loopDurationMs: Date.now() - loopStartedAtMs, pollIntervalMs, maxImmediateCycles, taskConcurrency });
        await logPollingCycle({ loop, pollIntervalMs, maxImmediateCycles, taskCount: taskIds.length, activeTaskCount: lastActiveTaskCount, processedStages, processedTasks: processedTaskCount, immediateCycleStreak, immediateCyclesTotal, sleepsAvoidedTotal, sleepsTotal, loopDurationMs: Date.now() - loopStartedAtMs, action: decision.action, reason: decision.reason, sleepMs: decision.action === "sleep" ? pollIntervalMs : 0, taskConcurrency });

        wasPreviousLoopProductive = processedStages > 0;
        if (stopRequested) break;
        if (decision.action === "sleep") await sleep(pollIntervalMs);
      }
    } finally {
      if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); }
      await logDaemon(`SYNX engine stopped${stopSignal ? ` via ${stopSignal}` : ""}.`);
      await logRuntimeEvent({
        event: "engine.stopped",
        source: "start-command",
        payload: {
          signal: stopSignal,
          loop,
        },
      });
      await writeDaemonState({ pid: process.pid, lastHeartbeatAt: nowIso(), loop, taskCount: 0, workerCount: workers.length, activeTaskCount: lastActiveTaskCount, totalProcessedStages, totalProcessedTasks, immediateCycleStreak, immediateCyclesTotal, sleepsAvoidedTotal, sleepsTotal, loopAction: "stopped", loopActionReason: stopSignal ? `graceful shutdown after ${stopSignal}` : "terminated", loopDurationMs: 0, pollIntervalMs, maxImmediateCycles, taskConcurrency });
      progress.stop(); console.log(formatSynxStreamLog("Engine stopped."));
    }
  });
