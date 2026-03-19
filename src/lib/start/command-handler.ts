import path from "node:path";
import { allTaskIds, createTask, loadTaskMeta, saveTaskMeta } from "../task.js";
import { logTaskEvent } from "../logging.js";
import { writeJson } from "../fs.js";
import { nowIso } from "../utils.js";
import { taskDir } from "../paths.js";
import { DONE_FILE_NAMES } from "../constants.js";
import type { InlineCommand } from "../start-inline-command.js";
import type { StageEnvelope } from "../types.js";
import { remediationTarget, summarizeTaskCounts, pickFocusedTask, loadMetasSafe, byMostRecent } from "./task-management.js";
import { resolveTaskQaPreferences } from "../qa-preferences.js";

export interface CommandHandlerContext {
  pushEvent: (message: string, level?: "info" | "critical") => void;
  requestStop: (signal: NodeJS.Signals) => void;
}

export async function runInlineCommand(command: InlineCommand, context: CommandHandlerContext): Promise<void> {
  const { pushEvent, requestStop } = context;

  if (command.kind === "help") {
    pushEvent("Commands: new \"title\" --type Bug|Feature|Refactor|Research|Documentation|Mixed");
    pushEvent("Commands: status [--all] | approve [--task-id] | reprove --reason \"...\" [--task-id] | stop");
    pushEvent("Shortcuts: ?/F1 Show help | F2 New task template | F3 Pause/Resume | F4 Toggle Console/Event Stream | F10 Exit");
    return;
  }

  if (command.kind === "stop") {
    requestStop("SIGTERM");
    return;
  }

  if (command.kind === "unknown") {
    pushEvent(command.message);
    return;
  }

  if (command.kind === "new") {
    const draftTaskInput = {
      title: command.title,
      typeHint: command.type,
      project: "",
      rawRequest: command.title,
      extraContext: {
        relatedFiles: [],
        logs: [],
        notes: [],
        qaPreferences: {
          e2ePolicy: "required" as const,
          e2eFramework: "auto" as const,
          objective: "",
        },
      },
    };
    const resolvedPreferences = resolveTaskQaPreferences(draftTaskInput);
    const { taskId } = await createTask({
      ...draftTaskInput,
      extraContext: {
        ...draftTaskInput.extraContext,
        qaPreferences: {
          ...draftTaskInput.extraContext.qaPreferences,
          objective: resolvedPreferences.objective,
        },
      },
    });
    pushEvent(`Task created: ${taskId} (${command.type})`);
    return;
  }

  if (command.kind === "status") {
    const ids = await allTaskIds();
    if (!ids.length) {
      pushEvent("No tasks found.");
      return;
    }

    const metas = await loadMetasSafe(ids);
    const counts = summarizeTaskCounts(metas);
    pushEvent(`Summary: active ${counts.active} | waiting ${counts.waitingHuman} | failed ${counts.failed} | done ${counts.done}`);

    if (command.all) {
      for (const meta of [...metas].sort(byMostRecent).slice(0, 4)) {
        pushEvent(`${meta.taskId} | ${meta.status} | ${meta.currentStage} | ${meta.currentAgent || "[none]"}`);
      }
    } else if (metas.length) {
      const focused = pickFocusedTask(metas);
      pushEvent(`Focused (${focused.reason}): ${focused.meta.taskId} | ${focused.meta.status} | ${focused.meta.currentStage}`);
    }
    return;
  }

  if (command.kind === "approve") {
    const meta = await loadTaskMeta(command.taskId);
    if (!meta.humanApprovalRequired) {
      pushEvent(`Task ${command.taskId} is not waiting for human approval.`);
      return;
    }

    meta.status = "done";
    meta.currentStage = "approved";
    meta.currentAgent = "Human Review";
    meta.nextAgent = "";
    meta.humanApprovalRequired = false;
    await saveTaskMeta(command.taskId, meta);
    await logTaskEvent(taskDir(command.taskId), "Human approval completed. Task marked as done.");
    pushEvent(`Task approved: ${command.taskId}`);
    return;
  }

  if (command.kind === "reprove") {
    const reason = command.reason.trim();
    if (!reason) {
      pushEvent("Reprove requires a non-empty reason.");
      return;
    }

    const meta = await loadTaskMeta(command.taskId);
    if (!meta.humanApprovalRequired) {
      pushEvent(`Task ${command.taskId} is not waiting for human review.`);
      return;
    }

    const target = remediationTarget(meta.type);
    const now = nowIso();
    const qaDoneRef = `done/${DONE_FILE_NAMES.synxQaEngineer}`;
    const nextInputRef = qaDoneRef;

    meta.status = "waiting_agent";
    meta.currentStage = "reproved";
    meta.currentAgent = "Human Review";
    meta.nextAgent = target.agent;
    meta.humanApprovalRequired = false;
    await saveTaskMeta(command.taskId, meta);

    const stageRequest: StageEnvelope = {
      taskId: command.taskId,
      stage: target.stage,
      status: "request",
      createdAt: now,
      agent: target.agent,
      inputRef: nextInputRef,
    };

    await writeJson(path.join(taskDir(command.taskId), "inbox", target.requestFileName), stageRequest);
    await writeJson(path.join(taskDir(command.taskId), "human", "90-final-review.reproved.json"), {
      taskId: command.taskId,
      stage: "human-review",
      status: "done",
      createdAt: now,
      agent: "Human Review",
      output: {
        decision: "reproved",
        returnedTo: target.agent,
        reason,
        rollbackMode: "none",
      },
    });
    await logTaskEvent(taskDir(command.taskId), `Human reprove completed. Task returned to ${target.agent}. Reason: ${reason}`);
    pushEvent(`Task reproved: ${command.taskId} -> ${target.agent}`);
  }
}
