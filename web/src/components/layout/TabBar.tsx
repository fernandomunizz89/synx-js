export type TabId = "tasks" | "kanban" | "metrics" | "stream" | "setup";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "tasks",   label: "Tasks",   icon: "☰" },
  { id: "kanban",  label: "Kanban",  icon: "⬜" },
  { id: "metrics", label: "Metrics", icon: "◈" },
  { id: "stream",  label: "Stream",  icon: "⌁" },
  { id: "setup",   label: "Setup",   icon: "⚙" },
];

export function TabBar({
  active,
  onChange,
  reviewCount,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  reviewCount: number;
}) {
  return (
    <nav style={{
      display: "flex",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg2)",
      padding: "0 16px",
      flexShrink: 0,
    }}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              border: "none",
              borderBottom: isActive ? "2px solid var(--teal)" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--fg)" : "var(--muted)",
              transition: "color 0.1s",
              marginBottom: -1,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.7 }}>{tab.icon}</span>
            {tab.label}
            {tab.id === "tasks" && reviewCount > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 100,
                background: "var(--orange)",
                color: "#000",
                marginLeft: 2,
              }}>
                {reviewCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
