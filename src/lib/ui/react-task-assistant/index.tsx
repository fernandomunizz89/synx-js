import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

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

export function mountSynxTaskAssistant(options?: { rootId?: string }): boolean {
  const rootId = String(options?.rootId || "react-task-assistant-root");
  const rootElement = document.getElementById(rootId);
  if (!(rootElement instanceof HTMLElement)) return false;
  const root = createRoot(rootElement);
  root.render(<TaskAssistantApp />);
  return true;
}
