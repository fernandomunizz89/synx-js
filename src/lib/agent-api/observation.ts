import type { TaskDetailDto } from "../observability/dto.js";
import type { ObservationResponse } from "../schema.js";

/** Polling hint in milliseconds by task status. */
export function deriveNextPollMs(status: string | undefined): number {
  switch (status) {
    case "new":
      return 5_000;
    case "in_progress":
      return 3_000;
    case "waiting_agent":
      return 4_000;
    case "waiting_human":
      return 10_000;
    case "blocked":
      return 15_000;
    case "done":
    case "failed":
    case "archived":
      return 60_000;
    default:
      return 10_000;
  }
}

export function deriveNeedsAction(detail: TaskDetailDto): {
  needsAction: boolean;
  actionRequired: "approve_or_reprove" | null;
} {
  const needsAction = detail.status === "waiting_human" || detail.humanApprovalRequired === true;
  return {
    needsAction,
    actionRequired: needsAction ? "approve_or_reprove" : null,
  };
}

export function buildObservation(detail: TaskDetailDto | null, taskId?: string): ObservationResponse {
  if (!detail) {
    return {
      ok: true,
      observation: {
        taskId,
        needsAction: false,
        nextPollMs: 10_000,
        message: "Task not found.",
      },
    };
  }

  const { needsAction, actionRequired } = deriveNeedsAction(detail);

  return {
    ok: true,
    observation: {
      taskId: detail.taskId,
      status: detail.status,
      currentAgent: detail.currentAgent,
      needsAction,
      actionRequired,
      output: detail.doneArtifacts.at(-1),
      history: detail.history,
      nextPollMs: deriveNextPollMs(detail.status),
      message: `Task is ${detail.status}.`,
    },
  };
}
