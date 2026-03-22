export function buildWebUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SYNX.js - Mission Control</title>
    <style>
      :root {
        color-scheme: light;
        --synx-cyan: #00ffff;
        --synx-magenta: #ff00ff;
        --synx-purple-soft: #c89bff;
        --bg: #eff4f2;
        --bg-elev: #e8efec;
        --fg: #0f2230;
        --accent: #0d8f66;
        --accent-soft: #d7f4e9;
        --card: #ffffff;
        --surface: #ffffff;
        --surface-soft: #f8fbfa;
        --surface-strong: #ffffff;
        --muted: #4e6278;
        --danger: #b2272d;
        --border: #d7e3ea;
        --focus: #0f5fcc;
        --shadow: 0 12px 30px rgba(15, 34, 48, 0.12);
        --title-gradient: linear-gradient(90deg, var(--synx-cyan) 0%, var(--synx-magenta) 100%);
        --status-neutral-bg: #ecf1f5;
        --status-neutral-fg: #20445e;
        --status-waiting-bg: #fff4dc;
        --status-waiting-fg: #7b5600;
        --status-failed-bg: #ffe5e7;
        --status-failed-fg: #7f1e28;
        --status-done-bg: #ddf5eb;
        --status-done-fg: #145f43;
        --status-progress-bg: #e8f0ff;
        --status-progress-fg: #184c96;
        --pill-runtime-bg: #e8f0ff;
        --pill-runtime-fg: #184c96;
        --pill-task-bg: #e0f5ec;
        --pill-task-fg: #095f45;
        --pill-review-bg: #fff3d7;
        --pill-review-fg: #734f03;
        --pill-metrics-bg: #ecf1f5;
        --pill-metrics-fg: #20445e;
      }
      html[data-theme="dark"] {
        color-scheme: dark;
        --bg: #0a1119;
        --bg-elev: #131f2d;
        --fg: #e4edf8;
        --accent: #1fe3a4;
        --accent-soft: rgba(31, 227, 164, 0.14);
        --card: #101925;
        --surface: #121e2d;
        --surface-soft: #172433;
        --surface-strong: #1a2a3b;
        --muted: #9db0c8;
        --danger: #ff6c7d;
        --border: #2d3f54;
        --focus: #5ca8ff;
        --shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
        --status-neutral-bg: #1a2a3e;
        --status-neutral-fg: #bdd1e8;
        --status-waiting-bg: #3a2b12;
        --status-waiting-fg: #ffd081;
        --status-failed-bg: #47212b;
        --status-failed-fg: #ff95a3;
        --status-done-bg: #123a30;
        --status-done-fg: #8ff5cf;
        --status-progress-bg: #1a3253;
        --status-progress-fg: #9ec9ff;
        --pill-runtime-bg: #1a3253;
        --pill-runtime-fg: #9ec9ff;
        --pill-task-bg: #123a30;
        --pill-task-fg: #8ff5cf;
        --pill-review-bg: #3a2b12;
        --pill-review-fg: #ffd081;
        --pill-metrics-bg: #1a2a3e;
        --pill-metrics-fg: #bdd1e8;
      }
      html[data-theme="light"] {
        color-scheme: light;
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
        font-family: "IBM Plex Sans", "Space Grotesk", "Segoe UI", system-ui, sans-serif;
        background:
          radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--synx-cyan) 18%, transparent) 0%, transparent 32%),
          radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--synx-magenta) 16%, transparent) 0%, transparent 28%),
          linear-gradient(165deg, var(--bg-elev) 0%, var(--bg) 62%);
        background-repeat: no-repeat, no-repeat, no-repeat;
        background-size: 120vmax 120vmax, 120vmax 120vmax, 100% 100%;
        background-position: left top, right top, center;
        background-attachment: fixed, fixed, fixed;
        min-height: 100vh;
        color: var(--fg);
        line-height: 1.45;
      }
      .skip-link {
        position: absolute;
        top: -40px;
        left: 12px;
        background: var(--surface-strong);
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
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: color-mix(in srgb, var(--surface) 86%, transparent);
        box-shadow: var(--shadow);
        padding: 14px;
      }
      .brand-panel {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
      .synx-logo {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: var(--surface-soft);
        min-width: 260px;
      }
      .logo-ascii {
        margin: 0;
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 11px;
        line-height: 1.05;
        white-space: pre;
        letter-spacing: 0.01em;
        background: var(--title-gradient);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }
      .logo-tag {
        margin-top: 8px;
        font-size: 0.76rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--synx-purple-soft);
      }
      .topbar-controls {
        display: grid;
        gap: 8px;
        min-width: 250px;
        justify-items: end;
      }
      .theme-switch {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: 999px;
        overflow: hidden;
        background: var(--surface-soft);
      }
      .theme-btn {
        border: 0;
        background: transparent;
        color: var(--muted);
        padding: 7px 12px;
        font-size: 0.84rem;
        font-weight: 700;
        cursor: pointer;
      }
      .theme-btn.active {
        background: var(--title-gradient);
        color: #041018;
      }
      .title-wrap h1 {
        margin: 0 0 2px;
        font-size: clamp(1.4rem, 3vw, 2rem);
        letter-spacing: 0.01em;
        background: var(--title-gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        color: transparent;
      }
      .title-wrap p {
        margin: 0;
      }
      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--fg);
        font-size: 0.9rem;
        font-weight: 700;
        border: 1px solid var(--border);
      }
      nav {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 16px;
      }
      nav button {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: var(--surface-strong);
        color: var(--fg);
        font-weight: 600;
        cursor: pointer;
        min-height: 44px;
      }
      nav button.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 38%, var(--border));
        background: linear-gradient(90deg, color-mix(in srgb, var(--synx-cyan) 18%, var(--surface)) 0%, color-mix(in srgb, var(--synx-magenta) 16%, var(--surface)) 100%);
        color: var(--fg);
      }
      .card {
        background: var(--card);
        border-radius: 16px;
        padding: 20px;
        box-shadow: var(--shadow);
        margin-bottom: 16px;
        border: 1px solid var(--border);
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
        background: var(--surface);
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
        background: var(--surface);
        color: var(--fg);
      }
      textarea, select, input {
        background: var(--surface);
        color: var(--fg);
      }
      .field-input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        font: inherit;
      }
      .field-select {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        background: var(--surface);
        color: var(--fg);
        font: inherit;
      }
      .panel-block {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        background: var(--surface-soft);
      }
      .section-title {
        margin: 18px 0 8px;
      }
      .review-alert {
        margin-top: 8px;
        color: var(--status-failed-fg);
        font-weight: 700;
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
        color: var(--accent);
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
        background: var(--status-neutral-bg);
        color: var(--status-neutral-fg);
      }
      .status.waiting_human { background: var(--status-waiting-bg); color: var(--status-waiting-fg); }
      .status.failed { background: var(--status-failed-bg); color: var(--status-failed-fg); }
      .status.done { background: var(--status-done-bg); color: var(--status-done-fg); }
      .status.in_progress, .status.waiting_agent, .status.new { background: var(--status-progress-bg); color: var(--status-progress-fg); }
      .error {
        color: var(--danger);
        font-weight: 600;
      }
      .feedback {
        min-height: 20px;
        margin-bottom: 10px;
        color: var(--fg);
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
        border: 2px solid color-mix(in srgb, var(--accent) 24%, transparent);
        border-top-color: var(--accent);
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
        background: var(--surface);
      }
      .chart {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 10px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 38%, var(--surface)) 0%, var(--surface) 70%);
      }
      .chart-legend {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: var(--muted);
        font-size: 0.82rem;
        margin-top: 6px;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .btn {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 12px;
        background: var(--surface-strong);
        color: var(--fg);
        font-weight: 700;
        cursor: pointer;
      }
      .btn.approve {
        border-color: #138a67;
        background: #e0f5ec;
        color: #095f45;
      }
      .btn.reprove {
        border-color: #c98a09;
        background: #fff3d7;
        color: #734f03;
      }
      .btn.cancel {
        border-color: #c33b46;
        background: #fde8ea;
        color: #7f1e28;
      }
      .review-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
        background: var(--surface);
      }
      .review-card:last-child {
        margin-bottom: 0;
      }
      .review-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
      }
      .review-card-meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 0.9rem;
        margin-bottom: 10px;
      }
      .review-toolbar {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 12px;
        background: var(--surface-soft);
      }
      .event-feed {
        display: grid;
        gap: 10px;
      }
      .board-columns {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 6px;
      }
      .board-column {
        min-width: 270px;
        max-width: 320px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-soft);
        padding: 10px;
      }
      .board-column h3 {
        margin: 0 0 6px;
        font-size: 0.97rem;
      }
      .board-column .meta {
        margin-bottom: 10px;
      }
      .board-stack {
        display: grid;
        gap: 8px;
      }
      .board-card {
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        padding: 9px 10px;
        transition: transform 0.16s ease, border-color 0.16s ease;
      }
      .board-card:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--synx-cyan) 24%, var(--border));
      }
      .board-card .head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: flex-start;
      }
      .board-card .id {
        color: var(--muted);
        font-size: 0.78rem;
      }
      .board-card .summary {
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.84rem;
      }
      .board-card.waiting_human {
        border-color: color-mix(in srgb, var(--status-waiting-fg) 36%, var(--border));
      }
      .board-card.done {
        border-color: color-mix(in srgb, var(--status-done-fg) 32%, var(--border));
      }
      .board-card.failed,
      .board-card.blocked,
      .board-card.archived {
        border-color: color-mix(in srgb, var(--status-failed-fg) 34%, var(--border));
      }
      .event-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        background: var(--surface);
      }
      .event-card .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .event-card .title {
        font-weight: 700;
      }
      .event-card .time {
        color: var(--muted);
        font-size: 0.86rem;
      }
      .event-card .summary {
        color: var(--fg);
        font-size: 0.95rem;
      }
      .event-card .details {
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.88rem;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 3px 8px;
      }
      .pill.runtime { background: var(--pill-runtime-bg); color: var(--pill-runtime-fg); }
      .pill.task { background: var(--pill-task-bg); color: var(--pill-task-fg); }
      .pill.review { background: var(--pill-review-bg); color: var(--pill-review-fg); }
      .pill.metrics { background: var(--pill-metrics-bg); color: var(--pill-metrics-fg); }
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
        background: var(--surface-soft);
        border-radius: 12px;
        padding: 12px;
      }
      code {
        background: var(--surface-soft);
        padding: 2px 6px;
        border-radius: 6px;
      }
      @media (max-width: 940px) {
        .topbar {
          flex-direction: column;
        }
        .brand-panel {
          width: 100%;
          flex-direction: column;
        }
        .synx-logo {
          width: 100%;
          min-width: 0;
        }
        .topbar-controls {
          width: 100%;
          justify-items: start;
        }
        nav {
          grid-template-columns: repeat(4, minmax(0, 1fr));
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .theme-switch {
          width: 100%;
        }
        .theme-btn {
          flex: 1;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content">
      <div class="topbar">
        <div class="brand-panel">
          <div class="synx-logo" aria-hidden="true">
            <pre class="logo-ascii">███████╗██╗   ██╗███╗   ██╗██╗  ██╗
██╔════╝╚██╗ ██╔╝████╗  ██║╚██╗██╔╝
███████╗ ╚████╔╝ ██╔██╗ ██║ ╚███╔╝
╚════██║  ╚██╔╝  ██║╚██╗██║ ██╔██╗
███████║   ██║   ██║ ╚████║██╔╝ ██╗
╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═╝</pre>
            <div class="logo-tag">[ Synthetic Agent Orchestrator v5.0 ]</div>
          </div>
          <div class="title-wrap">
            <h1>SYNX.js - Mission Control</h1>
            <p>SYNX Web Observability: runtime, human review e analytics em tempo real</p>
          </div>
        </div>
        <div class="topbar-controls">
          <div class="theme-switch" role="group" aria-label="Theme mode">
            <button type="button" class="theme-btn" data-theme-option="light">Light</button>
            <button type="button" class="theme-btn active" data-theme-option="system" aria-pressed="true">System</button>
            <button type="button" class="theme-btn" data-theme-option="dark">Dark</button>
          </div>
          <div class="badge" id="poll-status" role="status" aria-live="polite" aria-atomic="true">Polling 3s</div>
          <div class="muted" id="ui-build">UI build: Mission Control v2</div>
        </div>
      </div>
      <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>
      <nav aria-label="SYNX Web UI sections">
        <button type="button" data-view="overview" class="active" aria-current="page">Overview</button>
        <button type="button" data-view="tasks">Tasks</button>
        <button type="button" data-view="board">Agent Board</button>
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
        reviewDraftReason: "",
        reviewRollbackMode: "none",
        tasksRenderedKey: "",
        reviewRenderedKey: "",
        boardRenderedKey: "",
        detailRenderedKey: "",
        analyticsRenderedKey: "",
        liveRenderedCount: -1,
        liveRenderedConnected: null,
        themePreference: "system",
        themeResolved: "light",
        renderedViews: {},
      };
      const rootEl = document.documentElement;
      const contentEl = document.getElementById("content");
      const pollStatusEl = document.getElementById("poll-status");
      const feedbackEl = document.getElementById("feedback");
      const navButtons = Array.from(document.querySelectorAll("nav button"));
      const themeButtons = Array.from(document.querySelectorAll("[data-theme-option]"));
      const locale = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().locale || (navigator && navigator.language) || undefined;
        } catch {
          return undefined;
        }
      })();

      function localeRegion(loc) {
        const raw = String(loc || "");
        if (!raw) return "";
        const localeClass = Intl && Intl.Locale;
        if (typeof localeClass === "function") {
          try {
            const max = new localeClass(raw).maximize();
            return String(max.region || "").toUpperCase();
          } catch {
            // ignore locale parsing failures
          }
        }
        const parts = raw.replace("_", "-").split("-");
        for (const part of parts) {
          if (/^[a-z]{2}$/i.test(part)) continue;
          if (/^[a-z]{4}$/i.test(part)) continue;
          if (/^[a-z]{2}$|^[0-9]{3}$/i.test(part)) return part.toUpperCase();
        }
        return "";
      }

      function inferCurrencyCode(loc) {
        const region = localeRegion(loc);
        const byRegion = {
          US: "USD",
          PT: "EUR",
          ES: "EUR",
          FR: "EUR",
          DE: "EUR",
          IT: "EUR",
          NL: "EUR",
          IE: "EUR",
          BE: "EUR",
          AT: "EUR",
          FI: "EUR",
          GR: "EUR",
          BR: "BRL",
          GB: "GBP",
          CH: "CHF",
          CA: "CAD",
          AU: "AUD",
          NZ: "NZD",
          JP: "JPY",
          KR: "KRW",
          IN: "INR",
          MX: "MXN",
          CL: "CLP",
          AR: "ARS",
          CO: "COP",
          NO: "NOK",
          SE: "SEK",
          DK: "DKK",
          PL: "PLN",
          CZ: "CZK",
          HU: "HUF",
          RO: "RON",
          TR: "TRY",
          ZA: "ZAR",
          SG: "SGD",
          HK: "HKD",
          AE: "AED",
          IL: "ILS",
        };
        return byRegion[region] || "USD";
      }

      const currencyCode = inferCurrencyCode(locale);
      const numberFormatter = new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 0 });
      const dateFormatter = new Intl.DateTimeFormat(locale || undefined, { dateStyle: "medium" });
      const dateTimeFormatter = new Intl.DateTimeFormat(locale || undefined, { dateStyle: "medium", timeStyle: "medium" });
      const timeFormatter = new Intl.DateTimeFormat(locale || undefined, { timeStyle: "medium" });
      const currencyFormatter = new Intl.NumberFormat(locale || undefined, {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });

      function fmtNumber(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) ? numberFormatter.format(n) : "0";
      }

      function fmtCost(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) ? currencyFormatter.format(n) : currencyFormatter.format(0);
      }

      function fmtTimeNow() {
        return timeFormatter.format(new Date());
      }

      function fmtDate(value) {
        const raw = String(value || "").trim();
        if (!raw) return "N/A";
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? new Date(raw + "T00:00:00")
          : new Date(raw);
        if (!Number.isFinite(date.getTime())) return raw;
        return dateFormatter.format(date);
      }

      function fmtDateTime(value) {
        const raw = String(value || "").trim();
        if (!raw) return "N/A";
        const date = new Date(raw);
        if (!Number.isFinite(date.getTime())) return raw;
        return dateTimeFormatter.format(date);
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
          return '<line x1="' + padX + '" y1="' + y + '" x2="' + (width - padX) + '" y2="' + y + '" stroke="var(--border)" stroke-width="1" />';
        }).join("");

        const formatValue = typeof args.formatValue === "function" ? args.formatValue : (x) => String(x);
        const firstDate = fmtDate(rows[0] && rows[0].date ? rows[0].date : "n/a");
        const lastDate = fmtDate(rows[rows.length - 1] && rows[rows.length - 1].date ? rows[rows.length - 1].date : "n/a");
        const peakLabel = formatValue(maxValue);
        const latestLabel = formatValue(values[values.length - 1]);

        return [
          '<div class="chart-card">',
          '<div class="toolbar" style="margin-bottom:8px;"><div><strong>' + escapeHtml(title) + '</strong><div class="muted">' + escapeHtml(firstDate) + " to " + escapeHtml(lastDate) + '</div></div><div class="muted">Peak: ' + escapeHtml(peakLabel) + "</div></div>",
          '<svg class="chart" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + escapeHtml(title) + '">',
          gridLines,
          '<line x1="' + padX + '" y1="' + (height - padY) + '" x2="' + (width - padX) + '" y2="' + (height - padY) + '" stroke="var(--border)" stroke-width="1" />',
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

      function loadThemePreference() {
        try {
          const stored = localStorage.getItem("synx-theme-preference");
          if (stored === "light" || stored === "dark" || stored === "system") return stored;
        } catch {
          // ignore localStorage failures in restricted browsers
        }
        return "system";
      }

      function resolveThemeFromPreference(preference) {
        if (preference === "light" || preference === "dark") return preference;
        try {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } catch {
          return "light";
        }
      }

      function applyThemePreference(preference, persist) {
        const normalized = preference === "light" || preference === "dark" ? preference : "system";
        const resolved = resolveThemeFromPreference(normalized);
        state.themePreference = normalized;
        state.themeResolved = resolved;
        rootEl.setAttribute("data-theme", resolved);
        for (const button of themeButtons) {
          if (!(button instanceof HTMLElement)) continue;
          const isActive = button.dataset.themeOption === normalized;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        }
        if (persist !== false) {
          try {
            localStorage.setItem("synx-theme-preference", normalized);
          } catch {
            // ignore localStorage failures in restricted browsers
          }
        }
      }

      function bindSystemThemeSync() {
        let media = null;
        try {
          media = window.matchMedia("(prefers-color-scheme: dark)");
        } catch {
          media = null;
        }
        if (!media) return;
        const sync = () => {
          if (state.themePreference === "system") applyThemePreference("system", false);
        };
        if (typeof media.addEventListener === "function") media.addEventListener("change", sync);
        else if (typeof media.addListener === "function") media.addListener(sync);
      }

      function showLoading(message) {
        if (!contentEl) return;
        contentEl.setAttribute("aria-busy", "true");
        contentEl.innerHTML = '<div class="loading" role="status">' + escapeHtml(message || "Loading...") + "</div>";
      }

      function setTextIfChanged(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        const next = String(value || "");
        if (el.textContent !== next) el.textContent = next;
      }

      function asObject(value) {
        return value && typeof value === "object" ? value : {};
      }

      function eventTone(eventType) {
        if (eventType === "task.review_required") return "review";
        if (eventType === "task.decision_recorded" || eventType === "task.updated") return "task";
        if (eventType === "metrics.updated") return "metrics";
        return "runtime";
      }

      function eventTitle(eventType, rawEvent) {
        if (eventType === "task.review_required") return "Human Review Needed";
        if (eventType === "task.decision_recorded") return "Human Decision Recorded";
        if (eventType === "metrics.updated") return "Metrics Updated";
        if (eventType === "task.updated") return rawEvent === "task.created" ? "Task Created" : "Task Updated";
        if (eventType === "runtime.updated") {
          if (rawEvent === "engine.started") return "Engine Started";
          if (rawEvent === "engine.stopped") return "Engine Stopped";
          if (rawEvent === "engine.paused") return "Engine Paused";
          if (rawEvent === "engine.resumed") return "Engine Resumed";
          return "Runtime Updated";
        }
        return "Event";
      }

      function eventSummary(event) {
        const payloadObj = asObject(event.payload);
        const rawPayload = asObject(payloadObj.payload);
        const rawEvent = String(payloadObj.rawEvent || event.type || "");
        const stage = String(rawPayload.currentStage || event.stage || "");
        const currentAgent = String(rawPayload.currentAgent || "");
        const nextAgent = String(rawPayload.nextAgent || rawPayload.returnedTo || "");
        const reason = String(rawPayload.reason || payloadObj.reason || "");

        if (event.type === "task.review_required") {
          const context = [
            stage ? "stage " + stage : "",
            currentAgent ? "agent " + currentAgent : "",
          ].filter(Boolean).join(" | ");
          return context
            ? "Task moved to waiting_human and needs your decision (" + context + ")."
            : "Task moved to waiting_human and needs your decision.";
        }
        if (event.type === "task.decision_recorded") {
          const decision = String(rawPayload.decision || "");
          if (decision === "approved") return "Task approved and marked as done.";
          if (decision === "reproved") {
            const rollbackMode = String(rawPayload.rollbackMode || "");
            const toAgent = nextAgent ? "returning to " + nextAgent : "returning to implementation flow";
            const rollback = rollbackMode ? " | rollback: " + rollbackMode : "";
            const why = reason ? " | reason: " + reason : "";
            return "Task reproved, " + toAgent + rollback + why + ".";
          }
          return "Human decision captured in runtime events.";
        }
        if (event.type === "metrics.updated") {
          const prev = Number(payloadObj.previousCount || 0);
          const curr = Number(payloadObj.currentCount || 0);
          if (Number.isFinite(prev) && Number.isFinite(curr)) {
            return "Metrics samples changed from " + prev + " to " + curr + ".";
          }
          return "Metrics snapshots were updated.";
        }
        if (event.type === "runtime.updated") {
          const requestedBy = String(rawPayload.requestedBy || "");
          const reasonText = String(rawPayload.reason || "");
          if (rawEvent === "engine.started") return "Orchestrator loop is now running.";
          if (rawEvent === "engine.stopped") return "Orchestrator loop was stopped.";
          if (rawEvent === "engine.paused") return "Processing loop is paused.";
          if (rawEvent === "engine.resumed") return "Processing loop resumed.";
          if (rawEvent === "engine.stop_requested") {
            const context = [requestedBy ? "requestedBy=" + requestedBy : "", reasonText ? "reason=" + reasonText : ""]
              .filter(Boolean)
              .join(" | ");
            return context ? "Graceful stop was requested (" + context + ")." : "Graceful stop was requested.";
          }
          return "Runtime state changed.";
        }
        if (event.type === "task.updated") {
          const status = String(rawPayload.status || "");
          if (rawEvent === "task.created") {
            const title = String(rawPayload.title || "");
            const project = String(rawPayload.project || "");
            const parts = [title ? "title: " + title : "", project ? "project: " + project : ""]
              .filter(Boolean)
              .join(" | ");
            return parts ? "A new task entered the queue (" + parts + ")." : "A new task entered the queue.";
          }
          if (rawEvent === "task.cancel_requested") {
            return reason
              ? "Cancellation was requested for task (reason: " + reason + ")."
              : "Cancellation was requested for task.";
          }
          const context = [
            status ? "status " + status : "",
            stage ? "stage " + stage : "",
            currentAgent ? "agent " + currentAgent : "",
            nextAgent ? "next " + nextAgent : "",
            reason ? "reason " + reason : "",
          ].filter(Boolean).join(" | ");
          return context ? "Task state changed (" + context + ")." : "Task state changed in the execution flow.";
        }
        return "System event received.";
      }

      function setView(view) {
        state.view = view;
        navButtons.forEach((button) => {
          const isActive = button.dataset.view === view;
          button.classList.toggle("active", isActive);
          if (isActive) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
        });
        requestRender("user");
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
        if (!document.getElementById("overview-root")) {
          contentEl.innerHTML = [
            '<div id="overview-root">',
            '<div class="grid">',
            '<div class="metric"><div class="muted">Engine</div><strong id="overview-engine"></strong></div>',
            '<div class="metric"><div class="muted">Active Tasks</div><strong id="overview-active"></strong></div>',
            '<div class="metric"><div class="muted">Waiting Human</div><strong id="overview-waiting"></strong></div>',
            '<div class="metric"><div class="muted">Done</div><strong id="overview-done"></strong></div>',
            '<div class="metric"><div class="muted">Failed</div><strong id="overview-failed"></strong></div>',
            '<div class="metric"><div class="muted">Estimated Tokens</div><strong id="overview-tokens"></strong></div>',
            '<div class="metric"><div class="muted">Estimated Cost</div><strong id="overview-cost"></strong></div>',
            '<div class="metric"><div class="muted">Review Queue</div><strong id="overview-review-queue"></strong></div>',
            '</div>',
            '<div class="card" style="margin-top: 14px; box-shadow: none; border: 1px solid var(--border);">',
            '<p>Last heartbeat: <code id="overview-heartbeat"></code></p>',
            '<p style="margin-top: 8px;">Top slow stage (24h): <strong id="overview-slow-stage"></strong></p>',
            '</div>',
            "</div>",
          ].join("");
        }

        setTextIfChanged("overview-engine", healthLabel);
        setTextIfChanged("overview-active", fmtNumber(overview.counts.active));
        setTextIfChanged("overview-waiting", fmtNumber(overview.counts.waitingHuman));
        setTextIfChanged("overview-done", fmtNumber(overview.counts.done));
        setTextIfChanged("overview-failed", fmtNumber(overview.counts.failed));
        setTextIfChanged("overview-tokens", fmtNumber(overview.consumption.estimatedTotalTokens));
        setTextIfChanged("overview-cost", fmtCost(overview.consumption.estimatedCostUsd));
        setTextIfChanged("overview-review-queue", fmtNumber(overview.reviewQueueCount));
        setTextIfChanged("overview-heartbeat", fmtDateTime(runtime.lastHeartbeatAt || ""));
        setTextIfChanged("overview-slow-stage", topSlowStage ? topSlowStage.stage : "N/A");
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
        const tasksKey = query + "::" + tasks
          .map((task) => [
            task.taskId,
            task.status,
            task.currentStage,
            task.currentAgent,
            task.nextAgent,
            task.updatedAt,
            task.consumption && task.consumption.estimatedTotalTokens,
            task.consumption && task.consumption.estimatedCostUsd,
          ].join("|"))
          .join(";");
        if (state.tasksRenderedKey === tasksKey && document.getElementById("tasks-root")) return;
        contentEl.innerHTML = [
          '<div id="tasks-root">',
          '<div class="toolbar">',
          '<input id="task-search" placeholder="Search by task id, title, or project..." value="' + escapeHtml(state.search) + '" />',
          '<div class="muted">' + fmtNumber(tasks.length) + " tasks</div>",
          "</div>",
          renderTaskRows(tasks),
          "</div>",
        ].join("");
        state.tasksRenderedKey = tasksKey;
      }

      function boardColumnForTask(task) {
        const status = String(task.status || "");
        const currentAgent = String(task.currentAgent || "").toLowerCase();
        const nextAgent = String(task.nextAgent || "").toLowerCase();
        const stage = String(task.currentStage || "").toLowerCase();
        const context = [currentAgent, nextAgent, stage].join(" ");

        if (status === "done") return "done";
        if (status === "failed" || status === "blocked" || status === "archived") return "failed";
        if (task.humanApprovalRequired || status === "waiting_human" || context.includes("human review")) return "human";
        if (context.includes("dispatcher")) return "dispatcher";
        if (context.includes("planner")) return "planner";
        if (context.includes("research")) return "research";
        if (context.includes("qa")) return "qa";
        if (
          context.includes("expert")
          || context.includes("specialist")
          || context.includes("engineer")
          || context.includes("front")
          || context.includes("back")
          || context.includes("mobile")
          || context.includes("seo")
          || status === "waiting_agent"
          || status === "in_progress"
        ) {
          return "experts";
        }
        return "new";
      }

      async function renderBoard() {
        const tasks = await api("/api/tasks");
        const key = tasks
          .map((task) => [task.taskId, task.status, task.currentAgent, task.nextAgent, task.currentStage, task.updatedAt].join("|"))
          .join(";");
        if (state.boardRenderedKey === key && document.getElementById("board-root")) return;

        const columns = [
          { id: "new", title: "New Queue", hint: "Newly created or not yet assigned" },
          { id: "dispatcher", title: "Dispatcher", hint: "Task routing and orchestration" },
          { id: "planner", title: "Planner", hint: "Plan decomposition and sequencing" },
          { id: "research", title: "Researcher", hint: "External discovery and grounding" },
          { id: "experts", title: "Experts", hint: "Implementation by SYNX specialists" },
          { id: "qa", title: "QA", hint: "Validation and retry loops" },
          { id: "human", title: "Human Review", hint: "Waiting for approve/reprove" },
          { id: "done", title: "Done", hint: "Completed successfully" },
          { id: "failed", title: "Failed/Blocked", hint: "Needs intervention" },
        ];

        const byColumn = {};
        for (const column of columns) byColumn[column.id] = [];
        for (const task of tasks) {
          const columnId = boardColumnForTask(task);
          if (!Array.isArray(byColumn[columnId])) byColumn[columnId] = [];
          byColumn[columnId].push(task);
        }
        for (const column of columns) {
          byColumn[column.id].sort((a, b) => Date.parse(String(b.updatedAt || "")) - Date.parse(String(a.updatedAt || "")));
        }

        contentEl.innerHTML = [
          '<div id="board-root">',
          '<div class="toolbar"><div class="muted">Auto-updating board: cards move by agent/stage on each poll and realtime event.</div><div class="muted">' + fmtNumber(tasks.length) + " tasks</div></div>",
          '<div class="board-columns">',
          columns.map((column) => {
            const cards = byColumn[column.id] || [];
            const cardHtml = cards.length
              ? cards.map((task) => {
                const stage = String(task.currentStage || "[none]");
                const currentAgent = String(task.currentAgent || "[none]");
                const nextAgent = String(task.nextAgent || "[none]");
                return [
                  '<article class="board-card ' + escapeHtml(task.status) + '">',
                  '<div class="head"><div><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title) + '</button><div class="id">' + escapeHtml(task.taskId) + '</div></div>' + taskStatusBadge(task.status) + "</div>",
                  '<div class="summary">Current: ' + escapeHtml(currentAgent) + " | Next: " + escapeHtml(nextAgent) + "</div>",
                  '<div class="summary">Stage: ' + escapeHtml(stage) + " | Tokens: " + fmtNumber(task.consumption && task.consumption.estimatedTotalTokens) + "</div>",
                  '<div class="summary">Updated: ' + escapeHtml(fmtDateTime(task.updatedAt)) + "</div>",
                  "</article>",
                ].join("");
              }).join("")
              : '<div class="empty">No tasks in this lane.</div>';
            return [
              '<section class="board-column">',
              "<h3>" + escapeHtml(column.title) + "</h3>",
              '<div class="meta muted">' + escapeHtml(column.hint) + " • " + fmtNumber(cards.length) + "</div>",
              '<div class="board-stack">',
              cardHtml,
              "</div>",
              "</section>",
            ].join("");
          }).join(""),
          "</div>",
          "</div>",
        ].join("");
        state.boardRenderedKey = key;
      }

      async function renderReviewQueue() {
        const queue = await api("/api/review-queue");
        const queueKey = queue.map((task) => [task.taskId, task.status, task.updatedAt, task.currentStage].join("|")).join(";");
        if (!queue.length) {
          if (state.reviewRenderedKey !== "" || document.getElementById("review-root")) {
            contentEl.innerHTML = '<div class="empty">No tasks waiting for human review.</div>';
          }
          state.reviewRenderedKey = "";
          return;
        }
        if (state.reviewRenderedKey === queueKey && document.getElementById("review-root")) {
          return;
        }
        const reasonValue = escapeHtml(state.reviewDraftReason || "");
        const rollbackValue = state.reviewRollbackMode === "task" ? "task" : "none";
        contentEl.innerHTML = [
          '<div id="review-root">',
          '<div class="review-toolbar">',
          '<div class="muted" style="margin-bottom:8px;">Review controls apply to reprove actions in this queue. Approve can run directly.</div>',
          '<textarea id="review-reason" class="field-input" rows="2" placeholder="Reason for reprove (required to reprove)">' + reasonValue + "</textarea>",
          '<div class="actions" style="margin-top:8px;">',
          '<select id="review-rollback" class="field-select">',
          '<option value="none"' + (rollbackValue === "none" ? " selected" : "") + '>Rollback: none</option>',
          '<option value="task"' + (rollbackValue === "task" ? " selected" : "") + '>Rollback: task-scoped</option>',
          "</select>",
          '<div class="muted">Queue size: ' + fmtNumber(queue.length) + "</div>",
          "</div>",
          "</div>",
          queue.map((task) => [
            '<article class="review-card">',
            '<div class="review-card-header">',
            '<div><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title) + "</button><br/><small>" + escapeHtml(task.taskId) + "</small></div>",
            taskStatusBadge(task.status),
            "</div>",
            '<div class="review-card-meta"><span>Type: ' + escapeHtml(task.type) + "</span><span>Updated: " + escapeHtml(fmtDateTime(task.updatedAt)) + "</span></div>",
            '<div class="actions">',
            '<button type="button" class="btn approve" data-task-action="approve" data-task-id="' + escapeHtml(task.taskId) + '">Approve</button>',
            '<button type="button" class="btn reprove" data-task-action="reprove" data-task-id="' + escapeHtml(task.taskId) + '">Reprove</button>',
            '<button type="button" class="btn" data-open-task="' + escapeHtml(task.taskId) + '">Open Detail</button>',
            "</div>",
            "</article>",
          ].join("")).join(""),
          "</div>",
        ].join("");
        state.reviewRenderedKey = queueKey;
      }

      async function renderDetail() {
        if (!state.selectedTaskId) {
          state.detailRenderedKey = "";
          contentEl.innerHTML = '<div class="empty">Choose a task from Tasks or Review Queue.</div>';
          return;
        }

        const detail = await api("/api/tasks/" + encodeURIComponent(state.selectedTaskId));
        const eventLines = Array.isArray(detail.recentEvents) ? detail.recentEvents : [];
        const detailKey = [
          detail.taskId,
          detail.status,
          detail.currentStage,
          detail.currentAgent,
          detail.nextAgent,
          detail.updatedAt,
          eventLines.length,
          eventLines.length ? eventLines[eventLines.length - 1] : "",
          (detail.views || []).length,
          (detail.doneArtifacts || []).length,
          (detail.humanArtifacts || []).length,
          state.reviewAlertAt,
        ].join("|");
        if (state.detailRenderedKey === detailKey && document.getElementById("detail-root")) return;
        const canReview = Boolean(detail.humanApprovalRequired) || detail.status === "waiting_human";
        const canCancel = ["new", "in_progress", "waiting_agent"].includes(detail.status);
        const actionPanel = (canReview || canCancel)
          ? [
            '<h3 class="section-title">Human Actions</h3>',
            '<div class="panel-block">',
            '<textarea id="action-reason" class="field-input" rows="3" placeholder="Reason (required for reprove, optional for cancel)"></textarea>',
            '<div class="actions" style="margin-top: 8px;">',
            '<select id="action-rollback" class="field-select">',
            '<option value="none">Rollback: none</option>',
            '<option value="task">Rollback: task-scoped</option>',
            '</select>',
            canReview ? '<button type="button" class="btn approve" data-task-action="approve">Approve</button>' : "",
            canReview ? '<button type="button" class="btn reprove" data-task-action="reprove">Reprove</button>' : "",
            canCancel ? '<button type="button" class="btn cancel" data-task-action="cancel">Cancel Task</button>' : "",
            "</div>",
            "</div>",
          ].join("")
          : '<h3 class="section-title">Human Actions</h3><div class="empty">No manual action available for this task status.</div>';
        const reviewSignal = state.reviewAlertAt
          ? '<p class="review-alert">Attention: new task entered waiting_human at ' + escapeHtml(state.reviewAlertAt) + "</p>"
          : "";
        contentEl.innerHTML = [
          '<div id="detail-root">',
          '<div class="toolbar"><div><strong>' + escapeHtml(detail.title) + '</strong><div class="muted">' + escapeHtml(detail.taskId) + '</div></div></div>',
          '<div class="grid">',
          '<div class="metric"><div class="muted">Status</div><strong>' + escapeHtml(detail.status) + "</strong></div>",
          '<div class="metric"><div class="muted">Current Stage</div><strong>' + escapeHtml(detail.currentStage || "[none]") + "</strong></div>",
          '<div class="metric"><div class="muted">Current Agent</div><strong>' + escapeHtml(detail.currentAgent || "[none]") + "</strong></div>",
          '<div class="metric"><div class="muted">Estimated Cost</div><strong>' + fmtCost(detail.consumption && detail.consumption.estimatedCostUsd) + "</strong></div>",
          "</div>",
          '<h3 class="section-title">Recent Events</h3>',
          eventLines.length ? "<pre>" + escapeHtml(eventLines.join("\\n")) + "</pre>" : '<div class="empty">No events logged yet.</div>',
          reviewSignal,
          actionPanel,
          '<h3 class="section-title">Artifacts</h3>',
          '<p class="muted">Views: ' + escapeHtml((detail.views || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Done: ' + escapeHtml((detail.doneArtifacts || []).join(", ") || "[none]") + '</p>',
          '<p class="muted">Human: ' + escapeHtml((detail.humanArtifacts || []).join(", ") || "[none]") + '</p>',
          "</div>",
        ].join("");
        state.detailRenderedKey = detailKey;
      }

      async function render(trigger) {
        const mode = trigger === "poll" ? "poll" : "user";
        const loadingMessage = state.view === "tasks"
          ? "Loading task list..."
          : state.view === "board"
          ? "Loading agent board..."
          : state.view === "review"
          ? "Loading review queue..."
          : state.view === "detail"
          ? "Loading task detail..."
          : state.view === "analytics"
          ? "Loading analytics..."
          : state.view === "overview"
          ? "Loading overview..."
          : "";

        const alreadyRendered = Boolean(state.renderedViews[state.view]);
        if (loadingMessage && !alreadyRendered && mode !== "poll") showLoading(loadingMessage);
        try {
          if (state.view === "overview") await renderOverview();
          if (state.view === "tasks") await renderTasks();
          if (state.view === "board") await renderBoard();
          if (state.view === "review") await renderReviewQueue();
          if (state.view === "detail") await renderDetail();
          if (state.view === "live") renderLive();
          if (state.view === "analytics") await renderAnalytics();
          state.renderedViews[state.view] = true;
          contentEl.setAttribute("aria-busy", "false");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown UI error";
          state.renderedViews[state.view] = false;
          contentEl.setAttribute("aria-busy", "false");
          contentEl.innerHTML = [
            '<div class="error" role="alert">Failed to load view: ' + escapeHtml(message) + "</div>",
            '<div style="margin-top:10px;"><button type="button" data-retry-render style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--fg); font-weight:600; cursor:pointer;">Retry</button></div>',
          ].join("");
          setFeedback("View loading failed. Use Retry or change section.", "error");
        }
      }

      let renderInFlight = false;
      let queuedRenderMode = "";
      function requestRender(trigger) {
        const normalized = trigger === "poll" ? "poll" : "user";
        queuedRenderMode = queuedRenderMode === "user" || normalized === "user" ? "user" : normalized;
        if (renderInFlight) return;
        renderInFlight = true;
        (async () => {
          try {
            while (queuedRenderMode) {
              const nextMode = queuedRenderMode;
              queuedRenderMode = "";
              await render(nextMode);
            }
          } finally {
            renderInFlight = false;
            if (queuedRenderMode) requestRender(queuedRenderMode);
          }
        })();
      }

      function renderLive() {
        const rows = state.liveEvents.slice().reverse();
        if (
          state.liveRenderedCount === rows.length
          && state.liveRenderedConnected === state.realtimeConnected
          && document.getElementById("live-root")
        ) {
          return;
        }
        const controls = [
          '<div class="actions" style="margin-bottom:10px;">',
          '<button type="button" class="btn" data-runtime-action="pause">Pause Engine</button>',
          '<button type="button" class="btn approve" data-runtime-action="resume">Resume Engine</button>',
          '<button type="button" class="btn cancel" data-runtime-action="stop">Graceful Stop</button>',
          "</div>",
        ].join("");
        if (!rows.length) {
          contentEl.innerHTML = '<div id="live-root">' + controls + '<div class="empty">Waiting realtime events from <code>/api/stream</code>...</div></div>';
          state.liveRenderedCount = 0;
          state.liveRenderedConnected = state.realtimeConnected;
          return;
        }
        contentEl.innerHTML = [
          '<div id="live-root">',
          '<div class="toolbar"><div class="muted">Realtime: ' + (state.realtimeConnected ? "connected" : "disconnected") + '</div></div>',
          controls,
          '<div class="event-feed">',
          rows.map((event) => {
            const payloadObj = asObject(event.payload);
            const rawEvent = String(payloadObj.rawEvent || event.type || "");
            const source = String(payloadObj.source || "");
            const tone = eventTone(event.type);
            const title = eventTitle(event.type, rawEvent);
            const summary = eventSummary(event);
            const taskLine = event.taskId ? "Task: " + event.taskId : "Task: n/a";
            const sourceLine = source ? "Source: " + source : "";
            const rawLine = rawEvent && rawEvent !== event.type ? "Raw event: " + rawEvent : "";
            return [
              '<article class="event-card">',
              '<div class="head">',
              '<div class="title"><span class="pill ' + tone + '">' + escapeHtml(event.type) + "</span> " + escapeHtml(title) + "</div>",
              '<div class="time">' + escapeHtml(fmtDateTime(event.at || "")) + "</div>",
              "</div>",
              '<div class="summary">' + escapeHtml(summary) + "</div>",
              '<div class="details">' + escapeHtml(taskLine + (sourceLine ? " | " + sourceLine : "") + (rawLine ? " | " + rawLine : "")) + "</div>",
              "</article>",
            ].join("");
          }).join(""),
          "</div>",
          "</div>",
        ].join("");
        state.liveRenderedCount = rows.length;
        state.liveRenderedConnected = state.realtimeConnected;
      }

      async function renderAnalytics() {
        const report = await api("/api/metrics/advanced?limit=12&days=30");
        const timeline = Array.isArray(report.timeline)
          ? report.timeline.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          : [];
        const analyticsKey = [
          timeline.length,
          timeline.length ? String(timeline[timeline.length - 1].date || "") : "",
          ((report.tasks || []).slice(0, 3).map((row) => [row.taskId, row.estimatedTotalTokens, row.estimatedCostUsd].join(":")).join(",")),
          ((report.agents || []).slice(0, 3).map((row) => [row.agent, row.stageCount, row.estimatedTotalTokens, row.estimatedCostUsd].join(":")).join(",")),
          ((report.projects || []).slice(0, 3).map((row) => [row.project, row.taskCount, row.estimatedTotalTokens, row.estimatedCostUsd].join(":")).join(",")),
          Number(report.qaLoops && report.qaLoops.totalQaLoops || 0),
          String((report.bottlenecks || [])[0] && (report.bottlenecks || [])[0].stage || ""),
        ].join("|");
        if (state.analyticsRenderedKey === analyticsKey && document.getElementById("analytics-root")) return;
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
            + "<td>" + escapeHtml(fmtDate(row.date || "")) + "</td>"
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
          '<div id="analytics-root">',
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
          "</div>",
        ].join("");
        state.analyticsRenderedKey = analyticsKey;
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const themeTarget = target.closest("[data-theme-option]");
        const themeOption = themeTarget instanceof HTMLElement ? themeTarget.dataset.themeOption : "";
        if (themeOption === "light" || themeOption === "dark" || themeOption === "system") {
          applyThemePreference(themeOption, true);
          setFeedback("Theme switched to " + themeOption + " mode.", "info");
          return;
        }

        const navTarget = target.closest("[data-view]");
        const navView = navTarget instanceof HTMLElement ? navTarget.dataset.view : "";
        if (navView) {
          setFeedback("", "info");
          setView(navView);
          return;
        }

        const retryTarget = target.closest("[data-retry-render]");
        if (retryTarget instanceof HTMLElement && retryTarget.dataset.retryRender !== undefined) {
          setFeedback("Retrying current section...", "info");
          requestRender("user");
          return;
        }

        const openTaskTarget = target.closest("[data-open-task]");
        const taskId = openTaskTarget instanceof HTMLElement ? openTaskTarget.dataset.openTask : "";
        if (taskId) {
          state.selectedTaskId = taskId;
          setView("detail");
          return;
        }

        const taskActionTarget = target.closest("[data-task-action]");
        const taskAction = taskActionTarget instanceof HTMLElement ? taskActionTarget.dataset.taskAction : "";
        if (taskAction) {
          const actionTaskId = taskActionTarget instanceof HTMLElement ? String(taskActionTarget.dataset.taskId || "") : "";
          const taskIdToUse = actionTaskId || state.selectedTaskId;
          if (actionTaskId) state.selectedTaskId = actionTaskId;

          const reviewReasonEl = document.getElementById("review-reason");
          const reviewRollbackEl = document.getElementById("review-rollback");
          const detailReasonEl = document.getElementById("action-reason");
          const detailRollbackEl = document.getElementById("action-rollback");
          const useReviewControls = Boolean(actionTaskId);
          const reason = useReviewControls
            ? (reviewReasonEl instanceof HTMLTextAreaElement ? reviewReasonEl.value.trim() : String(state.reviewDraftReason || "").trim())
            : (detailReasonEl instanceof HTMLTextAreaElement ? detailReasonEl.value.trim() : "");
          const rollbackMode = useReviewControls
            ? (reviewRollbackEl instanceof HTMLSelectElement ? reviewRollbackEl.value : state.reviewRollbackMode || "none")
            : (detailRollbackEl instanceof HTMLSelectElement ? detailRollbackEl.value : "none");

          (async () => {
            try {
              if (!taskIdToUse) throw new Error("Select a task first.");
              if (taskAction === "reprove" && !reason) {
                throw new Error("Reason is required to reprove.");
              }

              if (taskAction === "approve") {
                await postApi("/api/tasks/" + encodeURIComponent(taskIdToUse) + "/approve", {});
                setFeedback("Task " + taskIdToUse + " approved successfully.", "info");
              } else if (taskAction === "reprove") {
                await postApi("/api/tasks/" + encodeURIComponent(taskIdToUse) + "/reprove", {
                  reason,
                  rollbackMode,
                });
                setFeedback("Task " + taskIdToUse + " reproved and sent back to agent flow.", "info");
              } else if (taskAction === "cancel") {
                await postApi("/api/tasks/" + encodeURIComponent(taskIdToUse) + "/cancel", {
                  reason,
                });
                setFeedback("Cancellation requested for task " + taskIdToUse + ".", "info");
              }

              setPollStatus("Last action at " + fmtTimeNow());
              if (taskAction === "reprove") state.reviewDraftReason = "";
              requestRender("user");
            } catch (error) {
              const message = error instanceof Error ? error.message : "Action failed";
              setFeedback(message, "error");
            }
          })();
          return;
        }

        const runtimeActionTarget = target.closest("[data-runtime-action]");
        const runtimeAction = runtimeActionTarget instanceof HTMLElement ? runtimeActionTarget.dataset.runtimeAction : "";
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
          requestRender("user");
        }
        if (target instanceof HTMLTextAreaElement && target.id === "review-reason") {
          state.reviewDraftReason = target.value;
        }
      });

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.id === "review-rollback") {
          state.reviewRollbackMode = target.value === "task" ? "task" : "none";
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
                  state.reviewAlertAt = fmtTimeNow();
                  setPollStatus("Review required now");
                  setFeedback("New task entered waiting_human queue.", "info");
                }
                if (parsed && parsed.taskId && state.selectedTaskId && parsed.taskId === state.selectedTaskId && (type === "task.updated" || type === "task.decision_recorded" || type === "task.review_required")) {
                  if (state.view === "detail") {
                    requestRender("poll");
                  }
                }
                if (state.view === "live") requestRender("poll");
                if (state.view === "overview" && (type === "runtime.updated" || type === "metrics.updated")) {
                  requestRender("poll");
                }
                if (state.view === "review" && (type === "task.review_required" || type === "task.decision_recorded" || type === "task.updated")) {
                  requestRender("poll");
                }
                if (state.view === "board" && (type === "task.updated" || type === "task.decision_recorded" || type === "task.review_required")) {
                  requestRender("poll");
                }
                if (state.view === "analytics" && (type === "task.updated" || type === "task.decision_recorded" || type === "metrics.updated")) {
                  requestRender("poll");
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

      applyThemePreference(loadThemePreference(), false);
      bindSystemThemeSync();
      setInterval(() => requestRender("poll"), state.pollMs);
      connectRealtime();
      requestRender("user");
    </script>
  </body>
</html>`;
}
