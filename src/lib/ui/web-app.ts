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
        --focus: #0f5fcc;
      }
      * {
        box-sizing: border-box;
      }
      :focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 2px;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at 8% 12%, #dff2ea 0%, var(--bg) 56%);
        color: var(--fg);
        line-height: 1.45;
      }
      .skip-link {
        position: absolute;
        top: -40px;
        left: 12px;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 10px;
        color: var(--fg);
        text-decoration: none;
        font-weight: 700;
      }
      .skip-link:focus {
        top: 12px;
        z-index: 20;
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
        grid-template-columns: repeat(6, minmax(0, 1fr));
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
        min-height: 44px;
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
      .feedback {
        min-height: 20px;
        margin-bottom: 10px;
        color: #16543f;
        font-size: 0.92rem;
      }
      .feedback.error {
        color: var(--danger);
      }
      .empty {
        border: 1px dashed var(--border);
        border-radius: 12px;
        padding: 20px;
        color: var(--muted);
      }
      .loading {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
      }
      .loading::before {
        content: "";
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 2px solid #b8d5c9;
        border-top-color: #0f8f66;
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .table-wrap {
        overflow-x: auto;
      }
      .chart-grid {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: 12px;
        margin: 6px 0 2px;
      }
      .chart-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 10px 8px;
        background: #fff;
      }
      .chart {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 10px;
        background: linear-gradient(180deg, #f6faf8 0%, #ffffff 70%);
      }
      .chart-legend {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: var(--muted);
        font-size: 0.82rem;
        margin-top: 6px;
      }
      .sr-only {
        border: 0 !important;
        clip: rect(0 0 0 0) !important;
        height: 1px !important;
        margin: -1px !important;
        overflow: hidden !important;
        padding: 0 !important;
        position: absolute !important;
        width: 1px !important;
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
        main {
          padding: 20px 14px 36px;
        }
        .grid {
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content">
      <div class="topbar">
        <div class="title-wrap">
          <h1>SYNX Web Observability</h1>
          <p>Phase 5 - hardened observability, review operations, and analytics</p>
        </div>
        <div class="badge" id="poll-status" role="status" aria-live="polite" aria-atomic="true">Polling 3s</div>
      </div>
      <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>
      <nav aria-label="SYNX Web UI sections">
        <button type="button" data-view="overview" class="active" aria-current="page">Overview</button>
        <button type="button" data-view="tasks">Tasks</button>
        <button type="button" data-view="review">Review Queue</button>
        <button type="button" data-view="detail">Task Detail</button>
        <button type="button" data-view="live">Live Stream</button>
        <button type="button" data-view="analytics">Analytics</button>
      </nav>
      <section class="card">
        <div id="content" role="region" aria-live="polite" aria-busy="false"></div>
      </section>
    </main>
    <script>
      const state = {
        view: "overview",
        selectedTaskId: "",
        pollMs: 3000,
        search: "",
        liveEvents: [],
        realtimeConnected: false,
        reviewAlertAt: "",
      };
      const contentEl = document.getElementById("content");
      const pollStatusEl = document.getElementById("poll-status");
      const feedbackEl = document.getElementById("feedback");
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

      function fmtDurationMs(value) {
        const ms = Math.max(0, Number(value || 0));
        const totalSeconds = Math.round(ms / 1000);
        if (totalSeconds < 60) return totalSeconds + "s";
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes < 60) return minutes + "m " + seconds + "s";
        const hours = Math.floor(minutes / 60);
        const remainMinutes = minutes % 60;
        return hours + "h " + remainMinutes + "m";
      }

      function renderCurveChart(args) {
        const rows = Array.isArray(args.rows) ? args.rows : [];
        const valueKey = String(args.valueKey || "");
        const title = String(args.title || "Curve");
        if (!rows.length || !valueKey) {
          return '<div class="empty">No timeline points for ' + escapeHtml(title) + ".</div>";
        }

        const values = rows.map((row) => {
          const parsed = Number(row && row[valueKey]);
          return Number.isFinite(parsed) ? parsed : 0;
        });
        const maxValue = Math.max(...values, 1);
        const minValue = Math.min(...values, 0);
        const range = Math.max(1, maxValue - minValue);

        const width = 760;
        const height = 220;
        const padX = 34;
        const padY = 24;
        const usableWidth = width - padX * 2;
        const usableHeight = height - padY * 2;
        const stepX = rows.length > 1 ? usableWidth / (rows.length - 1) : 0;

        const points = values.map((value, index) => {
          const x = padX + stepX * index;
          const ratio = (value - minValue) / range;
          const y = height - padY - ratio * usableHeight;
          return {
            x,
            y,
            value,
            date: String(rows[index] && rows[index].date ? rows[index].date : ""),
          };
        });

        const polylinePoints = points.map((point) => point.x.toFixed(2) + "," + point.y.toFixed(2)).join(" ");
        const lastPoint = points[points.length - 1];
        const areaPoints = padX + "," + (height - padY) + " " + polylinePoints + " " + lastPoint.x.toFixed(2) + "," + (height - padY);

        let maxIndex = 0;
        for (let i = 1; i < values.length; i += 1) {
          if (values[i] > values[maxIndex]) maxIndex = i;
        }
        const markerIndexes = Array.from(new Set([0, maxIndex, values.length - 1]));
        const markers = markerIndexes.map((index) => {
          const point = points[index];
          return '<circle cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="4" fill="' + escapeHtml(args.color || "#0f8f66") + '" />';
        }).join("");

        const gridFractions = [0.25, 0.5, 0.75];
        const gridLines = gridFractions.map((fraction) => {
          const y = (height - padY - usableHeight * fraction).toFixed(2);
          return '<line x1="' + padX + '" y1="' + y + '" x2="' + (width - padX) + '" y2="' + y + '" stroke="#e6eef2" stroke-width="1" />';
        }).join("");

        const formatValue = typeof args.formatValue === "function" ? args.formatValue : (x) => String(x);
        const firstDate = String(rows[0] && rows[0].date ? rows[0].date : "n/a");
        const lastDate = String(rows[rows.length - 1] && rows[rows.length - 1].date ? rows[rows.length - 1].date : "n/a");
        const peakLabel = formatValue(maxValue);
        const latestLabel = formatValue(values[values.length - 1]);

        return [
          '<div class="chart-card">',
          '<div class="toolbar" style="margin-bottom:8px;"><div><strong>' + escapeHtml(title) + '</strong><div class="muted">' + escapeHtml(firstDate) + " to " + escapeHtml(lastDate) + '</div></div><div class="muted">Peak: ' + escapeHtml(peakLabel) + "</div></div>",
          '<svg class="chart" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + escapeHtml(title) + '">',
          gridLines,
          '<line x1="' + padX + '" y1="' + (height - padY) + '" x2="' + (width - padX) + '" y2="' + (height - padY) + '" stroke="#d5e4ea" stroke-width="1" />',
          '<polygon points="' + areaPoints + '" fill="' + escapeHtml(args.fill || "rgba(13,143,102,0.16)") + '" />',
          '<polyline points="' + polylinePoints + '" fill="none" stroke="' + escapeHtml(args.color || "#0f8f66") + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />',
          markers,
          "</svg>",
          '<div class="chart-legend"><span>Baseline: ' + escapeHtml(formatValue(minValue)) + '</span><span>Latest: ' + escapeHtml(latestLabel) + "</span></div>",
          "</div>",
        ].join("");
      }

      function setPollStatus(message) {
        if (pollStatusEl) pollStatusEl.textContent = message;
      }

      function setFeedback(message, tone) {
        if (!feedbackEl) return;
        feedbackEl.textContent = message || "";
        feedbackEl.classList.toggle("error", tone === "error");
      }

      function showLoading(message) {
        if (!contentEl) return;
        contentEl.setAttribute("aria-busy", "true");
        contentEl.innerHTML = '<div class="loading" role="status">' + escapeHtml(message || "Loading...") + "</div>";
      }

      function setView(view) {
        state.view = view;
        navButtons.forEach((button) => {
          const isActive = button.dataset.view === view;
          button.classList.toggle("active", isActive);
          if (isActive) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
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

      async function postApi(path, payload) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error((data && data.error) ? data.error : "Action failed.");
        }
        return data.data;
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
          '<div class="table-wrap">',
          "<table>",
          '<caption class="sr-only">Tasks list</caption>',
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
          "</div>",
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
          '<div class="table-wrap">',
          "<table>",
          '<caption class="sr-only">Tasks waiting for human review</caption>',
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
          "</div>",
        ].join("");
      }

      async function renderDetail() {
        if (!state.selectedTaskId) {
          contentEl.innerHTML = '<div class="empty">Choose a task from Tasks or Review Queue.</div>';
          return;
        }

        const detail = await api("/api/tasks/" + encodeURIComponent(state.selectedTaskId));
        const eventLines = Array.isArray(detail.recentEvents) ? detail.recentEvents : [];
        const canReview = Boolean(detail.humanApprovalRequired) || detail.status === "waiting_human";
        const canCancel = ["new", "in_progress", "waiting_agent"].includes(detail.status);
        const actionPanel = (canReview || canCancel)
          ? [
            '<h3 style="margin: 18px 0 8px;">Human Actions</h3>',
            '<div style="border: 1px solid var(--border); border-radius: 12px; padding: 12px;">',
            '<textarea id="action-reason" rows="3" style="width: 100%; border:1px solid var(--border); border-radius:8px; padding: 8px; font: inherit;" placeholder="Reason (required for reprove, optional for cancel)"></textarea>',
            '<div style="display:flex; gap:8px; margin-top: 8px; flex-wrap:wrap;">',
            '<select id="action-rollback" style="border:1px solid var(--border); border-radius:8px; padding:8px;">',
            '<option value="none">Rollback: none</option>',
            '<option value="task">Rollback: task-scoped</option>',
            '</select>',
            canReview ? '<button data-task-action="approve" style="padding:8px 12px; border-radius:8px; border:1px solid #138a67; background:#e0f5ec; color:#095f45; font-weight:700; cursor:pointer;">Approve</button>' : "",
            canReview ? '<button data-task-action="reprove" style="padding:8px 12px; border-radius:8px; border:1px solid #c98a09; background:#fff3d7; color:#734f03; font-weight:700; cursor:pointer;">Reprove</button>' : "",
            canCancel ? '<button data-task-action="cancel" style="padding:8px 12px; border-radius:8px; border:1px solid #c33b46; background:#fde8ea; color:#7f1e28; font-weight:700; cursor:pointer;">Cancel Task</button>' : "",
            "</div>",
            "</div>",
          ].join("")
          : '<h3 style="margin: 18px 0 8px;">Human Actions</h3><div class="empty">No manual action available for this task status.</div>';
        const reviewSignal = state.reviewAlertAt
          ? '<p style="margin-top:8px; color:#7f1e28; font-weight:700;">Attention: new task entered waiting_human at ' + escapeHtml(state.reviewAlertAt) + "</p>"
          : "";
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
          reviewSignal,
          actionPanel,
          '<h3 style="margin: 18px 0 8px;">Artifacts</h3>',
          '<p class="muted">Views: ' + escapeHtml((detail.views || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Done: ' + escapeHtml((detail.doneArtifacts || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Human: ' + escapeHtml((detail.humanArtifacts || []).join(", ") || "[none]") + '</p>',
        ].join("");
      }

      async function render() {
        const loadingMessage = state.view === "tasks"
          ? "Loading task list..."
          : state.view === "review"
          ? "Loading review queue..."
          : state.view === "detail"
          ? "Loading task detail..."
          : state.view === "analytics"
          ? "Loading analytics..."
          : state.view === "overview"
          ? "Loading overview..."
          : "";

        if (loadingMessage) showLoading(loadingMessage);
        try {
          if (state.view === "overview") await renderOverview();
          if (state.view === "tasks") await renderTasks();
          if (state.view === "review") await renderReviewQueue();
          if (state.view === "detail") await renderDetail();
          if (state.view === "live") renderLive();
          if (state.view === "analytics") await renderAnalytics();
          contentEl.setAttribute("aria-busy", "false");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown UI error";
          contentEl.setAttribute("aria-busy", "false");
          contentEl.innerHTML = [
            '<div class="error" role="alert">Failed to load view: ' + escapeHtml(message) + "</div>",
            '<div style="margin-top:10px;"><button type="button" data-retry-render style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:#fff; color:var(--fg); font-weight:600; cursor:pointer;">Retry</button></div>',
          ].join("");
          setFeedback("View loading failed. Use Retry or change section.", "error");
        }
      }

      function renderLive() {
        const rows = state.liveEvents.slice().reverse();
        const controls = [
          '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">',
          '<button data-runtime-action="pause" style="padding:8px 10px; border-radius:8px; border:1px solid #c38b0f; background:#fff3db; color:#734f03; font-weight:700; cursor:pointer;">Pause Engine</button>',
          '<button data-runtime-action="resume" style="padding:8px 10px; border-radius:8px; border:1px solid #138a67; background:#e0f5ec; color:#095f45; font-weight:700; cursor:pointer;">Resume Engine</button>',
          '<button data-runtime-action="stop" style="padding:8px 10px; border-radius:8px; border:1px solid #c33b46; background:#fde8ea; color:#7f1e28; font-weight:700; cursor:pointer;">Graceful Stop</button>',
          "</div>",
        ].join("");
        if (!rows.length) {
          contentEl.innerHTML = controls + '<div class="empty">Waiting realtime events from <code>/api/stream</code>...</div>';
          return;
        }
        contentEl.innerHTML = [
          '<div class="toolbar"><div class="muted">Realtime: ' + (state.realtimeConnected ? "connected" : "disconnected") + '</div></div>',
          controls,
          '<div class="table-wrap">',
          "<table>",
          '<caption class="sr-only">Realtime event stream</caption>',
          "<thead><tr><th>At</th><th>Type</th><th>Task</th><th>Payload</th></tr></thead>",
          "<tbody>",
          rows.map((event) => [
            "<tr>",
            "<td>" + escapeHtml(event.at || "") + "</td>",
            "<td>" + escapeHtml(event.type || "") + "</td>",
            "<td>" + escapeHtml(event.taskId || "") + "</td>",
            "<td><code>" + escapeHtml(JSON.stringify(event.payload || {})) + "</code></td>",
            "</tr>",
          ].join("")).join(""),
          "</tbody></table></div>",
        ].join("");
      }

      async function renderAnalytics() {
        const report = await api("/api/metrics/advanced?limit=12&days=30");
        const timeline = Array.isArray(report.timeline)
          ? report.timeline.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          : [];
        const topTaskRows = (report.tasks || []).slice(0, 6).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.title || row.taskId || "") + "</td>"
            + "<td>" + escapeHtml(row.project || "") + "</td>"
            + "<td>" + fmtNumber(row.estimatedTotalTokens) + "</td>"
            + "<td>" + fmtCost(row.estimatedCostUsd) + "</td>"
            + "</tr>";
        }).join("");
        const topAgentRows = (report.agents || []).slice(0, 6).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.agent || "") + "</td>"
            + "<td>" + fmtNumber(row.stageCount) + "</td>"
            + "<td>" + fmtNumber(row.estimatedTotalTokens) + "</td>"
            + "<td>" + fmtCost(row.estimatedCostUsd) + "</td>"
            + "<td>" + (Number(row.approvalRate || 0) * 100).toFixed(1) + "%</td>"
            + "</tr>";
        }).join("");
        const topProjectRows = (report.projects || []).slice(0, 6).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.project || "") + "</td>"
            + "<td>" + fmtNumber(row.taskCount) + "</td>"
            + "<td>" + fmtNumber(row.estimatedTotalTokens) + "</td>"
            + "<td>" + fmtCost(row.estimatedCostUsd) + "</td>"
            + "</tr>";
        }).join("");
        const timelineRows = timeline.slice(-8).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.date || "") + "</td>"
            + "<td>" + fmtNumber(row.taskCount) + "</td>"
            + "<td>" + fmtNumber(row.estimatedTotalTokens) + "</td>"
            + "<td>" + fmtCost(row.estimatedCostUsd) + "</td>"
            + "</tr>";
        }).join("");
        const costCurve = renderCurveChart({
          rows: timeline,
          title: "Cost Curve (30d)",
          valueKey: "estimatedCostUsd",
          color: "#0f8f66",
          fill: "rgba(13, 143, 102, 0.16)",
          formatValue: (value) => fmtCost(value),
        });
        const tokenCurve = renderCurveChart({
          rows: timeline,
          title: "Token Curve (30d)",
          valueKey: "estimatedTotalTokens",
          color: "#1f78d1",
          fill: "rgba(31, 120, 209, 0.14)",
          formatValue: (value) => fmtNumber(value),
        });
        const durationCurve = renderCurveChart({
          rows: timeline,
          title: "Duration Curve (30d)",
          valueKey: "totalDurationMs",
          color: "#a65c00",
          fill: "rgba(166, 92, 0, 0.14)",
          formatValue: (value) => fmtDurationMs(value),
        });
        const bottleneck = (report.bottlenecks || [])[0] || null;
        const qaLoops = report.qaLoops || { tasksWithQa: 0, totalQaLoops: 0, avgQaLoopsPerTask: 0 };
        contentEl.innerHTML = [
          '<div class="grid">',
          '<div class="metric"><div class="muted">Tasks with QA</div><strong>' + fmtNumber(qaLoops.tasksWithQa) + "</strong></div>",
          '<div class="metric"><div class="muted">Total QA Loops</div><strong>' + fmtNumber(qaLoops.totalQaLoops) + "</strong></div>",
          '<div class="metric"><div class="muted">Avg QA Loops/Task</div><strong>' + Number(qaLoops.avgQaLoopsPerTask || 0).toFixed(2) + "</strong></div>",
          '<div class="metric"><div class="muted">Top Bottleneck</div><strong>' + escapeHtml(bottleneck ? bottleneck.stage : "N/A") + "</strong></div>",
          "</div>",
          '<h3 style="margin:18px 0 8px;">Consumption Curves</h3>',
          '<div class="chart-grid">' + costCurve + tokenCurve + durationCurve + "</div>",
          '<h3 style="margin:18px 0 8px;">Top Tasks by Consumption</h3>',
          topTaskRows ? '<div class="table-wrap"><table><caption class="sr-only">Top tasks by consumption</caption><thead><tr><th>Task</th><th>Project</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>' + topTaskRows + "</tbody></table></div>" : '<div class="empty">No task analytics yet.</div>',
          '<h3 style="margin:18px 0 8px;">Top Agents</h3>',
          topAgentRows ? '<div class="table-wrap"><table><caption class="sr-only">Top agents</caption><thead><tr><th>Agent</th><th>Stages</th><th>Tokens</th><th>Cost</th><th>Approval Rate</th></tr></thead><tbody>' + topAgentRows + "</tbody></table></div>" : '<div class="empty">No agent analytics yet.</div>',
          '<h3 style="margin:18px 0 8px;">Top Projects</h3>',
          topProjectRows ? '<div class="table-wrap"><table><caption class="sr-only">Top projects</caption><thead><tr><th>Project</th><th>Tasks</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>' + topProjectRows + "</tbody></table></div>" : '<div class="empty">No project analytics yet.</div>',
          '<h3 style="margin:18px 0 8px;">30-day Timeline</h3>',
          timelineRows ? '<div class="table-wrap"><table><caption class="sr-only">30 day analytics timeline</caption><thead><tr><th>Date</th><th>Tasks</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>' + timelineRows + "</tbody></table></div>" : '<div class="empty">No timeline points yet.</div>',
        ].join("");
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const navView = target.dataset.view;
        if (navView) {
          setFeedback("", "info");
          setView(navView);
          return;
        }

        if (target.dataset.retryRender !== undefined) {
          setFeedback("Retrying current section...", "info");
          void render();
          return;
        }

        const taskId = target.dataset.openTask;
        if (taskId) {
          state.selectedTaskId = taskId;
          setView("detail");
          return;
        }

        const taskAction = target.dataset.taskAction;
        if (taskAction) {
          const reasonEl = document.getElementById("action-reason");
          const rollbackEl = document.getElementById("action-rollback");
          const reason = reasonEl instanceof HTMLTextAreaElement ? reasonEl.value.trim() : "";
          const rollbackMode = rollbackEl instanceof HTMLSelectElement ? rollbackEl.value : "none";

          (async () => {
            try {
              if (!state.selectedTaskId) throw new Error("Select a task first.");
              if (taskAction === "reprove" && !reason) {
                throw new Error("Reason is required to reprove.");
              }

              if (taskAction === "approve") {
                await postApi("/api/tasks/" + encodeURIComponent(state.selectedTaskId) + "/approve", {});
                setFeedback("Task approved successfully.", "info");
              } else if (taskAction === "reprove") {
                await postApi("/api/tasks/" + encodeURIComponent(state.selectedTaskId) + "/reprove", {
                  reason,
                  rollbackMode,
                });
                setFeedback("Task reproved and sent back to agent flow.", "info");
              } else if (taskAction === "cancel") {
                await postApi("/api/tasks/" + encodeURIComponent(state.selectedTaskId) + "/cancel", {
                  reason,
                });
                setFeedback("Cancellation requested for task.", "info");
              }

              setPollStatus("Last action at " + new Date().toLocaleTimeString());
              await render();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Action failed";
              setFeedback(message, "error");
            }
          })();
          return;
        }

        const runtimeAction = target.dataset.runtimeAction;
        if (runtimeAction) {
          (async () => {
            try {
              await postApi("/api/runtime/" + encodeURIComponent(runtimeAction), {});
              setPollStatus("Runtime command sent: " + runtimeAction);
              setFeedback("Runtime command accepted: " + runtimeAction + ".", "info");
            } catch (error) {
              const message = error instanceof Error ? error.message : "Runtime action failed";
              setFeedback(message, "error");
            }
          })();
        }
      });

      document.addEventListener("input", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.id === "task-search") {
          state.search = target.value;
          render();
        }
      });

      function connectRealtime() {
        try {
          const source = new EventSource("/api/stream");
          source.addEventListener("open", () => {
            state.realtimeConnected = true;
            setPollStatus("Realtime connected");
          });
          source.addEventListener("error", () => {
            state.realtimeConnected = false;
            setPollStatus("Realtime reconnecting...");
          });

          const types = ["runtime.updated", "task.updated", "task.review_required", "task.decision_recorded", "metrics.updated"];
          for (const type of types) {
            source.addEventListener(type, (row) => {
              try {
                const parsed = JSON.parse(row.data);
                state.liveEvents.push(parsed);
                if (state.liveEvents.length > 160) state.liveEvents = state.liveEvents.slice(-160);
                if (type === "task.review_required") {
                  state.reviewAlertAt = new Date().toLocaleTimeString();
                  setPollStatus("Review required now");
                  setFeedback("New task entered waiting_human queue.", "info");
                }
                if (parsed && parsed.taskId && state.selectedTaskId && parsed.taskId === state.selectedTaskId && (type === "task.updated" || type === "task.decision_recorded" || type === "task.review_required")) {
                  if (state.view === "detail") {
                    void renderDetail();
                  }
                }
                if (state.view === "live") renderLive();
                if (state.view === "overview" && (type === "runtime.updated" || type === "metrics.updated")) {
                  void renderOverview();
                }
                if (state.view === "review" && type === "task.review_required") {
                  void renderReviewQueue();
                }
                if (state.view === "analytics" && (type === "task.updated" || type === "task.decision_recorded" || type === "metrics.updated")) {
                  void renderAnalytics();
                }
              } catch {
                // ignore malformed stream event payloads
              }
            });
          }
        } catch {
          setPollStatus("Realtime unavailable");
        }
      }

      setInterval(render, state.pollMs);
      connectRealtime();
      render();
    </script>
  </body>
</html>`;
}
