import { Command } from "commander";
import path from "node:path";
import readline from "node:readline";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, createTask, loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { writeDaemonState, logDaemon, logPollingCycle, logTaskEvent } from "../lib/logging.js";
import { workerList as workers } from "../workers/index.js";
import { DONE_FILE_NAMES, POLL_INTERVAL_MS, STAGE_FILE_NAMES } from "../lib/constants.js";
import { sleep, nowIso } from "../lib/utils.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles, processIsRunning } from "../lib/runtime.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { loadResolvedProjectConfig } from "../lib/config.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { createStartProgressRenderer } from "../lib/start-progress.js";
import { exists, readJson, writeJson } from "../lib/fs.js";
import { runtimeDir, taskDir } from "../lib/paths.js";
import { envNumber } from "../lib/env.js";
import { decideLoopAction } from "../lib/loop-action.js";
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
import { mapFunctionKeyToAction, parseHumanInputCommand, parseInlineCommand, type InlineCommand } from "../lib/start-inline-command.js";
import type { AgentName, StageEnvelope, TaskMeta, TaskType } from "../lib/types.js";
import { resolveTaskQaPreferences } from "../lib/qa-preferences.js";

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

interface TaskProcessOutcome {
  taskId: string;
  processedStages: number;
}

interface RemediationTarget {
  agent: AgentName;
  stage: string;
  requestFileName: string;
}

interface StatusCounts {
  active: number;
  waitingHuman: number;
  failed: number;
  done: number;
}

function taskUpdatedAtMs(meta: TaskMeta): number {
  const timestamp = meta.updatedAt || meta.createdAt;
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function byMostRecent(a: TaskMeta, b: TaskMeta): number {
  return taskUpdatedAtMs(b) - taskUpdatedAtMs(a);
}

function summarizeTaskCounts(metas: TaskMeta[]): StatusCounts {
  return {
    active: metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
    waitingHuman: metas.filter((x) => x.status === "waiting_human").length,
    failed: metas.filter((x) => x.status === "failed").length,
    done: metas.filter((x) => x.status === "done").length,
  };
}

function remediationTarget(taskType: TaskType): RemediationTarget {
  if (taskType === "Bug") {
    return {
      agent: "Bug Fixer",
      stage: "bug-fixer",
      requestFileName: STAGE_FILE_NAMES.bugFixer,
    };
  }

  return {
    agent: "Feature Builder",
    stage: "builder",
    requestFileName: STAGE_FILE_NAMES.builder,
  };
}

function appendEvent(logLines: string[], message: string): void {
  logLines.push(formatSynxStreamLog(message, "SYNX"));
  while (logLines.length > 5) logLines.shift();
}

function appendConsole(logLines: string[], message: string, level: "info" | "critical"): void {
  const prefix = level === "critical" ? "ERROR" : "INFO";
  logLines.push(`${prefix}: ${message}`);
  while (logLines.length > 5) logLines.shift();
}

function pickFocusedTask(metas: TaskMeta[]): { meta: TaskMeta; reason: string } {
  const sorted = [...metas].sort(byMostRecent);

  const waitingHuman = sorted.find((x) => x.status === "waiting_human");
  if (waitingHuman) {
    return {
      meta: waitingHuman,
      reason: "task waiting for your approval",
    };
  }

  const active = sorted.find((x) => ["new", "in_progress", "waiting_agent"].includes(x.status));
  if (active) {
    return {
      meta: active,
      reason: "task currently in progress",
    };
  }

  const latestDone = sorted.find((x) => x.status === "done");
  if (latestDone) {
    return {
      meta: latestDone,
      reason: "latest completed task",
    };
  }

  const latestFailed = sorted.find((x) => x.status === "failed");
  if (latestFailed) {
    return {
      meta: latestFailed,
      reason: "latest failed task",
    };
  }

  return {
    meta: sorted[0],
    reason: "most recently updated task",
  };
}

function resolveHumanTask(metas: TaskMeta[]): TaskMeta | null {
  const waiting = metas
    .filter((meta) => meta.humanApprovalRequired || meta.status === "waiting_human")
    .sort(byMostRecent);
  return waiting[0] || null;
}

function buildHumanInputLines(humanTask: TaskMeta | null): string[] {
  if (!humanTask) return [];

  return [
    synxWaiting(`Task waiting human review: ${humanTask.taskId}`),
    `Title: ${humanTask.title}`,
    `Type: ${humanTask.type} | Stage: ${humanTask.currentStage}`,
    "Type `approve` to finalize, or `reprove --reason \"...\"` to send it back.",
    "Tip: in this mode, free-text reply is treated as reprove reason.",
  ];
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
      const nextIndex = cursor++;
      if (nextIndex >= taskIds.length) return;
      const taskId = taskIds[nextIndex];
      outcomes[nextIndex] = await processTaskWithWorkers(taskId);
    }
  });

  await Promise.all(runners);
  return outcomes.filter((item): item is TaskProcessOutcome => Boolean(item));
}

async function loadMetasSafe(taskIds: string[]): Promise<TaskMeta[]> {
  const metaResults = await Promise.allSettled(taskIds.map((taskId) => loadTaskMeta(taskId)));
  return metaResults
    .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof loadTaskMeta>>> => item.status === "fulfilled")
    .map((item) => item.value);
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
      console.log("\nStart aborted to prevent failed runs in a broken setup.");
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

    const enginePanelLines = [synxSuccess("SYNX engine started. Press Ctrl+C to stop.")];
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

    let paused = false;
    let enginePanelHasCritical = false;
    let logViewMode: "console" | "event_stream" = "console";
    let interactionMode: "command" | "human_input" = "command";
    let inputBuffer = "";
    const consoleLogLines: string[] = [];
    const eventLogLines: string[] = [];
    let humanInputLines: string[] = [];
    let preferredHumanTaskId = "";
    let latestMetas: TaskMeta[] = [];

    const pushEvent = (message: string, level: "info" | "critical" = "info"): void => {
      appendEvent(eventLogLines, message);
      appendConsole(consoleLogLines, message, level);
      if (level === "critical") {
        enginePanelHasCritical = true;
      }
    };

    const renderInteractiveSnapshot = (): void => {
      progress.render({
        loop,
        engineStartedAtMs,
        metas: latestMetas,
        paused,
        enginePanelHasCritical,
        logViewMode,
        interactionMode,
        inputBuffer,
        humanInputLines,
        consoleLogLines,
        eventLogLines,
      });
    };

    const refreshMetasForUi = async (): Promise<void> => {
      const ids = await allTaskIds();
      latestMetas = await loadMetasSafe(ids);
    };

    pushEvent("Interactive prompt ready. Type `help` for commands.");
    renderInteractiveSnapshot();

    const requestStop = (signal: NodeJS.Signals): void => {
      if (stopRequested) return;
      stopRequested = true;
      stopSignal = signal;
      pushEvent(`${signal} received. Waiting current cycle to finish for graceful shutdown...`);
      renderInteractiveSnapshot();
    };

    const runInlineCommand = async (command: InlineCommand): Promise<void> => {
      if (command.kind === "help") {
        pushEvent("Commands: new \"title\" --type Bug|Feature|Refactor|Research|Documentation|Mixed");
        pushEvent("Commands: status [--all] | approve [--task-id] | reprove --reason \"...\" [--task-id] | stop");
        pushEvent("Shortcuts: ?/F1 Show help | F2 New task template | F3 Pause/Resume | F4 Toggle Console/Event Stream | F10 Exit");
        return;
      }

      if (command.kind === "stop") {
        requestStop("SIGTERM");
        return;
      }

      if (command.kind === "unknown") {
        pushEvent(command.message);
        return;
      }

      if (command.kind === "new") {
        const draftTaskInput = {
          title: command.title,
          typeHint: command.type,
          project: "",
          rawRequest: command.title,
          extraContext: {
            relatedFiles: [],
            logs: [],
            notes: [],
            qaPreferences: {
              e2ePolicy: "required" as const,
              e2eFramework: "auto" as const,
              objective: "",
            },
          },
        };
        const resolvedPreferences = resolveTaskQaPreferences(draftTaskInput);
        const { taskId } = await createTask({
          ...draftTaskInput,
          extraContext: {
            ...draftTaskInput.extraContext,
            qaPreferences: {
              ...draftTaskInput.extraContext.qaPreferences,
              objective: resolvedPreferences.objective,
            },
          },
        });
        pushEvent(`Task created: ${taskId} (${command.type})`);
        return;
      }

      if (command.kind === "status") {
        const ids = await allTaskIds();
        if (!ids.length) {
          pushEvent("No tasks found.");
          return;
        }

        const metas = await loadMetasSafe(ids);
        const counts = summarizeTaskCounts(metas);
        pushEvent(`Summary: active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`);

        if (command.all) {
          for (const meta of [...metas].sort(byMostRecent).slice(0, 4)) {
            pushEvent(`${meta.taskId} | ${meta.status} | ${meta.currentStage} | ${meta.currentAgent || "[none]"}`);
          }
        } else if (metas.length) {
          const focused = pickFocusedTask(metas);
          pushEvent(`Focused (${focused.reason}): ${focused.meta.taskId} | ${focused.meta.status} | ${focused.meta.currentStage}`);
        }
        return;
      }

      if (command.kind === "approve") {
        const meta = await loadTaskMeta(command.taskId);
        if (!meta.humanApprovalRequired) {
          pushEvent(`Task ${command.taskId} is not waiting for human approval.`);
          return;
        }

        meta.status = "done";
        meta.currentStage = "approved";
        meta.currentAgent = "Human Review";
        meta.nextAgent = "";
        meta.humanApprovalRequired = false;
        await saveTaskMeta(command.taskId, meta);
        await logTaskEvent(taskDir(command.taskId), "Human approval completed. Task marked as done.");
        pushEvent(`Task approved: ${command.taskId}`);
        return;
      }

      if (command.kind === "reprove") {
        const reason = command.reason.trim();
        if (!reason) {
          pushEvent("Reprove requires a non-empty reason.");
          return;
        }

        const meta = await loadTaskMeta(command.taskId);
        if (!meta.humanApprovalRequired) {
          pushEvent(`Task ${command.taskId} is not waiting for human review.`);
          return;
        }

        const target = remediationTarget(meta.type);
        const now = nowIso();
        const qaDoneRef = `done/${DONE_FILE_NAMES.qa}`;
        const prDoneRef = `done/${DONE_FILE_NAMES.pr}`;
        const nextInputRef = await exists(path.join(taskDir(command.taskId), qaDoneRef)) ? qaDoneRef : prDoneRef;

        meta.status = "waiting_agent";
        meta.currentStage = "reproved";
        meta.currentAgent = "Human Review";
        meta.nextAgent = target.agent;
        meta.humanApprovalRequired = false;
        await saveTaskMeta(command.taskId, meta);

        const stageRequest: StageEnvelope = {
          taskId: command.taskId,
          stage: target.stage,
          status: "request",
          createdAt: now,
          agent: target.agent,
          inputRef: nextInputRef,
        };

        await writeJson(path.join(taskDir(command.taskId), "inbox", target.requestFileName), stageRequest);
        await writeJson(path.join(taskDir(command.taskId), "human", "90-final-review.reproved.json"), {
          taskId: command.taskId,
          stage: "human-review",
          status: "done",
          createdAt: now,
          agent: "Human Review",
          output: {
            decision: "reproved",
            returnedTo: target.agent,
            reason,
            rollbackMode: "none",
          },
        });
        await logTaskEvent(taskDir(command.taskId), `Human reprove completed. Task returned to ${target.agent}. Reason: ${reason}`);
        pushEvent(`Task reproved: ${command.taskId} -> ${target.agent}`);
      }
    };

    const executeInlineCommand = async (command: InlineCommand): Promise<void> => {
      try {
        await runInlineCommand(command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushEvent(`Command failed: ${message}`, "critical");
      }
      try {
        await refreshMetasForUi();
      } catch {
        // UI refresh is best-effort; runtime loop will refresh again soon.
      }
      renderInteractiveSnapshot();
    };

    let commandExecution = Promise.resolve();
    const queueCommand = (command: InlineCommand): void => {
      commandExecution = commandExecution
        .then(async () => executeInlineCommand(command))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          pushEvent(`Command pipeline error: ${message}`, "critical");
          renderInteractiveSnapshot();
        });
    };

    let keypressBound = false;
    const keypressHandler = (str: string, key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        requestStop("SIGINT");
        return;
      }

      if (str === "?" && !key.ctrl && !key.meta && interactionMode === "command" && inputBuffer.length === 0) {
        queueCommand({ kind: "help" });
        return;
      }

      const action = mapFunctionKeyToAction(key);
      if (action === "help") {
        queueCommand({ kind: "help" });
        return;
      }
      if (action === "new") {
        interactionMode = "command";
        inputBuffer = "new \"\" --type Feature";
        pushEvent("F2 loaded new-task template in prompt.");
        renderInteractiveSnapshot();
        return;
      }
      if (action === "pause_toggle") {
        paused = !paused;
        pushEvent(paused ? "Engine paused (F3)." : "Engine resumed (F3).");
        renderInteractiveSnapshot();
        return;
      }
      if (action === "toggle_log_view") {
        logViewMode = logViewMode === "console" ? "event_stream" : "console";
        pushEvent(logViewMode === "console" ? "View switched to CONSOLE." : "View switched to EVENT STREAM.");
        renderInteractiveSnapshot();
        return;
      }
      if (action === "stop") {
        requestStop("SIGTERM");
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const submitted = inputBuffer.trim();
        inputBuffer = "";
        if (!submitted) {
          renderInteractiveSnapshot();
          return;
        }

        const command = interactionMode === "human_input"
          ? parseHumanInputCommand(submitted, preferredHumanTaskId)
          : parseInlineCommand(submitted, preferredHumanTaskId);
        queueCommand(command);
        renderInteractiveSnapshot();
        return;
      }

      if (key.name === "backspace" || key.name === "delete") {
        inputBuffer = inputBuffer.slice(0, -1);
        renderInteractiveSnapshot();
        return;
      }

      if (key.ctrl || key.meta) return;
      if (!str) return;
      if (/\r|\n/.test(str)) return;
      if (/^[\x20-\x7E]$/.test(str)) {
        inputBuffer += str;
        if (inputBuffer.length > 320) {
          inputBuffer = inputBuffer.slice(0, 320);
        }
        renderInteractiveSnapshot();
      }
    };

    if (progressEnabled && process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on("keypress", keypressHandler);
      process.stdin.resume();
      keypressBound = true;
      pushEvent("Inline command mode active. Use ? or F1 for help. Press F4 to switch Console/Event Stream.");
      renderInteractiveSnapshot();
    }

    process.on("SIGINT", requestStop);
    process.on("SIGTERM", requestStop);
    try {
      while (!stopRequested) {
        const loopStartedAtMs = Date.now();
        loop += 1;
        const taskIds = await allTaskIds();
        const outcomes = paused ? [] : await processTasksWithConcurrency(taskIds, taskConcurrency);
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

        const metas = await loadMetasSafe(taskIds);
        latestMetas = metas;
        const humanTask = resolveHumanTask(metas);
        const previousHumanTaskId = preferredHumanTaskId;
        preferredHumanTaskId = humanTask?.taskId || "";
        humanInputLines = buildHumanInputLines(humanTask);
        if (preferredHumanTaskId) {
          interactionMode = "human_input";
          if (preferredHumanTaskId !== previousHumanTaskId) {
            pushEvent(`Human input required for ${preferredHumanTaskId}. Prompt focus switched.`);
          }
        } else if (interactionMode === "human_input") {
          interactionMode = "command";
          pushEvent("No pending human review. Prompt focus returned to command mode.");
        }

        const activeTaskCount = metas.filter((meta) => ["new", "in_progress", "waiting_agent"].includes(meta.status)).length;
        lastActiveTaskCount = activeTaskCount;
        renderInteractiveSnapshot();

        const decision = paused
          ? {
            action: "sleep" as const,
            reason: "engine paused via interactive control",
          }
          : decideLoopAction({
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

      if (keypressBound) {
        process.stdin.off("keypress", keypressHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }

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
