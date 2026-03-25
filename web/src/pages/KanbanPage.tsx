import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { fetchKanban, approveTask, reproveTask, cancelTask } from "../api/tasks.js";
import { useStreamTaskUpdates } from "../api/stream.js";
import { TypeBadge, PriorityDot } from "../components/layout/StatusBadge.js";
import type { KanbanBoard, KanbanCard, TaskStatus } from "../types.js";

// ── Column config ─────────────────────────────────────────────────────────────

interface ColumnDef {
  id: TaskStatus;
  label: string;
  color: string;
}

const COLUMNS: ColumnDef[] = [
  { id: "new",            label: "New",            color: "var(--blue)" },
  { id: "in_progress",    label: "In Progress",    color: "var(--teal)" },
  { id: "waiting_agent",  label: "Waiting Agent",  color: "var(--purple)" },
  { id: "waiting_human",  label: "Waiting Human",  color: "var(--orange)" },
  { id: "blocked",        label: "Blocked",        color: "var(--red)" },
  { id: "failed",         label: "Failed",         color: "var(--red)" },
  { id: "done",           label: "Done",           color: "var(--green)" },
];

// Valid drop targets for waiting_human cards (status → action)
const WAITING_HUMAN_TARGETS: Partial<Record<TaskStatus, "approve" | "reprove">> = {
  done:        "approve",
  in_progress: "reprove",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "";
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatCost(usd: number): string {
  if (!usd || usd <= 0) return "";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}

// ── Reprove modal ─────────────────────────────────────────────────────────────

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
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 24, width: 400,
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>Reprove task</h3>
        <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{taskId}</p>
        <textarea
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          style={{
            background: "var(--bg3)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--fg)", fontSize: 13,
            padding: "8px 10px", resize: "vertical", outline: "none",
            fontFamily: "var(--font)",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={pill("var(--bg3)", "var(--muted)")}>Cancel</button>
          <button onClick={() => onConfirm(reason)} style={pill("var(--red)22", "var(--red)")}>
            Reprove
          </button>
        </div>
      </div>
    </div>
  );
}

function pill(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: "5px 12px", cursor: "pointer",
    fontSize: 12, fontWeight: 500, fontFamily: "var(--font)",
  };
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function Card({
  card,
  onApprove,
  onReprove,
  onCancel,
  style: extraStyle,
}: {
  card: KanbanCard;
  onApprove: (id: string) => void;
  onReprove: (id: string) => void;
  onCancel: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const dur = formatDuration(card.totalDurationMs);
  const cost = formatCost(card.totalCostUsd);
  const isTerminal = card.status === "done" || card.status === "archived";

  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      cursor: "default",
      transition: "border-color 0.15s",
      ...extraStyle,
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--muted)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.4, flex: 1 }}>
          {card.parentTaskId && <span style={{ color: "var(--muted)", marginRight: 4 }}>↳</span>}
          {card.title}
        </span>
        <TypeBadge type={card.type} />
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{card.project}</span>
        {card.milestone && (
          <>
            <span style={{ color: "var(--border)" }}>·</span>
            <span style={{ fontSize: 10, color: "var(--purple)" }}>{card.milestone}</span>
          </>
        )}
        <PriorityDot priority={card.priority} />
      </div>

      {/* Agent */}
      {card.currentAgent && (
        <div style={{
          fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {card.currentAgent}
        </div>
      )}

      {/* Footer: stats + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--muted)" }}>
          {dur && <span>⏱ {dur}</span>}
          {cost && <span style={{ color: "var(--yellow)" }}>💰 {cost}</span>}
          {card.childTaskIds.length > 0 && (
            <span style={{ color: "var(--teal)" }}>⬜ {card.childTaskIds.length}</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {card.humanApprovalRequired && (
            <>
              <button
                onClick={() => onApprove(card.taskId)}
                title="Approve"
                style={iconBtn("var(--green)")}
              >✓</button>
              <button
                onClick={() => onReprove(card.taskId)}
                title="Reprove"
                style={iconBtn("var(--orange)")}
              >✗</button>
            </>
          )}
          {!isTerminal && !card.humanApprovalRequired && (
            <button
              onClick={() => onCancel(card.taskId)}
              title="Cancel"
              style={iconBtn("var(--muted)")}
            >✕</button>
          )}
        </div>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return {
    background: `${color}18`,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 5,
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    padding: 0,
    lineHeight: 1,
  };
}

// ── Draggable card wrapper ─────────────────────────────────────────────────────

function DraggableCard(props: {
  card: KanbanCard;
  onApprove: (id: string) => void;
  onReprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { card } = props;
  const draggable = card.status === "waiting_human";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.taskId,
    data: { card },
    disabled: !draggable,
  });

  const wrapStyle: React.CSSProperties = {
    opacity: isDragging ? 0.35 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default",
    userSelect: "none",
  };

  return (
    <div ref={setNodeRef} style={wrapStyle} {...attributes} {...(draggable ? listeners : {})}>
      {draggable && (
        <div style={{
          textAlign: "center", color: "var(--border)", fontSize: 10,
          letterSpacing: 3, lineHeight: 1, paddingBottom: 4,
          cursor: "grab",
        }}>
          ⠿⠿⠿
        </div>
      )}
      <Card {...props} />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({
  def,
  cards,
  onApprove,
  onReprove,
  onCancel,
  hidden,
  isDragTarget,
  isInvalidTarget,
}: {
  def: ColumnDef;
  cards: KanbanCard[];
  onApprove: (id: string) => void;
  onReprove: (id: string) => void;
  onCancel: (id: string) => void;
  hidden: boolean;
  isDragTarget: boolean;
  isInvalidTarget: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: def.id });

  if (hidden) return null;

  const dropActive = isDragTarget && isOver;
  const dropInvalid = isInvalidTarget && isOver;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: 240,
      flexShrink: 0,
      background: "var(--bg3)",
      borderRadius: 10,
      border: "1px solid var(--border)",
      overflow: "hidden",
      transition: "box-shadow 0.15s",
      boxShadow: dropActive
        ? "0 0 0 2px var(--teal)"
        : dropInvalid
          ? "0 0 0 2px var(--red)"
          : "none",
    }}>
      {/* Column header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: def.color,
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>{def.label}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: cards.length > 0 ? def.color : "var(--muted)",
          background: cards.length > 0 ? `${def.color}18` : "var(--bg3)",
          border: `1px solid ${cards.length > 0 ? def.color + "44" : "var(--border)"}`,
          borderRadius: 100,
          padding: "1px 7px",
          minWidth: 22, textAlign: "center",
        }}>
          {cards.length}
        </span>
      </div>

      {/* Cards — droppable area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minHeight: 80,
          background: dropActive
            ? "color-mix(in srgb, var(--teal) 8%, transparent)"
            : dropInvalid
              ? "color-mix(in srgb, var(--red) 6%, transparent)"
              : "transparent",
          transition: "background 0.15s",
        }}
      >
        {/* Drop hint when column is a valid target and nothing is in it */}
        {isDragTarget && cards.length === 0 && (
          <div style={{
            textAlign: "center", padding: "20px 8px",
            color: isOver ? "var(--teal)" : "var(--border)",
            fontSize: 11,
            border: `2px dashed ${isOver ? "var(--teal)" : "var(--border)"}`,
            borderRadius: 6,
            transition: "color 0.15s, border-color 0.15s",
          }}>
            Drop here
          </div>
        )}
        {!(isDragTarget && cards.length === 0) && cards.length === 0 && (
          <div style={{
            textAlign: "center", padding: "20px 8px",
            color: "var(--border)", fontSize: 11,
          }}>
            —
          </div>
        )}
        {cards.map((card) => (
          <DraggableCard
            key={card.taskId}
            card={card}
            onApprove={onApprove}
            onReprove={onReprove}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

type GroupBy = "status" | "project" | "milestone";

function Toolbar({
  groupBy,
  setGroupBy,
  filter,
  setFilter,
  hideDone,
  setHideDone,
  totalCards,
}: {
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  filter: string;
  setFilter: (f: string) => void;
  hideDone: boolean;
  setHideDone: (v: boolean) => void;
  totalCards: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 20px",
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", gap: 4 }}>
        {(["status", "project", "milestone"] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            style={{
              padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer",
              border: "1px solid var(--border)",
              background: groupBy === g ? "var(--teal-dim)" : "var(--bg2)",
              color: groupBy === g ? "var(--teal)" : "var(--muted)",
              fontWeight: groupBy === g ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {g}
          </button>
        ))}
      </div>

      <input
        placeholder="Filter cards…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 6, color: "var(--fg)", fontSize: 12,
          padding: "4px 10px", width: 200, outline: "none",
        }}
      />

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={hideDone}
          onChange={(e) => setHideDone(e.target.checked)}
          style={{ accentColor: "var(--teal)", cursor: "pointer" }}
        />
        Hide done & archived
      </label>

      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
        {totalCards} card{totalCards !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ── KanbanPage ────────────────────────────────────────────────────────────────

const EMPTY_BOARD: KanbanBoard = {
  new: [], in_progress: [], waiting_agent: [], waiting_human: [],
  blocked: [], failed: [], done: [], archived: [],
};

export function KanbanPage() {
  const [board, setBoard] = useState<KanbanBoard>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reproveTarget, setReproveTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [filter, setFilter] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [draggingCard, setDraggingCard] = useState<KanbanCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchKanban();
      setBoard(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kanban");
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

  const handleDragStart = ({ active }: DragStartEvent) => {
    const card = active.data.current?.card as KanbanCard | undefined;
    setDraggingCard(card ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingCard(null);
    if (!over || !active.data.current) return;

    const card = active.data.current.card as KanbanCard;
    const targetStatus = over.id as TaskStatus;
    const action = WAITING_HUMAN_TARGETS[targetStatus];

    if (card.status !== "waiting_human" || !action) return;

    if (action === "approve") {
      void handle(() => approveTask(card.taskId));
    } else if (action === "reprove") {
      setReproveTarget(card.taskId);
    }
  };

  const handleDragCancel = () => setDraggingCard(null);

  // Flatten all cards and apply filter
  const allCards = Object.values(board).flat();
  const filteredCards = filter
    ? allCards.filter((c) => {
        const q = filter.toLowerCase();
        return c.title.toLowerCase().includes(q)
          || c.taskId.includes(q)
          || c.project.toLowerCase().includes(q)
          || c.currentAgent.toLowerCase().includes(q)
          || (c.milestone ?? "").toLowerCase().includes(q);
      })
    : allCards;

  // Build columns based on groupBy
  const getColumns = (): { id: string; label: string; color: string; cards: KanbanCard[] }[] => {
    if (groupBy === "status") {
      return COLUMNS.map((def) => ({
        ...def,
        cards: filteredCards.filter((c) => c.status === def.id),
      }));
    }

    if (groupBy === "project") {
      const projects = [...new Set(filteredCards.map((c) => c.project))].sort();
      return projects.map((project) => ({
        id: project,
        label: project,
        color: "var(--blue)",
        cards: filteredCards.filter((c) => c.project === project),
      }));
    }

    // milestone
    const milestones = [...new Set(filteredCards.map((c) => c.milestone ?? "(none)"))].sort();
    return milestones.map((milestone) => ({
      id: milestone,
      label: milestone,
      color: "var(--purple)",
      cards: filteredCards.filter((c) => (c.milestone ?? "(none)") === milestone),
    }));
  };

  const columns = getColumns();

  const isHidden = (colId: string) =>
    hideDone && groupBy === "status" && (colId === "done" || colId === "archived");

  const totalCards = filteredCards.length;

  // Determine per-column drag state (only relevant in status groupBy)
  const isDragTarget = (colId: string) =>
    draggingCard?.status === "waiting_human" &&
    groupBy === "status" &&
    Object.prototype.hasOwnProperty.call(WAITING_HUMAN_TARGETS, colId);

  const isInvalidTarget = (colId: string) =>
    draggingCard?.status === "waiting_human" &&
    groupBy === "status" &&
    !Object.prototype.hasOwnProperty.call(WAITING_HUMAN_TARGETS, colId) &&
    colId !== "waiting_human";

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

      <Toolbar
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        filter={filter}
        setFilter={setFilter}
        hideDone={hideDone}
        setHideDone={setHideDone}
        totalCards={totalCards}
      />

      {actionError && (
        <div style={{
          padding: "6px 20px", background: "var(--red)18",
          borderBottom: "1px solid var(--red)44",
          color: "var(--red)", fontSize: 12, flexShrink: 0,
        }}>
          {actionError}
        </div>
      )}

      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "hidden",
            padding: "16px 20px",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}>
            {columns.map((col) => (
              <Column
                key={col.id}
                def={{ id: col.id as TaskStatus, label: col.label, color: col.color }}
                cards={col.cards}
                hidden={isHidden(col.id)}
                isDragTarget={isDragTarget(col.id)}
                isInvalidTarget={isInvalidTarget(col.id)}
                onApprove={(id) => void handle(() => approveTask(id))}
                onReprove={(id) => setReproveTarget(id)}
                onCancel={(id) => void handle(() => cancelTask(id))}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {draggingCard && (
              <div style={{ width: 240, transform: "rotate(2deg)", opacity: 0.92 }}>
                <Card
                  card={draggingCard}
                  onApprove={() => {}}
                  onReprove={() => {}}
                  onCancel={() => {}}
                  style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.5)", cursor: "grabbing" }}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
