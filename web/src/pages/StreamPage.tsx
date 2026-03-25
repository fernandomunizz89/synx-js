import { useStream } from "../api/stream.js";
import type { StreamEvent } from "../types.js";

const EVENT_COLORS: Record<string, string> = {
  "runtime.updated":       "var(--muted)",
  "task.created":          "var(--blue)",
  "task.updated":          "var(--teal)",
  "task.conflict_blocked": "var(--red)",
  "stage.started":         "var(--purple)",
  "stage.completed":       "var(--green)",
  "stage.failed":          "var(--red)",
};

function EventRow({ event }: { event: StreamEvent }) {
  const color = EVENT_COLORS[event.type] ?? "var(--muted)";
  const time = new Date(event.at).toLocaleTimeString();
  const taskId = (event.payload?.taskId ?? event.payload?.source) as string | undefined;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "7px 16px",
      borderBottom: "1px solid var(--border)",
      fontFamily: "var(--mono)",
      fontSize: 12,
      lineHeight: 1.5,
    }}>
      <span style={{ color: "var(--muted)", flexShrink: 0, width: 75 }}>{time}</span>
      <span style={{
        color,
        flexShrink: 0,
        width: 200,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}>
        {event.type}
      </span>
      {taskId && (
        <span style={{ color: "var(--blue)", flexShrink: 0, fontSize: 11 }}>
          {String(taskId).slice(0, 18)}
        </span>
      )}
      <span style={{ color: "var(--fg)", opacity: 0.7, wordBreak: "break-all" }}>
        {(event.payload?.message as string | undefined) ??
          (event.payload?.stage as string | undefined) ??
          (event.payload?.agent as string | undefined) ??
          ""}
      </span>
    </div>
  );
}

export function StreamPage() {
  const { events, connected } = useStream();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: connected ? "var(--green)" : "var(--muted)",
          display: "inline-block",
          boxShadow: connected ? "0 0 6px var(--green)" : "none",
        }} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {connected ? "Connected to event stream" : "Connecting…"}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
        {events.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Waiting for events…
          </div>
        ) : (
          events.map((e, i) => <EventRow key={`${e.id}-${i}`} event={e} />)
        )}
      </div>
    </div>
  );
}
