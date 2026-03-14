import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { commandExample } from "../lib/cli-command.js";

export const resumeCommand = new Command("resume")
  .description("Recover unfinished work so the engine can continue")
  .action(async () => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const staleLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();
    const unresolvedTasks = recoveredTasks.filter((item) => item.action !== "requeued");

    console.log("\nResume summary");
    console.log(`- Stale locks cleared: ${staleLocks.length}`);
    console.log(`- Working files recovered: ${recoveredWorking.length}`);
    console.log(`- Interrupted tasks requeued: ${recoveredTasks.filter((item) => item.action === "requeued").length}`);
    if (unresolvedTasks.length) {
      console.log(`- Interrupted tasks still needing manual review: ${unresolvedTasks.length}`);
    }
    console.log(`Next step: run \`${commandExample("start")}\` safely.`);
  });
