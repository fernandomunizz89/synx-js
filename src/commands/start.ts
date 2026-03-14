import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds } from "../lib/task.js";
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

export const startCommand = new Command("start")
  .description("Start the engine, recover unfinished work, and keep processing tasks")
  .option("--force", "start even when readiness checks fail")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

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

    let loop = 0;
    while (true) {
      loop += 1;
      const taskIds = await allTaskIds();

      for (const taskId of taskIds) {
        for (const worker of workers) {
          await worker.tryProcess(taskId);
        }
      }

      await writeDaemonState({
        pid: process.pid,
        lastHeartbeatAt: nowIso(),
        loop,
        taskCount: taskIds.length,
        workerCount: workers.length,
      });

      await sleep(POLL_INTERVAL_MS);
    }
  });
