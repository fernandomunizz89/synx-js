import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { allTaskIds, loadTaskMeta, saveTaskMeta } from "../lib/task.js";
import { logTaskEvent } from "../lib/logging.js";
import { taskDir } from "../lib/paths.js";
import { confirmAction, selectOption } from "../lib/interactive.js";
import { commandExample } from "../lib/cli-command.js";
import { collectReadinessReport, printReadinessReport } from "../lib/readiness.js";
import { loadPipelineState } from "../lib/pipeline-state.js";
import { recordPipelineApproval } from "../lib/learnings.js";

export const approveCommand = new Command("approve")
  .description("Approve the final human review and mark the task done")
  .option("--task-id <taskId>", "task id")
  .option("--yes", "skip confirmation prompt")
  .action(async (options) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();
    const readiness = await collectReadinessReport({ includeProviderChecks: false });
    printReadinessReport(readiness, "Readiness checks");

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
        console.log("\nNo tasks are waiting for human approval.");
        console.log(`Next step: run \`${commandExample("status")}\` to see active and failed tasks.`);
        return;
      }

      if (options.yes && waiting.length === 1) {
        taskId = waiting[0].taskId;
        console.log(`\nSingle pending task found. Auto-selected: ${taskId}`);
      } else {
        taskId = await selectOption(
          "Choose task to approve",
          waiting.map((meta) => ({
            value: meta.taskId,
            label: `${meta.taskId} | ${meta.title}`,
            description: `Type: ${meta.type} | Stage: ${meta.currentStage}`,
          })),
          waiting[0].taskId
        );
      }
    }

    const meta = await loadTaskMeta(taskId);

    if (!meta.humanApprovalRequired) {
      console.log("\nThis task is not waiting for human approval.");
      console.log(`Next step: run \`${commandExample("status")}\` to see which tasks need action.`);
      return;
    }

    if (!options.yes) {
      const confirmed = await confirmAction(`Approve task ${taskId} and mark it as done?`, true);
      if (!confirmed) {
        console.log("\nApproval canceled.");
        return;
      }
    }

    meta.status = "done";
    meta.currentStage = "approved";
    meta.currentAgent = "Human Review";
    meta.nextAgent = "";
    meta.humanApprovalRequired = false;
    await saveTaskMeta(taskId, meta);
    await logTaskEvent(taskDir(taskId), "Human approval completed. Task marked as done.");

    try {
      const pipelineState = await loadPipelineState(taskId);
      await recordPipelineApproval(taskId, pipelineState.pipelineId, pipelineState.completedSteps);
    } catch {
      // Not a pipeline task or state unavailable — skip learning record
    }

    console.log(`\nTask approved: ${taskId}`);
    console.log(`Next step: run \`${commandExample("status")}\` to check remaining work.`);
  });
