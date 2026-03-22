export function buildWebUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SYNX Web UI</title>
    <style>
      :root {
        --bg: #eff4f2;
        --fg: #0f2230;
        --accent: #0d8f66;
        --accent-soft: #d7f4e9;
        --card: #ffffff;
        --muted: #4e6278;
        --danger: #b2272d;
        --border: #d7e3ea;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at 8% 12%, #dff2ea 0%, var(--bg) 56%);
        color: var(--fg);
      }
      main {
        max-width: 1160px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }
      .title-wrap h1 {
        margin: 0 0 2px;
        font-size: 2rem;
      }
      .title-wrap p {
        margin: 0;
      }
      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: #0a6749;
        font-size: 0.9rem;
        font-weight: 600;
      }
      nav {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 16px;
      }
      nav button {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
        color: var(--fg);
        font-weight: 600;
        cursor: pointer;
      }
      nav button.active {
        border-color: #1a946f;
        background: #e2f7ef;
        color: #0a6548;
      }
      .card {
        background: var(--card);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 8px 24px rgba(17, 32, 52, 0.08);
        margin-bottom: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        background: #fff;
      }
      .metric strong {
        display: block;
        font-size: 1.25rem;
        margin-top: 2px;
      }
      .muted {
        color: var(--muted);
        font-size: 0.92rem;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
      }
      .toolbar input {
        width: min(380px, 100%);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      th, td {
        padding: 10px 8px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      th {
        font-size: 0.82rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      a, button.link {
        color: #0a7a5a;
        text-decoration: none;
        font-weight: 600;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
      }
      .status {
        display: inline-flex;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 0.78rem;
        font-weight: 700;
        background: #ecf1f5;
        color: #20445e;
      }
      .status.waiting_human { background: #fff4dc; color: #7b5600; }
      .status.failed { background: #ffe5e7; color: #7f1e28; }
      .status.done { background: #ddf5eb; color: #145f43; }
      .status.in_progress, .status.waiting_agent, .status.new { background: #e8f0ff; color: #184c96; }
      .error {
        color: var(--danger);
        font-weight: 600;
      }
      .empty {
        border: 1px dashed var(--border);
        border-radius: 12px;
        padding: 20px;
        color: var(--muted);
      }
      pre {
        white-space: pre-wrap;
        background: #f4f8fb;
        border-radius: 12px;
        padding: 12px;
      }
      code {
        background: #edf2f7;
        padding: 2px 6px;
        border-radius: 6px;
      }
      @media (max-width: 940px) {
        nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .toolbar {
          flex-direction: column;
          align-items: stretch;
        }
      }
      @media (max-width: 640px) {
        .grid {
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        table, thead, tbody, th, td, tr {
          display: block;
        }
        thead {
          display: none;
        }
        td {
          border-bottom: none;
          padding: 6px 0;
        }
        tr {
          border-bottom: 1px solid var(--border);
          padding: 10px 0;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="topbar">
        <div class="title-wrap">
          <h1>SYNX Web Observability</h1>
          <p>Phase 1 - read-only monitoring and review queue visibility</p>
        </div>
        <div class="badge" id="poll-status">Polling 3s</div>
      </div>
      <nav>
        <button data-view="overview" class="active">Overview</button>
        <button data-view="tasks">Tasks</button>
        <button data-view="review">Review Queue</button>
        <button data-view="detail">Task Detail</button>
      </nav>
      <section class="card">
        <div id="content"></div>
      </section>
    </main>
    <script>
      const state = {
        view: "overview",
        selectedTaskId: "",
        pollMs: 3000,
        search: "",
      };
      const contentEl = document.getElementById("content");
      const navButtons = Array.from(document.querySelectorAll("nav button"));

      function fmtNumber(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) ? n.toLocaleString() : "0";
      }

      function fmtCost(value) {
        const n = Number(value || 0);
        return "$" + n.toFixed(4);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function setView(view) {
        state.view = view;
        navButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.view === view);
        });
        render();
      }

      async function api(path) {
        const response = await fetch(path);
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          const error = payload && payload.error ? payload.error : "Request failed";
          throw new Error(error);
        }
        return payload.data;
      }

      function taskStatusBadge(status) {
        return '<span class="status ' + escapeHtml(status) + '">' + escapeHtml(status) + "</span>";
      }

      async function renderOverview() {
        const [overview, metrics] = await Promise.all([
          api("/api/overview"),
          api("/api/metrics/overview?hours=24"),
        ]);

        const topSlowStage = metrics.stageSummary && metrics.stageSummary[0] ? metrics.stageSummary[0] : null;
        const runtime = overview.runtime || {};
        const healthLabel = runtime.isAlive ? "Alive" : "Stopped";
        contentEl.innerHTML = [
          '<div class="grid">',
          '<div class="metric"><div class="muted">Engine</div><strong>' + healthLabel + '</strong></div>',
          '<div class="metric"><div class="muted">Active Tasks</div><strong>' + fmtNumber(overview.counts.active) + '</strong></div>',
          '<div class="metric"><div class="muted">Waiting Human</div><strong>' + fmtNumber(overview.counts.waitingHuman) + '</strong></div>',
          '<div class="metric"><div class="muted">Done</div><strong>' + fmtNumber(overview.counts.done) + '</strong></div>',
          '<div class="metric"><div class="muted">Failed</div><strong>' + fmtNumber(overview.counts.failed) + '</strong></div>',
          '<div class="metric"><div class="muted">Estimated Tokens</div><strong>' + fmtNumber(overview.consumption.estimatedTotalTokens) + '</strong></div>',
          '<div class="metric"><div class="muted">Estimated Cost</div><strong>' + fmtCost(overview.consumption.estimatedCostUsd) + '</strong></div>',
          '<div class="metric"><div class="muted">Review Queue</div><strong>' + fmtNumber(overview.reviewQueueCount) + '</strong></div>',
          '</div>',
          '<div class="card" style="margin-top: 14px; box-shadow: none; border: 1px solid var(--border);">',
          '<p>Last heartbeat: <code>' + escapeHtml(runtime.lastHeartbeatAt || "N/A") + '</code></p>',
          '<p style="margin-top: 8px;">Top slow stage (24h): <strong>' + escapeHtml(topSlowStage ? topSlowStage.stage : "N/A") + "</strong></p>",
          '</div>',
        ].join("");
      }

      function renderTaskRows(tasks) {
        if (!tasks.length) {
          return '<div class="empty">No tasks found in <code>.ai-agents/tasks</code>.</div>';
        }
        return [
          "<table>",
          "<thead><tr><th>Task</th><th>Status</th><th>Project</th><th>Stage</th><th>Tokens</th><th>Cost</th></tr></thead>",
          "<tbody>",
          tasks.map((task) => {
            return [
              "<tr>",
              '<td><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title) + "</button><br/><small>" + escapeHtml(task.taskId) + "</small></td>",
              "<td>" + taskStatusBadge(task.status) + "</td>",
              "<td>" + escapeHtml(task.project || "[none]") + "</td>",
              "<td>" + escapeHtml(task.currentStage || "[none]") + "</td>",
              "<td>" + fmtNumber(task.consumption && task.consumption.estimatedTotalTokens) + "</td>",
              "<td>" + fmtCost(task.consumption && task.consumption.estimatedCostUsd) + "</td>",
              "</tr>",
            ].join("");
          }).join(""),
          "</tbody></table>",
        ].join("");
      }

      async function renderTasks() {
        const query = state.search ? "?q=" + encodeURIComponent(state.search) : "";
        const tasks = await api("/api/tasks" + query);
        contentEl.innerHTML = [
          '<div class="toolbar">',
          '<input id="task-search" placeholder="Search by task id, title, or project..." value="' + escapeHtml(state.search) + '" />',
          '<div class="muted">' + fmtNumber(tasks.length) + " tasks</div>",
          "</div>",
          renderTaskRows(tasks),
        ].join("");
      }

      async function renderReviewQueue() {
        const queue = await api("/api/review-queue");
        if (!queue.length) {
          contentEl.innerHTML = '<div class="empty">No tasks waiting for human review.</div>';
          return;
        }
        contentEl.innerHTML = [
          "<table>",
          "<thead><tr><th>Task</th><th>Status</th><th>Type</th><th>Updated</th></tr></thead>",
          "<tbody>",
          queue.map((task) => [
            "<tr>",
            '<td><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title) + "</button><br/><small>" + escapeHtml(task.taskId) + "</small></td>",
            "<td>" + taskStatusBadge(task.status) + "</td>",
            "<td>" + escapeHtml(task.type) + "</td>",
            "<td>" + escapeHtml(task.updatedAt) + "</td>",
            "</tr>",
          ].join("")).join(""),
          "</tbody></table>",
        ].join("");
      }

      async function renderDetail() {
        if (!state.selectedTaskId) {
          contentEl.innerHTML = '<div class="empty">Choose a task from Tasks or Review Queue.</div>';
          return;
        }

        const detail = await api("/api/tasks/" + encodeURIComponent(state.selectedTaskId));
        const eventLines = Array.isArray(detail.recentEvents) ? detail.recentEvents : [];
        contentEl.innerHTML = [
          '<div class="toolbar"><div><strong>' + escapeHtml(detail.title) + '</strong><div class="muted">' + escapeHtml(detail.taskId) + '</div></div></div>',
          '<div class="grid">',
          '<div class="metric"><div class="muted">Status</div><strong>' + escapeHtml(detail.status) + "</strong></div>",
          '<div class="metric"><div class="muted">Current Stage</div><strong>' + escapeHtml(detail.currentStage || "[none]") + "</strong></div>",
          '<div class="metric"><div class="muted">Current Agent</div><strong>' + escapeHtml(detail.currentAgent || "[none]") + "</strong></div>",
          '<div class="metric"><div class="muted">Estimated Cost</div><strong>' + fmtCost(detail.consumption && detail.consumption.estimatedCostUsd) + "</strong></div>",
          "</div>",
          '<h3 style="margin: 18px 0 8px;">Recent Events</h3>',
          eventLines.length ? "<pre>" + escapeHtml(eventLines.join("\\n")) + "</pre>" : '<div class="empty">No events logged yet.</div>',
          '<h3 style="margin: 18px 0 8px;">Artifacts</h3>',
          '<p class="muted">Views: ' + escapeHtml((detail.views || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Done: ' + escapeHtml((detail.doneArtifacts || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Human: ' + escapeHtml((detail.humanArtifacts || []).join(", ") || "[none]") + '</p>',
        ].join("");
      }

      async function render() {
        try {
          if (state.view === "overview") await renderOverview();
          if (state.view === "tasks") await renderTasks();
          if (state.view === "review") await renderReviewQueue();
          if (state.view === "detail") await renderDetail();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown UI error";
          contentEl.innerHTML = '<div class="error">Failed to load view: ' + escapeHtml(message) + "</div>";
        }
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const navView = target.dataset.view;
        if (navView) {
          setView(navView);
          return;
        }

        const taskId = target.dataset.openTask;
        if (taskId) {
          state.selectedTaskId = taskId;
          setView("detail");
        }
      });

      document.addEventListener("input", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.id === "task-search") {
          state.search = target.value;
          render();
        }
      });

      setInterval(render, state.pollMs);
      render();
    </script>
  </body>
</html>`;
}
