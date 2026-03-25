export function DisconnectedBanner({
  reconnectIn,
  onReconnect,
}: {
  reconnectIn: number | null;
  onReconnect: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "6px 20px",
      background: "color-mix(in srgb, var(--orange) 12%, transparent)",
      borderBottom: "1px solid color-mix(in srgb, var(--orange) 40%, transparent)",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, color: "var(--orange)" }}>
        ⚠ Real-time disconnected
        {reconnectIn != null ? ` — reconnecting in ${reconnectIn}s…` : " — reconnecting…"}
      </span>
      <button
        onClick={onReconnect}
        style={{
          background: "color-mix(in srgb, var(--orange) 15%, transparent)",
          border: "1px solid color-mix(in srgb, var(--orange) 50%, transparent)",
          color: "var(--orange)",
          borderRadius: 5, padding: "3px 10px",
          fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: "var(--font)",
        }}
      >
        Retry now
      </button>
    </div>
  );
}
