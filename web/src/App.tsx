import { useCallback, useEffect, useState } from "react";
import { Header } from "./components/layout/Header.js";
import { TabBar, type TabId } from "./components/layout/TabBar.js";
import { TasksPage } from "./pages/TasksPage.js";
import { KanbanPage } from "./pages/KanbanPage.js";
import { MetricsPage } from "./pages/MetricsPage.js";
import { StreamPage } from "./pages/StreamPage.js";
import { fetchOverview, fetchTasks } from "./api/tasks.js";

export function App() {
  const [tab, setTab] = useState<TabId>("tasks");
  const [taskCount, setTaskCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState("unknown");

  const loadMeta = useCallback(async () => {
    try {
      const [overview, tasks] = await Promise.all([fetchOverview(), fetchTasks()]);
      setRuntimeStatus(overview.runtime?.status ?? "unknown");
      const flat = tasks.flatMap((t) => [t, ...(t.children ?? [])]);
      setTaskCount(flat.length);
      setReviewCount(flat.filter((t) => t.humanApprovalRequired).length);
    } catch {
      // non-critical — header just shows stale counts
    }
  }, []);

  useEffect(() => {
    void loadMeta();
    const interval = setInterval(() => void loadMeta(), 10_000);
    return () => clearInterval(interval);
  }, [loadMeta]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      background: "var(--bg)",
      color: "var(--fg)",
      fontFamily: "var(--font)",
    }}>
      <Header taskCount={taskCount} runtimeStatus={runtimeStatus} />
      <TabBar active={tab} onChange={setTab} reviewCount={reviewCount} />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "tasks"   && <TasksPage />}
        {tab === "kanban"  && <KanbanPage />}
        {tab === "metrics" && <MetricsPage />}
        {tab === "stream"  && <StreamPage />}
      </main>
    </div>
  );
}
