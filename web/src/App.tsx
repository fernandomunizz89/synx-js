import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { Header } from "./components/layout/Header.js";
import { TabBar, type TabId } from "./components/layout/TabBar.js";
import { ErrorBoundary } from "./components/layout/ErrorBoundary.js";
import { TasksPage } from "./pages/TasksPage.js";
import { KanbanPage } from "./pages/KanbanPage.js";
import { StreamPage } from "./pages/StreamPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { fetchOverview, fetchTasks, submitProjectPrompt } from "./api/tasks.js";

const MetricsPage = lazy(() =>
  import("./pages/MetricsPage.js").then((m) => ({ default: m.MetricsPage }))
);

const VALID_TABS = new Set<TabId>(["tasks", "kanban", "metrics", "stream", "setup"]);

function hashTab(): TabId {
  const h = window.location.hash.slice(1) as TabId;
  return VALID_TABS.has(h) ? h : "tasks";
}

export function App() {
  const [tab, setTab] = useState<TabId>(hashTab);
  const [taskCount, setTaskCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState("unknown");
  const [promptText, setPromptText] = useState("");
  const [submittingPrompt, setSubmittingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

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

  const onSubmitPrompt = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = promptText.trim();
    if (!prompt) return;
    setSubmittingPrompt(true);
    setPromptError(null);
    try {
      await submitProjectPrompt(prompt);
      setPromptText("");
      changeTab("tasks");
      await loadMeta();
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : "Failed to create project task.");
    } finally {
      setSubmittingPrompt(false);
    }
  }, [changeTab, loadMeta, promptText]);

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
      <form
        onSubmit={onSubmitPrompt}
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg2)",
          flexShrink: 0,
        }}
      >
        <input
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Describe what you want to build..."
          aria-label="Project prompt"
          style={{
            flex: 1,
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--fg)",
            fontSize: 13,
            padding: "8px 10px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={submittingPrompt || !promptText.trim()}
          style={{
            background: "var(--teal-dim)",
            border: "1px solid var(--teal)55",
            color: "var(--teal)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: submittingPrompt ? "default" : "pointer",
            opacity: submittingPrompt || !promptText.trim() ? 0.65 : 1,
          }}
        >
          {submittingPrompt ? "Sending..." : "Send"}
        </button>
      </form>
      {promptError && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--red)",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg2)",
          }}
        >
          {promptError}
        </div>
      )}
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
        {tab === "setup"   && <ErrorBoundary label="Setup"><SetupPage /></ErrorBoundary>}
      </main>
    </div>
  );
}
