export function MetricsPage() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", flexDirection: "column", gap: 12,
      color: "var(--muted)",
    }}>
      <span style={{ fontSize: 32 }}>◈</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>Metrics Dashboard</span>
      <span style={{ fontSize: 13 }}>Coming in Phase C</span>
    </div>
  );
}
