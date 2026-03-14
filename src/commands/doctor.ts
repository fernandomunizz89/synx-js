import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { exists } from "../lib/fs.js";
import { globalConfigPath, aiRoot, promptsDir, tasksDir } from "../lib/paths.js";
import { loadResolvedProjectConfig } from "../lib/config.js";
import { checkProviderHealth } from "../lib/provider-health.js";
import { listDirectories } from "../lib/fs.js";
import { providerHealthToHuman } from "../lib/human-messages.js";
import { confirmAction } from "../lib/interactive.js";
import { clearStaleLocks, detectInterruptedTasks, detectStaleLocks, detectWorkingOrphans, recoverInterruptedTasks, recoverWorkingFiles } from "../lib/runtime.js";
import { commandExample } from "../lib/cli-command.js";

export const doctorCommand = new Command("doctor")
  .description("Run human-friendly diagnostics")
  .option("--fix", "apply safe fixes after diagnostics")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const checks: Array<{ label: string; ok: boolean; message: string }> = [];

    checks.push({
      label: "Global config",
      ok: await exists(globalConfigPath()),
      message: await exists(globalConfigPath()) ? "Found global config." : "Missing global config.",
    });

    checks.push({
      label: "Local .ai-agents",
      ok: await exists(aiRoot()),
      message: await exists(aiRoot()) ? "Found local .ai-agents folder." : "Missing local .ai-agents folder.",
    });

    checks.push({
      label: "Prompts",
      ok: await exists(promptsDir()),
      message: await exists(promptsDir()) ? "Prompt folder exists." : "Prompt folder is missing.",
    });

    const config = await loadResolvedProjectConfig();
    checks.push({
      label: "Human reviewer",
      ok: Boolean(config.humanReviewer.trim()),
      message: config.humanReviewer.trim()
        ? `Configured as "${config.humanReviewer}".`
        : `Missing reviewer name. Run \`${commandExample("setup")}\` to set it explicitly.`,
    });

    const dispatcherHealth = await checkProviderHealth(config.providers.dispatcher);
    const plannerHealth = await checkProviderHealth(config.providers.planner);

    checks.push({
      label: "Dispatcher provider",
      ok: dispatcherHealth.reachable && (dispatcherHealth.modelFound ?? true),
      message: providerHealthToHuman(dispatcherHealth.message),
    });

    checks.push({
      label: "Planner provider",
      ok: plannerHealth.reachable && (plannerHealth.modelFound ?? true),
      message: providerHealthToHuman(plannerHealth.message),
    });

    const taskFolders = await (await exists(tasksDir()) ? listDirectories(tasksDir()) : Promise.resolve([]));
    checks.push({
      label: "Task storage",
      ok: true,
      message: `${taskFolders.length} task folder(s) found.`,
    });

    const staleLocks = await detectStaleLocks();
    checks.push({
      label: "Stale locks",
      ok: staleLocks.length === 0,
      message: staleLocks.length ? `${staleLocks.length} stale lock(s) can be cleaned.` : "No stale locks found.",
    });

    const orphanWorking = await detectWorkingOrphans();
    checks.push({
      label: "Orphan working files",
      ok: orphanWorking.length === 0,
      message: orphanWorking.length ? `${orphanWorking.length} working file(s) can be recovered safely.` : "No orphan working files found.",
    });

    const interruptedTasks = await detectInterruptedTasks();
    const recoverableInterrupted = interruptedTasks.filter((item) => item.action === "requeued");
    const unresolvedInterrupted = interruptedTasks.filter((item) => item.action !== "requeued");
    checks.push({
      label: "Interrupted tasks",
      ok: interruptedTasks.length === 0,
      message: interruptedTasks.length
        ? `${recoverableInterrupted.length} recoverable and ${unresolvedInterrupted.length} requiring manual review.`
        : "No interrupted tasks found.",
    });

    console.log("\nDoctor results");
    for (const check of checks) {
      console.log(`${check.ok ? "✓" : "✗"} ${check.label}: ${check.message}`);
    }

    const hasIssues = checks.some((check) => !check.ok);
    if (!hasIssues) {
      console.log("\nEnvironment looks healthy.");
      console.log(`Next step: run \`${commandExample("new")}\` or \`${commandExample("status")}\`.`);
      return;
    }

    const shouldFix = options.fix ? true : await confirmAction("Run safe automatic fixes now?", false);
    if (!shouldFix) {
      console.log("\nNo fixes applied.");
      console.log(`Next step: run \`${commandExample("fix")}\` to repair issues.`);
      return;
    }

    const clearedLocks = await clearStaleLocks();
    const recoveredWorking = await recoverWorkingFiles();
    const recoveredTasks = await recoverInterruptedTasks();
    const unresolvedRecoveredTasks = recoveredTasks.filter((item) => item.action !== "requeued");

    console.log("\nFix summary");
    console.log(`- Stale locks cleared: ${clearedLocks.length}`);
    console.log(`- Working files recovered: ${recoveredWorking.length}`);
    console.log(`- Interrupted tasks requeued: ${recoveredTasks.filter((item) => item.action === "requeued").length}`);
    if (unresolvedRecoveredTasks.length) {
      console.log(`- Interrupted tasks still requiring manual review: ${unresolvedRecoveredTasks.length}`);
    }
    console.log(`Next step: run \`${commandExample("start")}\` or \`${commandExample("status")}\`.`);
  });
