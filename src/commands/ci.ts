import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { workerList as workers } from "../workers/index.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { logRuntimeEvent, writeDaemonState, logDaemon } from "../lib/logging.js";
import { processTasksWithConcurrency } from "../lib/start/task-management.js";
import { resolvePollIntervalMs, resolveMaxImmediateCycles, resolveTaskConcurrency } from "../lib/start/loop-utils.js";
import { persistProjectGraphState } from "../lib/project-graph.js";
import { sleep, nowIso } from "../lib/utils.js";
import type { TaskStatus } from "../lib/types.js";

const TERMINAL_STATUSES: TaskStatus[] = ["done", "failed", "blocked", "archived"];

export const ciCommand = new Command("ci")
  .description("CI/CD mode: process all pending tasks non-interactively, then exit with status code")
  .option("--timeout <ms>", "maximum runtime in milliseconds (default: 600000)", "600000")
  .option("--dry-run", "simulate workspace edits without writing files")
  .option("--fail-fast", "exit immediately when any task fails")
  .action(async (options: { timeout: string; dryRun?: boolean; failFast?: boolean }) => {
    const timeoutMs = Math.max(10_000, parseInt(options.timeout, 10) || 600_000);
    const startMs = Date.now();

    if (options.dryRun) {
      process.env.AI_AGENTS_DRY_RUN = "1";
    }
    // Always stream in CI mode — no interactive TUI
    process.env.SYNX_STREAM_STDOUT = "1";

    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    await clearStaleLocks();
    await recoverWorkingFiles();
    await recoverInterruptedTasks();

    await logDaemon("SYNX CI mode started.");
    await logRuntimeEvent({
      event: "engine.started",
      source: "ci-command",
      payload: { pid: process.pid, ci: true, timeoutMs },
    });
    await writeDaemonState({
      pid: process.pid,
      lastHeartbeatAt: nowIso(),
      loop: 0,
      taskCount: 0,
      workerCount: workers.length,
    });

    const pollIntervalMs = resolvePollIntervalMs();
    const maxImmediateCycles = resolveMaxImmediateCycles();
    const taskConcurrency = resolveTaskConcurrency();
    let loop = 0;
    let totalProcessedStages = 0;

    try {
      while (Date.now() - startMs < timeoutMs) {
        loop += 1;
        const taskIds = await allTaskIds();
        const loopMetas = await Promise.all(taskIds.map((taskId) => loadTaskMeta(taskId)));
        const scheduling = await persistProjectGraphState(loopMetas);
        const outcomes = await processTasksWithConcurrency(scheduling.readyTaskIds, taskConcurrency);
        const processedStages = outcomes.reduce((sum, o) => sum + o.processedStages, 0);
        totalProcessedStages += processedStages;

        const metas = await Promise.all(taskIds.map((id) => loadTaskMeta(id)));
        const failedTasks = metas.filter((m) => m.status === "failed");
        const waitingHuman = metas.filter((m) => m.status === "waiting_human");
        const allTerminal = metas.length > 0 && metas.every((m) => TERMINAL_STATUSES.includes(m.status));

        await writeDaemonState({
          pid: process.pid,
          lastHeartbeatAt: nowIso(),
          loop,
          taskCount: taskIds.length,
          workerCount: workers.length,
          activeTaskCount: metas.filter((m) => m.status === "in_progress").length,
          processedStagesLastLoop: processedStages,
          totalProcessedStages,
          pollIntervalMs,
          maxImmediateCycles,
          taskConcurrency,
        });

        if (waitingHuman.length > 0) {
          console.log(`[SYNX CI] ${waitingHuman.length} task(s) waiting for human review — exiting with code 3.`);
          console.log(waitingHuman.map((m) => `  - ${m.taskId}: ${m.title}`).join("\n"));
          process.exit(3);
        }

        if (options.failFast && failedTasks.length > 0) {
          console.log(`[SYNX CI] --fail-fast: ${failedTasks.length} task(s) failed — exiting with code 1.`);
          process.exit(1);
        }

        if (allTerminal) {
          const exitCode = failedTasks.length > 0 ? 1 : 0;
          console.log(
            `[SYNX CI] All tasks terminal. ${failedTasks.length} failed, ${metas.length - failedTasks.length} succeeded. Exit code: ${exitCode}`,
          );
          process.exit(exitCode);
        }

        if (processedStages === 0) {
          await sleep(pollIntervalMs);
        }
      }

      console.log(`[SYNX CI] Timeout (${timeoutMs}ms) reached — exiting with code 2.`);
      process.exit(2);
    } finally {
      await logDaemon("SYNX CI mode finished.");
      await logRuntimeEvent({
        event: "engine.stopped",
        source: "ci-command",
        payload: { ci: true, loop, totalProcessedStages },
      });
    }
  });
