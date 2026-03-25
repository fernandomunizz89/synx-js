import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Header } from "./components/layout/Header.js";
import { TabBar, type TabId } from "./components/layout/TabBar.js";
import { ErrorBoundary } from "./components/layout/ErrorBoundary.js";
import { TasksPage } from "./pages/TasksPage.js";
import { KanbanPage } from "./pages/KanbanPage.js";
import { StreamPage } from "./pages/StreamPage.js";
import { fetchOverview, fetchTasks } from "./api/tasks.js";

const MetricsPage = lazy(() =>
  import("./pages/MetricsPage.js").then((m) => ({ default: m.MetricsPage }))
);

const VALID_TABS = new Set<TabId>(["tasks", "kanban", "metrics", "stream"]);

function hashTab(): TabId {
  const h = window.location.hash.slice(1) as TabId;
  return VALID_TABS.has(h) ? h : "tasks";
}

export function App() {
  const [tab, setTab] = useState<TabId>(hashTab);
  const [taskCount, setTaskCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState("unknown");

  // Sync tab → hash and hash → tab (browser back/forward)
  const changeTab = useCallback((next: TabId) => {
    window.location.hash = next;
    setTab(next);
  }, []);

  useEffect(() => {
    const onPop = () => setTab(hashTab());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
      <TabBar active={tab} onChange={changeTab} reviewCount={reviewCount} />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "tasks"   && <ErrorBoundary label="Tasks"><TasksPage /></ErrorBoundary>}
        {tab === "kanban"  && <ErrorBoundary label="Kanban"><KanbanPage /></ErrorBoundary>}
        {tab === "metrics" && (
          <ErrorBoundary label="Metrics">
            <Suspense fallback={
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
                Loading metrics…
              </div>
            }>
              <MetricsPage />
            </Suspense>
          </ErrorBoundary>
        )}
        {tab === "stream"  && <ErrorBoundary label="Stream"><StreamPage /></ErrorBoundary>}
      </main>
    </div>
  );
}
