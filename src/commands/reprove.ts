import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { STAGE_FILE_NAMES } from "../lib/constants.js";
import { confirmAction, selectOption } from "../lib/interactive.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import type { AgentName, TaskType } from "../lib/types.js";
import { reproveTaskService } from "../lib/services/task-services.js";
import { applyTaskRollback, type RollbackSummary } from "../lib/services/task-rollback.js";

type RollbackMode = "none" | "task";

function parseRollbackMode(value: string | undefined): RollbackMode {
  const normalized = String(value || "none").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "off" || normalized === "false") return "none";
  if (normalized === "task" || normalized === "scoped") return "task";
  throw new Error(`Invalid --rollback value "${value}". Use: none | task`);
}

function remediationTarget(taskType: TaskType): {
  agent: AgentName;
  stage: string;
  requestFileName: string;
} {
  if (taskType === "Bug") {
    return {
      agent: "Synx QA Engineer",
      stage: "synx-qa-engineer",
      requestFileName: STAGE_FILE_NAMES.synxQaEngineer,
    };
  }

  return {
    agent: "Synx Front Expert",
    stage: "synx-front-expert",
    requestFileName: STAGE_FILE_NAMES.synxFrontExpert,
  };
}

export const reproveCommand = new Command("reprove")
  .description("Reject human review and return the task to implementation")
  .option("--task-id <taskId>", "task id")
  .option("--reason <reason>", "human rejection reason")
  .option("--rollback <mode>", "rollback mode: none | task", "none")
  .option("--yes", "skip confirmation prompt")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const readiness = await collectReadinessReport({ includeProviderChecks: false });
    printReadinessReport(readiness, "Readiness checks");

    const rollbackMode = parseRollbackMode(options.rollback as string | undefined);
    const reason = String(options.reason || "").trim();

    let taskId = options.taskId as string | undefined;
    if (!taskId) {
      const taskIds = await allTaskIds();
      if (!taskIds.length) {
        console.log("\nNo tasks found.");
        console.log(`Next step: run \`${commandExample("new")}\` to create your first task.`);
        return;
      }

      const metas = await Promise.all(taskIds.map((id) => loadTaskMeta(id)));
      const waiting = metas
        .filter((meta) => meta.humanApprovalRequired || meta.status === "waiting_human")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (!waiting.length) {
        console.log("\nNo tasks are waiting for human review.");
        console.log(`Next step: run \`${commandExample("status")}\` to see active and failed tasks.`);
        return;
      }

      if (options.yes && waiting.length === 1) {
        taskId = waiting[0].taskId;
        console.log(`\nSingle pending task found. Auto-selected: ${taskId}`);
      } else {
        taskId = await selectOption(
          "Choose task to reprove",
          waiting.map((meta) => ({
            value: meta.taskId,
            label: `${meta.taskId} | ${meta.title}`,
            description: `Type: ${meta.type} | Stage: ${meta.currentStage}`,
          })),
          waiting[0].taskId,
        );
      }
    }

    const meta = await loadTaskMeta(taskId);
    if (!meta.humanApprovalRequired) {
      console.log("\nThis task is not waiting for human review.");
      console.log(`Next step: run \`${commandExample("status")}\` to see which tasks need action.`);
      return;
    }

    const target = remediationTarget(meta.type);

    if (!options.yes) {
      const rollbackLabel = rollbackMode === "task" ? " with task-scoped rollback" : "";
      const confirmed = await confirmAction(`Reprove task ${taskId} and return it to ${target.agent}${rollbackLabel}?`, true);
      if (!confirmed) {
        console.log("\nReprove canceled.");
        return;
      }
    }

    let rollbackSummary: RollbackSummary | null = null;
    if (rollbackMode === "task") {
      rollbackSummary = await applyTaskRollback(taskId);
    }

    const outcome = await reproveTaskService({
      taskId,
      reason,
      rollbackMode,
      rollbackSummary,
    });

    console.log(`\nTask reproved: ${taskId}`);
    console.log(`- Returned to: ${outcome.targetAgent}`);
    if (reason) console.log(`- Reason: ${reason}`);
    if (rollbackMode === "task" && rollbackSummary) {
      console.log(`- Rollback requested files: ${rollbackSummary.requested}`);
      console.log(`- Tracked files restored: ${rollbackSummary.trackedRestored.length}`);
      console.log(`- Untracked files removed: ${rollbackSummary.untrackedRemoved.length}`);
      console.log(`- Files skipped: ${rollbackSummary.skipped.length}`);
      if (rollbackSummary.warnings.length) {
        for (const warning of rollbackSummary.warnings.slice(0, 6)) {
          console.log(`- Rollback warning: ${warning}`);
        }
      }
    } else {
      console.log("- Rollback: none (use --rollback task to revert task-scoped files explicitly)");
    }
    console.log(`Next step: keep \`${commandExample("start")}\` running and monitor with \`${commandExample("status")}\`.`);
  });
