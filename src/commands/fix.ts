import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { confirmAction, selectMany } from "../lib/interactive.js";
import { clearStaleLocks, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { commandExample } from "../lib/cli-command.js";

type FixAction = "bootstrap" | "locks" | "working" | "tasks";

function resolveActionsFromFlags(options: { all?: boolean; bootstrap?: boolean; locks?: boolean; working?: boolean; tasks?: boolean }): FixAction[] {
  if (options.all) return ["bootstrap", "locks", "working", "tasks"];
  const selected: FixAction[] = [];
  if (options.bootstrap) selected.push("bootstrap");
  if (options.locks) selected.push("locks");
  if (options.working) selected.push("working");
  if (options.tasks) selected.push("tasks");
  return selected;
}

export const fixCommand = new Command("fix")
  .description("Repair common problems automatically")
  .option("--all", "run all safe fixes")
  .option("--bootstrap", "recreate missing global/local config and prompts")
  .option("--locks", "clear stale lock files")
  .option("--working", "recover orphan working files")
  .option("--tasks", "recover interrupted tasks without inbox/working files")
  .option("--yes", "skip confirmation prompt")
  .action(async (options) => {
    const opts = options as {
      all?: boolean;
      bootstrap?: boolean;
      locks?: boolean;
      working?: boolean;
      tasks?: boolean;
      yes?: boolean;
    };

    let actions = resolveActionsFromFlags(opts);
    if (!actions.length) {
      actions = await selectMany<FixAction>(
        "Choose fixes to apply",
        [
          { value: "bootstrap", label: "Recreate missing global/local config and prompts" },
          { value: "locks", label: "Clear stale lock files" },
          { value: "working", label: "Recover orphan working files" },
          { value: "tasks", label: "Recover interrupted tasks safely" },
        ],
        ["bootstrap", "locks", "working", "tasks"]
      );
    }

    if (!actions.length) {
      console.log("\nNo fix actions selected.");
      return;
    }

    if (!opts.yes) {
      const confirmed = await confirmAction("Apply selected fixes now?", true);
      if (!confirmed) {
        console.log("\nFix canceled.");
        return;
      }
    }

    let bootstrapApplied = false;
    if (actions.includes("bootstrap")) {
      await ensureGlobalInitialized();
      await ensureProjectInitialized();
      bootstrapApplied = true;
    }

    const staleLocks = actions.includes("locks") ? await clearStaleLocks() : [];
    const recoveredWorking = actions.includes("working") ? await recoverWorkingFiles() : [];
    const recoveredTasks = actions.includes("tasks") ? await recoverInterruptedTasks() : [];
    const unresolvedTasks = recoveredTasks.filter((item) => item.action !== "requeued");

    console.log("\nAutomatic fixes applied");
    if (actions.includes("bootstrap")) {
      console.log(`- Bootstrap repair: ${bootstrapApplied ? "done" : "skipped"}`);
    }
    if (actions.includes("locks")) {
      console.log(`- Stale locks cleared: ${staleLocks.length}`);
    }
    if (actions.includes("working")) {
      console.log(`- Working files recovered: ${recoveredWorking.length}`);
    }
    if (actions.includes("tasks")) {
      console.log(`- Interrupted tasks requeued: ${recoveredTasks.filter((item) => item.action === "requeued").length}`);
      if (unresolvedTasks.length) {
        console.log(`- Interrupted tasks that still need manual check: ${unresolvedTasks.length}`);
      }
    }
    console.log(`Next step: run \`${commandExample("doctor")}\` or \`${commandExample("start")}\`.`);
  });
