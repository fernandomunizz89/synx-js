import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";

export const statusCommand = new Command("status")
  .description("Show human-friendly task status")
  .action(async () => {
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

    const metas = await Promise.all(ids.sort().map((taskId) => loadTaskMeta(taskId)));

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

    console.log("\nTasks");
    for (const meta of metas) {
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

    if (counts.waitingHuman > 0) {
      console.log(`\nNext step: run \`${commandExample("approve")}\` to close reviewed tasks.`);
    } else if (counts.failed > 0) {
      console.log(`\nNext step: run \`${commandExample("doctor")}\` to diagnose failures.`);
    } else if (counts.active === 0) {
      console.log(`\nNext step: run \`${commandExample("new")}\` to create another task.`);
    } else {
      console.log(`\nNext step: keep \`${commandExample("start")}\` running and check again with \`${commandExample("status")}\`.`);
    }
  });
