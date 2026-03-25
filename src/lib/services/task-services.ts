/**
 * Phase 5 — Task Services
 *
 * Service functions for approving and reproving tasks,
 * including webhook delivery for key task events.
 */
import path from "node:path";
import { loadTaskMeta, saveTaskMeta } from "../task.js";
import { logTaskEvent } from "../logging.js";
import { taskDir } from "../paths.js";
import { deliverWebhook } from "../webhooks.js";
import type { AgentName, TaskType } from "../types.js";
import { DONE_FILE_NAMES, STAGE_FILE_NAMES } from "../constants.js";
import { writeJson } from "../fs.js";
import { nowIso } from "../utils.js";
import type { StageEnvelope } from "../types.js";

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

export interface ApproveTaskArgs {
  taskId: string;
}

export interface ReproveTaskArgs {
  taskId: string;
  reason?: string;
}

export async function approveTaskService(args: ApproveTaskArgs): Promise<void> {
  const { taskId } = args;
  const meta = await loadTaskMeta(taskId);

  meta.status = "done";
  meta.currentStage = "approved";
  meta.currentAgent = "Human Review";
  meta.nextAgent = "";
  meta.humanApprovalRequired = false;
  await saveTaskMeta(taskId, meta);
  await logTaskEvent(taskDir(taskId), "Human approval completed. Task marked as done.");

  await deliverWebhook("task.approved", taskId, { decision: "approved" });
}

export async function reproveTaskService(args: ReproveTaskArgs): Promise<void> {
  const { taskId } = args;
  const reason = String(args.reason || "").trim();
  const meta = await loadTaskMeta(taskId);

  const target = remediationTarget(meta.type);
  const now = nowIso();
  const qaDoneRef = `done/${DONE_FILE_NAMES.synxQaEngineer}`;
  const nextInputRef = qaDoneRef;

  meta.status = "waiting_agent";
  meta.currentStage = "reproved";
  meta.currentAgent = "Human Review";
  meta.nextAgent = target.agent;
  meta.humanApprovalRequired = false;
  await saveTaskMeta(taskId, meta);

  const stageRequest: StageEnvelope = {
    taskId,
    stage: target.stage,
    status: "request",
    createdAt: now,
    agent: target.agent,
    inputRef: nextInputRef,
  };

  await writeJson(path.join(taskDir(taskId), "inbox", target.requestFileName), stageRequest);
  await writeJson(path.join(taskDir(taskId), "human", "90-final-review.reproved.json"), {
    taskId,
    stage: "human-review",
    status: "done",
    createdAt: now,
    agent: "Human Review",
    output: {
      decision: "reproved",
      returnedTo: target.agent,
      reason: reason || "",
    },
  });

  await logTaskEvent(
    taskDir(taskId),
    `Human reprove completed. Task returned to ${target.agent}. Reason: ${reason || "[not provided]"}`,
  );

  await deliverWebhook("task.reproved", taskId, { decision: "reproved", reason, returnedTo: target.agent });
}
