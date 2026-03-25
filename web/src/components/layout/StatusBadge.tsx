import type { TaskStatus, TaskType } from "../../types.js";

const STATUS_COLORS: Record<TaskStatus, string> = {
  new:            "var(--blue)",
  in_progress:    "var(--teal)",
  waiting_agent:  "var(--purple)",
  waiting_human:  "var(--orange)",
  blocked:        "var(--red)",
  failed:         "var(--red)",
  done:           "var(--green)",
  archived:       "var(--muted)",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  new:            "New",
  in_progress:    "In Progress",
  waiting_agent:  "Waiting Agent",
  waiting_human:  "Waiting Human",
  blocked:        "Blocked",
  failed:         "Failed",
  done:           "Done",
  archived:       "Archived",
};

const TYPE_COLORS: Record<TaskType, string> = {
  Feature:       "var(--blue)",
  Bug:           "var(--red)",
  Refactor:      "var(--purple)",
  Research:      "var(--teal)",
  Documentation: "var(--muted)",
  Mixed:         "var(--orange)",
  Project:       "var(--yellow)",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 500,
      padding: "2px 7px",
      borderRadius: 100,
      border: `1px solid ${STATUS_COLORS[status]}44`,
      color: STATUS_COLORS[status],
      background: `${STATUS_COLORS[status]}18`,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: STATUS_COLORS[status],
        display: "inline-block",
      }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function TypeBadge({ type }: { type: TaskType }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: "1px 6px",
      borderRadius: 4,
      color: TYPE_COLORS[type],
      background: `${TYPE_COLORS[type]}18`,
      border: `1px solid ${TYPE_COLORS[type]}33`,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}>
      {type}
    </span>
  );
}

export function PriorityDot({ priority }: { priority?: number }) {
  if (!priority) return null;
  const colors = ["", "var(--muted)", "var(--blue)", "var(--orange)", "var(--red)", "var(--red)"];
  return (
    <span title={`Priority ${priority}`} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
      fontSize: 11,
      color: colors[priority] ?? "var(--muted)",
    }}>
      {"▲".repeat(Math.min(priority, 3))}
    </span>
  );
}
