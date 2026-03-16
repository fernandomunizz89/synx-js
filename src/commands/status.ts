import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import type { TaskMeta } from "../lib/types.js";

function taskUpdatedAtMs(meta: TaskMeta): number {
  const timestamp = meta.updatedAt || meta.createdAt;
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function byMostRecent(a: TaskMeta, b: TaskMeta): number {
  return taskUpdatedAtMs(b) - taskUpdatedAtMs(a);
}

function printTask(meta: TaskMeta): void {
  console.log(`\n${meta.taskId}`);
  console.log(`- Title: ${meta.title}`);
  console.log(`- Type: ${meta.type}`);
  console.log(`- Status: ${meta.status}`);
  console.log(`- Current stage: ${meta.currentStage}`);
  console.log(`- Current agent: ${meta.currentAgent || "[none]"}`);
  console.log(`- Next agent: ${meta.nextAgent || "[none]"}`);
  console.log(`- Human approval required: ${meta.humanApprovalRequired ? "yes" : "no"}`);
  console.log(`- History items: ${meta.history.length}`);
}

function pickFocusedTask(metas: TaskMeta[]): { meta: TaskMeta; reason: string } {
  const sorted = [...metas].sort(byMostRecent);

  const waitingHuman = sorted.find((x) => x.status === "waiting_human");
  if (waitingHuman) {
    return {
      meta: waitingHuman,
      reason: "Showing the task waiting for your approval.",
    };
  }

  const active = sorted.find((x) => ["new", "in_progress", "waiting_agent"].includes(x.status));
  if (active) {
    return {
      meta: active,
      reason: "Showing the current task in progress.",
    };
  }

  const latestDone = sorted.find((x) => x.status === "done");
  if (latestDone) {
    return {
      meta: latestDone,
      reason: "No active task found. Showing the latest completed task.",
    };
  }

  const latestFailed = sorted.find((x) => x.status === "failed");
  if (latestFailed) {
    return {
      meta: latestFailed,
      reason: "No active/done task found. Showing the latest failed task.",
    };
  }

  return {
    meta: sorted[0],
    reason: "Showing the most recently updated task.",
  };
}

export const statusCommand = new Command("status")
  .description("Show human-friendly task status")
  .option("--all", "show all tasks instead of focused view")
  .action(async (options: { all?: boolean }) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const readiness = await collectReadinessReport({ includeProviderChecks: false });
    printReadinessReport(readiness, "Readiness checks");

    const ids = await allTaskIds();
    if (!ids.length) {
      console.log("\nNo tasks found.");
      console.log(`Next step: run \`${commandExample("new")}\` to create a task.`);
      return;
    }

    const metas = await Promise.all(ids.map((taskId) => loadTaskMeta(taskId)));

    const counts = {
      active: metas.filter((x) => ["new", "in_progress", "waiting_agent"].includes(x.status)).length,
      waitingHuman: metas.filter((x) => x.status === "waiting_human").length,
      failed: metas.filter((x) => x.status === "failed").length,
      done: metas.filter((x) => x.status === "done").length,
    };

    console.log("\nTask summary");
    console.log(`- Active: ${counts.active}`);
    console.log(`- Waiting for you: ${counts.waitingHuman}`);
    console.log(`- Failed: ${counts.failed}`);
    console.log(`- Done: ${counts.done}`);

    if (options.all) {
      console.log("\nTasks (all)");
      for (const meta of [...metas].sort(byMostRecent)) {
        printTask(meta);
      }
    } else {
      const focused = pickFocusedTask(metas);
      console.log("\nFocused task");
      console.log(`- ${focused.reason}`);
      printTask(focused.meta);

      const hidden = metas.length - 1;
      if (hidden > 0) {
        console.log(`\nShowing focused view. ${hidden} other task(s) are hidden.`);
        console.log(`Use \`${commandExample("status --all")}\` to list every task.`);
      }
    }

    if (counts.waitingHuman > 0) {
      console.log(`\nNext step: run \`${commandExample("approve")}\` to close reviewed tasks or \`${commandExample("reprove")}\` to return them to implementation.`);
    } else if (counts.failed > 0 && counts.active === 0) {
      console.log(`\nNext step: run \`${commandExample("doctor")}\` to diagnose failures.`);
    } else if (counts.active === 0) {
      console.log(`\nNext step: run \`${commandExample("new")}\` to create another task.`);
    } else {
      console.log(`\nNext step: keep \`${commandExample("start")}\` running and check again with \`${commandExample("status")}\`.`);
    }
  });
