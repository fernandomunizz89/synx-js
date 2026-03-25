import { useCallback, useEffect, useState } from "react";
import { fetchTasks, approveTask, reproveTask, cancelTask } from "../api/tasks.js";
import { useStreamTaskUpdates } from "../api/stream.js";
import { StatusBadge, TypeBadge, PriorityDot } from "../components/layout/StatusBadge.js";
import type { TaskSummary } from "../types.js";

type SubTab = "all" | "review";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "";
  if (usd < 0.001) return `<$0.001`;
  return `$${usd.toFixed(3)}`;
}

function taskTotalMs(task: TaskSummary): number {
  return task.history.reduce((sum, h) => sum + h.durationMs, 0);
}

function taskTotalCost(task: TaskSummary): number {
  return task.history.reduce((sum, h) => sum + (h.estimatedCostUsd ?? 0), 0);
}

function ReproveModal({
  taskId,
  onConfirm,
  onClose,
}: {
  taskId: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 24,
        width: 400,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
          Reprove task
        </h3>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Task <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{taskId}</code>
        </p>
        <textarea
          placeholder="Reason for reproval (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--fg)",
            fontSize: 13,
            padding: "8px 10px",
            resize: "vertical",
            outline: "none",
            fontFamily: "var(--font)",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle("var(--bg3)", "var(--muted)")}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            style={btnStyle("var(--red)22", "var(--red)")}
          >
            Reprove
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: "6px 14px", cursor: "pointer",
    fontSize: 12, fontWeight: 500,
  };
}

function TaskRow({
  task,
  onApprove,
  onReprove,
  onCancel,
}: {
  task: TaskSummary;
  onApprove: (id: string) => void;
  onReprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const totalMs = taskTotalMs(task);
  const totalCost = taskTotalCost(task);
  const isTerminal = task.status === "done" || task.status === "archived";
  const canAct = task.humanApprovalRequired || !isTerminal;

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={td()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 13, color: "var(--fg)", fontWeight: 500 }}>
            {task.parentTaskId && (
              <span style={{ color: "var(--muted)", marginRight: 6 }}>↳</span>
            )}
            {task.title}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            {task.taskId}
          </span>
        </div>
      </td>
      <td style={td()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <TypeBadge type={task.type} />
          {task.priority !== undefined && <PriorityDot priority={task.priority} />}
        </div>
      </td>
      <td style={td()}><StatusBadge status={task.status} /></td>
      <td style={td()}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{task.project}</span>
      </td>
      <td style={td()}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {task.currentAgent || task.nextAgent || "—"}
        </span>
      </td>
      <td style={td()}>
        <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 2 }}>
          {totalMs > 0 && <span>{formatDuration(totalMs)}</span>}
          {totalCost > 0 && <span style={{ color: "var(--yellow)" }}>{formatCost(totalCost)}</span>}
        </div>
      </td>
      <td style={td()}>
        {canAct && (
          <div style={{ display: "flex", gap: 6 }}>
            {task.humanApprovalRequired && (
              <>
                <button onClick={() => onApprove(task.taskId)} style={btnStyle("var(--green)22", "var(--green)")}>
                  ✓ Approve
                </button>
                <button onClick={() => onReprove(task.taskId)} style={btnStyle("var(--orange)22", "var(--orange)")}>
                  ✗ Reprove
                </button>
              </>
            )}
            {!isTerminal && (
              <button onClick={() => onCancel(task.taskId)} style={btnStyle("var(--bg3)", "var(--muted)")}>
                ✕ Cancel
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function td(): React.CSSProperties {
  return { padding: "10px 14px", verticalAlign: "middle" };
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [subTab, setSubTab] = useState<SubTab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reproveTarget, setReproveTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useStreamTaskUpdates(load);

  const handle = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const flat = tasks.flatMap((t) => [t, ...(t.children ?? [])]);

  const reviewQueue = flat.filter((t) => t.humanApprovalRequired);

  const filtered = (subTab === "review" ? reviewQueue : flat).filter((t) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.taskId.includes(q) ||
      t.project.toLowerCase().includes(q) ||
      t.currentAgent.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {reproveTarget && (
        <ReproveModal
          taskId={reproveTarget}
          onConfirm={(reason) => {
            void handle(() => reproveTask(reproveTarget, reason));
            setReproveTarget(null);
          }}
          onClose={() => setReproveTarget(null)}
        />
      )}

      {/* Sub-tabs + filter */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "review"] as SubTab[]).map((id) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              style={{
                padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                border: "1px solid var(--border)",
                background: subTab === id ? "var(--teal-dim)" : "var(--bg2)",
                color: subTab === id ? "var(--teal)" : "var(--muted)",
                fontWeight: subTab === id ? 600 : 400,
              }}
            >
              {id === "all" ? `All (${flat.length})` : `Review Queue (${reviewQueue.length})`}
            </button>
          ))}
        </div>

        <input
          placeholder="Filter tasks..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--fg)", fontSize: 12,
            padding: "5px 10px", width: 220, outline: "none",
          }}
        />
      </div>

      {actionError && (
        <div style={{
          padding: "8px 20px", background: "var(--red)18",
          borderBottom: "1px solid var(--red)44",
          color: "var(--red)", fontSize: 12,
        }}>
          {actionError}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Loading tasks…
          </div>
        )}
        {error && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--red)", fontSize: 13 }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {filter ? "No tasks match your filter." : "No tasks yet."}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
                {["Task", "Type", "Status", "Project", "Agent", "Cost/Time", "Actions"].map((h) => (
                  <th key={h} style={{
                    padding: "8px 14px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <TaskRow
                  key={task.taskId}
                  task={task}
                  onApprove={(id) => void handle(() => approveTask(id))}
                  onReprove={(id) => setReproveTarget(id)}
                  onCancel={(id) => void handle(() => cancelTask(id))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
