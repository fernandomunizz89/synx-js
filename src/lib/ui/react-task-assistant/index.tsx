import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

type SimpleAction =
  | "new"
  | "status"
  | "approve"
  | "reprove"
  | "runtime_pause"
  | "runtime_resume"
  | "runtime_stop"
  | "help";

type TaskSummary = {
  taskId: string;
  title: string;
  status: string;
  currentStage?: string;
  currentAgent?: string;
  updatedAt?: string;
};

type TaskDetail = TaskSummary & {
  recentEvents?: string[];
};

type BoardMode = "kanban" | "agent";

type BoardTask = TaskSummary & {
  project?: string;
  type?: string;
  nextAgent?: string;
  humanApprovalRequired?: boolean;
  consumption?: {
    estimatedTotalTokens?: number;
  };
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const STORAGE_KEY = "synx-react-task-assistant-v1";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok || payload.data == null) {
    throw new Error(String(payload.error || "Request failed"));
  }
  return payload.data;
}

function formatRelative(value?: string): string {
  const iso = String(value || "").trim();
  if (!iso) return "agora";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return iso;
  const deltaSec = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (deltaSec < 60) return `${deltaSec}s atras`;
  const min = Math.round(deltaSec / 60);
  if (min < 60) return `${min}m atras`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.round(hours / 24);
  return `${days}d atras`;
}

function shortTaskId(taskId: string): string {
  const match = String(taskId || "").match(/(\d+)/);
  if (!match) return taskId;
  return `#TX-${match[1].padStart(3, "0")}`;
}

function boardColumnForTask(task: BoardTask): string {
  const status = String(task.status || "");
  const currentAgent = String(task.currentAgent || "").toLowerCase();
  const nextAgent = String(task.nextAgent || "").toLowerCase();
  const stage = String(task.currentStage || "").toLowerCase();
  const context = [currentAgent, nextAgent, stage].join(" ");

  if (status === "done") return "done";
  if (status === "failed" || status === "blocked" || status === "archived") return "blocked";
  if (task.humanApprovalRequired || status === "waiting_human" || context.includes("human review")) return "human";
  if (context.includes("dispatcher")) return "dispatcher";
  if (context.includes("research")) return "research";
  if (context.includes("planner") || context.includes("architect")) return "architect";
  if (context.includes("qa")) return "qa";
  if (
    context.includes("expert")
    || context.includes("specialist")
    || context.includes("engineer")
    || context.includes("front")
    || context.includes("back")
    || context.includes("mobile")
    || context.includes("seo")
    || context.includes("coder")
    || status === "waiting_agent"
    || status === "in_progress"
  ) {
    return "coder";
  }
  return "dispatcher";
}

function boardKanbanColumnForTask(task: BoardTask): string {
  const status = String(task.status || "");
  const stage = String(task.currentStage || "").toLowerCase();
  if (status === "done") return "done";
  if (status === "failed" || status === "blocked" || status === "archived") return "blocked";
  if (status === "waiting_human" || task.humanApprovalRequired || stage.includes("review")) return "review";
  if (status === "in_progress") return "progress";
  if (status === "waiting_agent") return "todo";
  if (status === "new") return "backlog";
  return "todo";
}

function boardTaskMatchesFilter(task: BoardTask, filterQuery: string): boolean {
  const query = String(filterQuery || "").trim().toLowerCase();
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  const haystack = [
    task.taskId,
    task.title,
    task.project,
    task.currentAgent,
    task.nextAgent,
    task.currentStage,
    task.status,
  ].join(" ").toLowerCase();
  const tokenCount = Number(task?.consumption?.estimatedTotalTokens || 0);
  const status = String(task.status || "").toLowerCase();

  for (const token of tokens) {
    if (token.startsWith("status:")) {
      const rawStatus = token.slice("status:".length);
      const normalized = rawStatus === "human_review" || rawStatus === "review_required"
        ? "waiting_human"
        : rawStatus;
      if (normalized === "blocked") {
        if (!(status === "failed" || status === "blocked" || status === "archived")) return false;
      } else if (normalized === "active") {
        if (!(status === "in_progress" || status === "waiting_agent")) return false;
      } else if (status !== normalized) {
        return false;
      }
      continue;
    }
    if (token.startsWith("agent:")) {
      const agentQuery = token.slice("agent:".length);
      const agentHay = (String(task.currentAgent || "") + " " + String(task.nextAgent || "")).toLowerCase();
      if (!agentHay.includes(agentQuery)) return false;
      continue;
    }
    if (token === "tokens:high" || token === "consumption:high") {
      if (!(tokenCount >= 120000)) return false;
      continue;
    }
    if (token.startsWith("id:")) {
      const idNeedle = token.slice("id:".length);
      if (!String(task.taskId || "").toLowerCase().includes(idNeedle)) return false;
      continue;
    }
    if (!haystack.includes(token)) return false;
  }
  return true;
}

function boardColumns(mode: BoardMode): Array<{ id: string; title: string; hint: string; klass?: string }> {
  if (mode === "agent") {
    return [
      { id: "dispatcher", title: "Dispatcher", hint: "Task routing and orchestration" },
      { id: "research", title: "Research", hint: "External discovery and grounding" },
      { id: "architect", title: "Architect", hint: "Planning and architecture decisions" },
      { id: "coder", title: "Coder", hint: "Implementation by coding specialists" },
      { id: "qa", title: "QA", hint: "Validation and retry loops" },
      { id: "human", title: "Human Review", hint: "Waiting for approve/reprove" },
      { id: "done", title: "Done", hint: "Completed successfully" },
      { id: "blocked", title: "Blocked", hint: "Failed or blocked tasks" },
    ];
  }
  return [
    { id: "backlog", title: "Backlog", hint: "Newly created requests", klass: "kanban-backlog" },
    { id: "todo", title: "To Do", hint: "Queued for next agent execution", klass: "kanban-todo" },
    { id: "progress", title: "In Progress", hint: "Active implementation / execution", klass: "kanban-progress" },
    { id: "review", title: "In Review", hint: "Waiting for human decision", klass: "kanban-review" },
    { id: "done", title: "Done", hint: "Completed successfully", klass: "kanban-done" },
    { id: "blocked", title: "Blocked", hint: "Failed, blocked or archived", klass: "kanban-blocked" },
  ];
}

function parseCreatedTaskId(lines: Array<{ message?: string }> = []): string {
  for (const row of lines) {
    const text = String(row?.message || "");
    const match = text.match(/Task created:\s+([^\s]+)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

function buildDetailLink(taskId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "detail");
  url.searchParams.set("task", taskId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function TaskAssistantApp(): React.JSX.Element {
  const [action, setAction] = useState<SimpleAction>("new");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Feature");
  const [taskId, setTaskId] = useState("");
  const [reason, setReason] = useState("");
  const [statusAll, setStatusAll] = useState(true);
  const [trackedTaskId, setTrackedTaskId] = useState("");
  const [trackedTask, setTrackedTask] = useState<TaskDetail | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const showTitle = action === "new";
  const showType = action === "new";
  const showTaskId = action === "approve" || action === "reprove";
  const showReason = action === "reprove";
  const showStatusAll = action === "status";

  const refreshProgress = useCallback(async () => {
    if (trackedTaskId) {
      try {
        const detail = await requestJson<TaskDetail>(`/api/tasks/${encodeURIComponent(trackedTaskId)}`);
        setTrackedTask(detail);
        return;
      } catch {
        setTrackedTask(null);
      }
    }

    const tasks = await requestJson<TaskSummary[]>("/api/tasks");
    const sorted = (Array.isArray(tasks) ? tasks : [])
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    setRecentTasks(sorted.slice(0, 3));
  }, [trackedTaskId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { trackedTaskId?: string };
      if (parsed?.trackedTaskId) setTrackedTaskId(String(parsed.trackedTaskId));
    } catch {
      // ignore local storage failures
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trackedTaskId }));
    } catch {
      // ignore local storage failures
    }
  }, [trackedTaskId]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress]);

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/stream");
      const refresh = () => {
        void refreshProgress();
      };
      source.addEventListener("task.updated", refresh);
      source.addEventListener("task.review_required", refresh);
      source.addEventListener("task.decision_recorded", refresh);
      source.addEventListener("runtime.updated", refresh);
    } catch {
      source = null;
    }
    return () => {
      if (source) source.close();
    };
  }, [refreshProgress]);

  const submitLabel = useMemo(() => (busy ? "Enviando..." : "Enviar"), [busy]);

  async function runAction(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (action === "new") {
        if (!title.trim()) {
          setMessage("Descreva a task antes de enviar.");
          return;
        }
        const input = `new \"${title.trim().replace(/\"/g, "\\\\\"")}\" --type ${type}`;
        const result = await requestJson<{ lines?: Array<{ message?: string }> }>("/api/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input, mode: "command" }),
        });
        const created = parseCreatedTaskId(result.lines || []);
        if (created) {
          setTrackedTaskId(created);
          setTaskId(created);
          setMessage(`Task criada: ${created}`);
        } else {
          setMessage("Task enviada. Acompanhe o progresso em tempo real.");
        }
        await refreshProgress();
        return;
      }

      if (action === "status") {
        const input = statusAll ? "status --all" : "status";
        await requestJson("/api/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input, mode: "command" }),
        });
        setMessage("Panorama atualizado.");
        await refreshProgress();
        return;
      }

      if (action === "approve") {
        if (!taskId.trim()) {
          setMessage("Informe o Task ID para aprovar.");
          return;
        }
        await requestJson(`/api/tasks/${encodeURIComponent(taskId.trim())}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        setTrackedTaskId(taskId.trim());
        setMessage(`Task aprovada: ${taskId.trim()}`);
        await refreshProgress();
        return;
      }

      if (action === "reprove") {
        if (!taskId.trim()) {
          setMessage("Informe o Task ID para reprovar.");
          return;
        }
        if (!reason.trim()) {
          setMessage("Motivo obrigatorio para reprovar.");
          return;
        }
        await requestJson(`/api/tasks/${encodeURIComponent(taskId.trim())}/reprove`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reason.trim(), rollbackMode: "none", rollbackStep: "" }),
        });
        setTrackedTaskId(taskId.trim());
        setMessage(`Task reprovada: ${taskId.trim()}`);
        await refreshProgress();
        return;
      }

      if (action === "runtime_pause" || action === "runtime_resume" || action === "runtime_stop") {
        const endpoint = action === "runtime_pause" ? "pause" : action === "runtime_resume" ? "resume" : "stop";
        await requestJson(`/api/runtime/${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Triggered from React Task Assistant" }),
        });
        setMessage(`Runtime ${endpoint} solicitado.`);
        return;
      }

      await requestJson("/api/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: "help", mode: "command" }),
      });
      setMessage("Ajuda carregada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar acao.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simple-shell" data-react-assistant="mounted">
      <form id="simple-action-form-react" className="simple-form" onSubmit={runAction}>
        <label className="simple-field">
          <span className="simple-label">Acao</span>
          <select className="field-select" value={action} onChange={(event) => setAction(event.target.value as SimpleAction)}>
            <option value="new">Criar nova task</option>
            <option value="status">Ver panorama atual</option>
            <option value="approve">Aprovar tarefa</option>
            <option value="reprove">Reprovar tarefa</option>
            <option value="runtime_pause">Pausar runtime</option>
            <option value="runtime_resume">Retomar runtime</option>
            <option value="runtime_stop">Parar runtime</option>
            <option value="help">Mostrar ajuda</option>
          </select>
        </label>

        {showTitle ? (
          <label className="simple-field">
            <span className="simple-label">Solicitacao</span>
            <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Descreva a task que voce precisa..." />
          </label>
        ) : null}

        {showType ? (
          <label className="simple-field">
            <span className="simple-label">Tipo</span>
            <select className="field-select" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="Feature">Feature</option>
              <option value="Bug">Bug</option>
              <option value="Refactor">Refactor</option>
              <option value="Research">Research</option>
              <option value="Documentation">Documentation</option>
              <option value="Mixed">Mixed</option>
            </select>
          </label>
        ) : null}

        {showTaskId ? (
          <label className="simple-field">
            <span className="simple-label">Task ID</span>
            <input className="field-input" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="task-123..." />
          </label>
        ) : null}

        {showReason ? (
          <label className="simple-field">
            <span className="simple-label">Motivo</span>
            <textarea className="field-input" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explique o motivo para reprovar..." />
          </label>
        ) : null}

        {showStatusAll ? (
          <label className="simple-checkbox">
            <input type="checkbox" checked={statusAll} onChange={(event) => setStatusAll(Boolean(event.target.checked))} />
            <span>Incluir panorama completo</span>
          </label>
        ) : null}

        <div className="simple-actions">
          <button type="submit" className="btn approve" disabled={busy}>{submitLabel}</button>
        </div>
      </form>

      {message ? <div className="muted">{message}</div> : null}

      <section className="simple-progress">
        <div className="simple-progress-head">
          <strong>Progresso em tempo real</strong>
          <span className="muted">Acompanhe o fluxo da tarefa sem navegar em log tecnico.</span>
        </div>
        <div className="simple-progress-feed">
          {trackedTask ? (
            <article className="simple-task-card">
              <div className="simple-task-head">
                <div>
                  <strong>{trackedTask.title || trackedTask.taskId}</strong>
                  <div className="muted">{shortTaskId(trackedTask.taskId)}</div>
                </div>
                <span className={`status ${trackedTask.status || "unknown"}`}>{trackedTask.status || "unknown"}</span>
              </div>
              <div className="simple-task-meta">
                <span>Etapa: {trackedTask.currentStage || "[none]"}</span>
                <span>Agente: {trackedTask.currentAgent || "[none]"}</span>
                <span>Atualizado: {formatRelative(trackedTask.updatedAt)}</span>
              </div>
              <div className="actions">
                <a className="btn" href={buildDetailLink(trackedTask.taskId)}>Ver detalhes</a>
              </div>
            </article>
          ) : recentTasks.length ? (
            recentTasks.map((task) => (
              <article className="simple-task-card" key={task.taskId}>
                <div className="simple-task-head">
                  <div>
                    <strong>{task.title || task.taskId}</strong>
                    <div className="muted">{shortTaskId(task.taskId)}</div>
                  </div>
                  <span className={`status ${task.status || "unknown"}`}>{task.status || "unknown"}</span>
                </div>
                <div className="simple-task-meta">
                  <span>Etapa: {task.currentStage || "[none]"}</span>
                  <span>Agente: {task.currentAgent || "[none]"}</span>
                  <span>Atualizado: {formatRelative(task.updatedAt)}</span>
                </div>
                <div className="actions">
                  <a className="btn" href={buildDetailLink(task.taskId)}>Ver detalhes</a>
                </div>
              </article>
            ))
          ) : (
            <div className="empty">Nenhuma task ativa no momento.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function HeaderSearchApp(props: { initialValue: string }): React.JSX.Element {
  const [search, setSearch] = useState(props.initialValue);
  return (
    <label className="global-search" htmlFor="global-search-input-react">
      <span className="search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        id="global-search-input-react"
        className="field-input"
        autoComplete="off"
        placeholder="Buscar tarefas, agentes, eventos ou IDs..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </label>
  );
}

function TaskBoardApp(props: { initialMode: BoardMode; initialFilter: string }): React.JSX.Element {
  const [mode, setMode] = useState<BoardMode>(props.initialMode);
  const [filter, setFilter] = useState(props.initialFilter);
  const [allTasks, setAllTasks] = useState<BoardTask[]>([]);

  const refreshTasks = useCallback(async () => {
    const rows = await requestJson<BoardTask[]>("/api/tasks");
    setAllTasks(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/stream");
      const refresh = () => {
        void refreshTasks();
      };
      source.addEventListener("task.updated", refresh);
      source.addEventListener("task.review_required", refresh);
      source.addEventListener("task.decision_recorded", refresh);
    } catch {
      source = null;
    }
    return () => {
      if (source) source.close();
    };
  }, [refreshTasks]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("synx-react-board-state", {
      detail: { mode, filter },
    }));
  }, [mode, filter]);

  const tasks = useMemo(() => {
    const normalized = String(filter || "").trim().toLowerCase();
    return normalized ? allTasks.filter((task) => boardTaskMatchesFilter(task, normalized)) : allTasks;
  }, [allTasks, filter]);

  const columns = useMemo(() => boardColumns(mode), [mode]);
  const byColumn = useMemo(() => {
    const map: Record<string, BoardTask[]> = {};
    for (const column of columns) map[column.id] = [];
    for (const task of tasks) {
      const columnId = mode === "agent" ? boardColumnForTask(task) : boardKanbanColumnForTask(task);
      if (!Array.isArray(map[columnId])) map[columnId] = [];
      map[columnId].push(task);
    }
    for (const column of columns) {
      map[column.id].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    }
    return map;
  }, [columns, mode, tasks]);

  return (
    <div className={`mode-${mode}`} data-react-board="mounted">
      <div className="toolbar">
        <div className="muted">Realtime board: atualiza com eventos e filtros sem recarregar.</div>
        <div className="board-controls">
          <div className="board-view-toggle" role="group" aria-label="Board mode">
            <button type="button" className={`board-toggle-btn${mode === "kanban" ? " active" : ""}`} onClick={() => setMode("kanban")}>Kanban</button>
            <button type="button" className={`board-toggle-btn${mode === "agent" ? " active" : ""}`} onClick={() => setMode("agent")}>Agent Lanes</button>
          </div>
          <label className="board-filter" htmlFor="board-filter-react">
            <input
              id="board-filter-react"
              className="field-input"
              placeholder="Filter by task ID or responsible agent..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div className="muted">{tasks.length} of {allTasks.length} tasks</div>
        </div>
      </div>

      <div className="board-controls" style={{ marginBottom: "10px" }}>
        <span className="muted">Quick Filters:</span>
        <button type="button" className={`btn${filter === "status:blocked" ? " approve" : ""}`} onClick={() => setFilter("status:blocked")}>Blocked Tasks</button>
        <button type="button" className={`btn${filter === "tokens:high" ? " approve" : ""}`} onClick={() => setFilter("tokens:high")}>High Consumption</button>
        <button type="button" className={`btn${filter === "status:waiting_human" ? " approve" : ""}`} onClick={() => setFilter("status:waiting_human")}>My Reviews</button>
        <button type="button" className="btn" onClick={() => setFilter("")}>Clear</button>
      </div>

      <div className="board-columns">
        {columns.map((column) => {
          const cards = byColumn[column.id] || [];
          const laneClass = mode === "agent" && column.id === "human" ? " agent-human" : "";
          const columnClass = `${column.klass || ""}${laneClass}`.trim();
          return (
            <section className={`board-column ${columnClass}`} key={column.id}>
              <div className="board-column-head">
                <h3>{column.title}</h3>
                <span className="board-count">{cards.length}</span>
              </div>
              <div className="meta muted">{column.hint}</div>
              <div className="board-stack">
                {cards.length ? cards.map((task) => (
                  <article
                    key={task.taskId}
                    className={`board-card ${task.status || ""}`}
                    data-open-task={task.taskId}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open task detail for ${task.taskId}`}
                  >
                    <div className="head">
                      <div className="board-ticket">
                        <span className="id">{shortTaskId(task.taskId)}</span>
                      </div>
                    </div>
                    <h4 className="title">{task.title || task.taskId}</h4>
                    <div className="chip-row">
                      <span className={`status ${task.status || "unknown"}`}>{task.status || "unknown"}</span>
                      <span className="board-chip strong">{task.project || "General"}</span>
                      <span className="board-chip">{task.currentStage || "unscoped"}</span>
                    </div>
                    <div className="foot">
                      <div className="updated">updated {formatRelative(task.updatedAt)}</div>
                      <div className="next-owner">
                        <span>Next {task.nextAgent || "n/a"}</span>
                      </div>
                    </div>
                  </article>
                )) : <div className="board-empty">No tasks in this lane.</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const islandRoots = new WeakMap<HTMLElement, Root>();

function renderIsland(rootElement: HTMLElement, node: React.JSX.Element): void {
  let root = islandRoots.get(rootElement);
  if (!root) {
    root = createRoot(rootElement);
    islandRoots.set(rootElement, root);
  }
  root.render(node);
}

export function mountSynxTaskAssistant(options?: { rootId?: string }): boolean {
  const rootId = String(options?.rootId || "react-task-assistant-root");
  const rootElement = document.getElementById(rootId);
  if (!(rootElement instanceof HTMLElement)) return false;
  renderIsland(rootElement, <TaskAssistantApp />);
  return true;
}

export function mountSynxHeaderSearch(options?: { rootId?: string; fallbackId?: string; initialValue?: string }): boolean {
  const rootId = String(options?.rootId || "react-header-search-root");
  const fallbackId = String(options?.fallbackId || "header-search-fallback");
  const rootElement = document.getElementById(rootId);
  if (!(rootElement instanceof HTMLElement)) return false;
  const fallback = document.getElementById(fallbackId);
  if (fallback instanceof HTMLElement) fallback.setAttribute("hidden", "");
  renderIsland(rootElement, <HeaderSearchApp initialValue={String(options?.initialValue || "")} />);
  return true;
}

export function mountSynxTaskBoard(options?: {
  rootId?: string;
  fallbackId?: string;
  initialMode?: BoardMode;
  initialFilter?: string;
}): boolean {
  const rootId = String(options?.rootId || "react-task-board-root");
  const fallbackId = String(options?.fallbackId || "board-fallback");
  const rootElement = document.getElementById(rootId);
  if (!(rootElement instanceof HTMLElement)) return false;
  const fallback = document.getElementById(fallbackId);
  if (fallback instanceof HTMLElement) fallback.setAttribute("hidden", "");
  const initialMode = options?.initialMode === "agent" ? "agent" : "kanban";
  renderIsland(rootElement, <TaskBoardApp initialMode={initialMode} initialFilter={String(options?.initialFilter || "")} />);
  return true;
}
