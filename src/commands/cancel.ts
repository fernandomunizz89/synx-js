import { Command } from "commander";
import { allTaskIds, loadTaskMeta } from "../lib/task.js";
import { commandExample } from "../lib/cli-command.js";
import { cancelTaskService } from "../lib/services/task-services.js";

const CANCELLABLE_STATUSES = new Set(["new", "in_progress", "waiting_agent"]);

async function pickDefaultTaskId(): Promise<string | null> {
  const ids = await allTaskIds();
  if (!ids.length) return null;

  const metas = await Promise.all(
    ids.map(async (taskId) => {
      try {
        return await loadTaskMeta(taskId);
      } catch {
        return null;
      }
    }),
  );

  const candidates = metas
    .filter((meta): meta is NonNullable<typeof meta> => Boolean(meta))
    .filter((meta) => CANCELLABLE_STATUSES.has(meta.status))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return candidates[0]?.taskId || null;
}

export const cancelCommand = new Command("cancel")
  .description("Request cancellation for an active task")
  .argument("[taskId]", "task id to cancel (defaults to most recently active task)")
  .option("--reason <text>", "optional cancellation reason")
  .action(async (taskId: string | undefined, options: { reason?: string }) => {
    const selectedTaskId = (taskId || "").trim() || await pickDefaultTaskId();
    if (!selectedTaskId) {
      throw new Error(`No active task found to cancel. Create one with \`${commandExample("new")}\`.`);
    }

    const meta = await loadTaskMeta(selectedTaskId);
    if (!CANCELLABLE_STATUSES.has(meta.status)) {
      throw new Error(
        `Task ${selectedTaskId} is in status '${meta.status}' and cannot be cancelled via runtime request.`,
      );
    }

    await cancelTaskService({
      taskId: selectedTaskId,
      reason: options.reason,
    });

    console.log(`Cancellation requested for ${selectedTaskId}.`);
    console.log(`Next step: keep \`${commandExample("start")}\` running so active stages can stop gracefully.`);
  });
