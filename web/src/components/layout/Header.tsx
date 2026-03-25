import { useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

export function Header({ taskCount, runtimeStatus }: { taskCount: number; runtimeStatus: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const nextTheme = (): Theme => {
    if (theme === "dark") return "light";
    if (theme === "light") return "system";
    return "dark";
  };

  const themeIcon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";

  const statusColor = runtimeStatus === "running"
    ? "var(--green)"
    : runtimeStatus === "paused"
      ? "var(--orange)"
      : "var(--muted)";

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      height: 52,
      borderBottom: "1px solid var(--border)",
      background: "var(--bg2)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "-0.02em",
          color: "var(--teal)",
          fontFamily: "var(--mono)",
        }}>
          SYNX
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Mission Control</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
          }} />
          {runtimeStatus}
        </span>

        {taskCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 100,
            background: "var(--teal-dim)",
            color: "var(--teal)",
            border: "1px solid var(--teal)33",
          }}>
            {taskCount} task{taskCount !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={() => setTheme(nextTheme())}
          title={`Theme: ${theme}`}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--fg)",
          }}
        >
          {themeIcon}
        </button>
      </div>
    </header>
  );
}
