export function buildWebUiHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SYNX — Mission Control</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #0d1117;
      --bg2:      #161b22;
      --bg3:      #1c2128;
      --border:   #21262d;
      --fg:       #e6edf3;
      --muted:    #7d8590;
      --teal:     #14b8a6;
      --teal-dim: rgba(20,184,166,0.12);
      --blue:     #58a6ff;
      --green:    #3fb950;
      --orange:   #f59e0b;
      --red:      #f85149;
      --purple:   #a78bfa;
      --yellow:   #fbbf24;
      --r:        8px;
      --r-sm:     6px;
      --font:     -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono:     "SFMono-Regular", Consolas, monospace;
      /* agent avatar bg overrides used inline — unchanged across themes */
    }

    /* ── LIGHT THEME ── */
    html[data-theme="light"] {
      --bg:       #ffffff;
      --bg2:      #f6f8fa;
      --bg3:      #eaeef2;
      --border:   #d0d7de;
      --fg:       #1f2328;
      --muted:    #636c76;
      --teal:     #0d9488;
      --teal-dim: rgba(13,148,136,0.1);
      --blue:     #0969da;
      --green:    #1a7f37;
      --orange:   #d1811c;
      --red:      #cf222e;
      --purple:   #7c3aed;
      --yellow:   #b08800;
    }

    /* ── SYSTEM THEME (follows OS) ── */
    @media (prefers-color-scheme: light) {
      html[data-theme="system"] {
        --bg:       #ffffff;
        --bg2:      #f6f8fa;
        --bg3:      #eaeef2;
        --border:   #d0d7de;
        --fg:       #1f2328;
        --muted:    #636c76;
        --teal:     #0d9488;
        --teal-dim: rgba(13,148,136,0.1);
        --blue:     #0969da;
        --green:    #1a7f37;
        --orange:   #d1811c;
        --red:      #cf222e;
        --purple:   #7c3aed;
        --yellow:   #b08800;
      }
    }

    /* light-mode agent avatar backgrounds are too dark — soften them */
    html[data-theme="light"] .agent-av,
    html[data-theme="system"] .agent-av { filter: brightness(1.6) saturate(0.8); }
    @media (prefers-color-scheme: dark) {
      html[data-theme="system"] .agent-av { filter: none; }
    }

    /* light prompt card gradient */
    html[data-theme="light"] .prompt-card,
    html[data-theme="system"] .prompt-card {
      background: linear-gradient(135deg, #e8f4f8 0%, #f0faf8 60%, #f8fbff 100%);
      border-color: rgba(13,148,136,0.3);
    }
    html[data-theme="light"] .prompt-card::after,
    html[data-theme="system"] .prompt-card::after { opacity: 0.06; }
    @media (prefers-color-scheme: dark) {
      html[data-theme="system"] .prompt-card { background: linear-gradient(135deg,#112240 0%,#0f1f35 60%,#0a1628 100%); border-color: rgba(20,184,166,.25); }
      html[data-theme="system"] .prompt-card::after { opacity: .12; }
    }

    body { background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 14px; line-height: 1.5; overflow-x: hidden; }
    button, input, textarea, select { font-family: inherit; }
    button { cursor: pointer; }

    /* ── layout ── */
    .layout { display: flex; min-height: 100vh; }

    /* ── sidebar ── */
    .sidebar {
      width: 220px; flex-shrink: 0;
      background: var(--bg); border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      position: fixed; top: 0; left: 0; bottom: 0; z-index: 20;
    }
    .sidebar-brand {
      padding: 18px 14px 16px;
      display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .brand-icon {
      width: 34px; height: 34px; border-radius: 8px;
      background: linear-gradient(135deg, #14b8a6 0%, #3b82f6 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 17px; flex-shrink: 0;
    }
    .brand-text-name { font-size: 15px; font-weight: 700; letter-spacing: 0.04em; }
    .brand-text-sub  { font-size: 11px; color: var(--muted); }

    .sidebar-group { padding: 14px 8px 4px; }
    .sidebar-label {
      font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--muted); padding: 0 8px 8px;
    }
    .nav-btn {
      display: flex; align-items: center; gap: 9px;
      width: 100%; padding: 7px 10px; border-radius: var(--r-sm);
      background: none; border: none; color: var(--muted);
      font-size: 13px; font-weight: 500; text-align: left;
      transition: color .15s, background .15s; position: relative;
    }
    .nav-btn:hover { color: var(--fg); background: rgba(255,255,255,.05); }
    .nav-btn.active { color: var(--teal); background: var(--teal-dim); }
    .nav-btn.active::before {
      content: ''; position: absolute; left: 0; top: 20%; height: 60%; width: 3px;
      background: var(--teal); border-radius: 0 2px 2px 0;
    }
    .nav-icon { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }
    .nav-badge {
      margin-left: auto; background: var(--red); color: #fff;
      font-size: 10px; font-weight: 700; padding: 1px 5px;
      border-radius: 10px; min-width: 18px; text-align: center; display: none;
    }
    .nav-badge.on { display: block; }

    .sidebar-footer { margin-top: auto; padding: 12px 8px; border-top: 1px solid var(--border); }
    .engine-pill {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; background: var(--bg2); border-radius: var(--r-sm);
      font-size: 12px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-run  { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .dot-stop { background: var(--red); }
    .dot-unk  { background: var(--muted); }

    /* ── main ── */
    .main { margin-left: 220px; flex: 1; display: flex; flex-direction: column; }

    .topbar {
      padding: 14px 24px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 12px;
      background: var(--bg); position: sticky; top: 0; z-index: 10;
    }
    .topbar-title { font-size: 17px; font-weight: 700; }
    .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

    .theme-btn {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-sm);
      padding: 4px 8px; font-size: 15px; line-height: 1; cursor: pointer;
      transition: background .15s;
    }
    .theme-btn:hover { background: var(--bg3); }

    .pill-run {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 20px;
      background: rgba(63,185,80,.12); border: 1px solid rgba(63,185,80,.3);
      font-size: 12px; font-weight: 600; color: var(--green);
    }
    .pill-stop {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 20px;
      background: rgba(248,81,73,.1); border: 1px solid rgba(248,81,73,.3);
      font-size: 12px; font-weight: 600; color: var(--red);
    }

    /* ── pages ── */
    .page { display: none; padding: 24px; }
    .page.active { display: block; }

    /* ── prompt card ── */
    .prompt-card {
      background: linear-gradient(135deg, #112240 0%, #0f1f35 60%, #0a1628 100%);
      border: 1px solid rgba(20,184,166,.25); border-radius: var(--r);
      padding: 24px; margin-bottom: 20px; position: relative; overflow: hidden;
    }
    .prompt-card::after {
      content: '🤖'; position: absolute; right: 24px; top: 50%;
      transform: translateY(-50%); font-size: 52px; opacity: .12; pointer-events: none;
    }
    .prompt-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .prompt-card p  { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
    .prompt-row { display: flex; gap: 8px; }
    .prompt-ta {
      flex: 1; resize: none; min-height: 44px; max-height: 120px;
      background: rgba(13,17,23,.85); border: 1px solid rgba(20,184,166,.3);
      border-radius: var(--r-sm); color: var(--fg); padding: 10px 13px;
      font-size: 13px; outline: none; transition: border-color .15s; overflow-y: auto;
    }
    .prompt-ta:focus { border-color: var(--teal); }
    .prompt-ta::placeholder { color: var(--muted); }
    .btn-send {
      padding: 10px 20px; border-radius: var(--r-sm);
      background: var(--teal); color: #0d1117;
      font-size: 13px; font-weight: 700; border: none;
      white-space: nowrap; align-self: flex-end;
      transition: background .15s, opacity .15s;
    }
    .btn-send:hover:not(:disabled) { background: #0d9488; }
    .btn-send:disabled { opacity: .4; cursor: not-allowed; }
    .prompt-msg { margin-top: 8px; font-size: 12px; min-height: 16px; }
    .prompt-msg.ok  { color: var(--green); }
    .prompt-msg.err { color: var(--red); }

    /* ── stats grid ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px; margin-bottom: 20px;
    }
    .stat-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r);
      padding: 16px; display: flex; flex-direction: column; gap: 6px;
    }
    .stat-icon  { font-size: 15px; color: var(--muted); }
    .stat-num   { font-size: 30px; font-weight: 700; line-height: 1; }
    .stat-label { font-size: 12px; color: var(--muted); }
    .c-teal   { color: var(--teal); }
    .c-green  { color: var(--green); }
    .c-blue   { color: var(--blue); }
    .c-orange { color: var(--orange); }
    .c-red    { color: var(--red); }
    .c-muted  { color: var(--muted); }

    /* ── two-col ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    /* ── section card ── */
    .sc { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; }
    .sc-head {
      padding: 14px 18px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .sc-head h3 { font-size: 14px; font-weight: 600; }
    .sc-link { font-size: 12px; color: var(--teal); background: none; border: none; }
    .sc-link:hover { text-decoration: underline; }

    /* ── task rows (dashboard) ── */
    .task-row-d {
      display: flex; align-items: center; gap: 11px;
      padding: 12px 18px; border-bottom: 1px solid var(--border);
      cursor: pointer; transition: background .1s;
    }
    .task-row-d:last-child { border-bottom: none; }
    .task-row-d:hover { background: rgba(255,255,255,.03); }
    .tdot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .tinfo { flex: 1; min-width: 0; }
    .ttitle { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tsub   { font-size: 11px; color: var(--muted); }
    .ttime  { font-size: 11px; color: var(--muted); white-space: nowrap; }

    /* ── agent list ── */
    .agent-row {
      display: flex; align-items: center; gap: 11px;
      padding: 11px 18px; border-bottom: 1px solid var(--border);
    }
    .agent-row:last-child { border-bottom: none; }
    .agent-av {
      width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .agent-info { flex: 1; min-width: 0; }
    .agent-name { font-size: 13px; font-weight: 600; }
    .agent-role { font-size: 11px; color: var(--muted); }
    .agent-dot  { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .ad-idle    { background: var(--muted); }
    .ad-work    { background: var(--teal);   box-shadow: 0 0 6px var(--teal); }
    .ad-review  { background: var(--orange); box-shadow: 0 0 6px var(--orange); }

    /* ── tasks page ── */
    .search-row {
      padding: 11px 18px; border-bottom: 1px solid var(--border);
      display: flex; gap: 8px; background: var(--bg2);
    }
    .sinput {
      flex: 1; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 7px 11px;
      font-size: 13px; outline: none;
    }
    .sinput:focus { border-color: var(--teal); }
    .sselect {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 7px 10px;
      font-size: 13px; outline: none;
    }

    table { width: 100%; border-collapse: collapse; }
    th {
      padding: 9px 18px; text-align: left; font-size: 11px; font-weight: 700;
      color: var(--muted); text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 1px solid var(--border); white-space: nowrap;
      background: var(--bg2);
    }
    td { padding: 12px 18px; border-bottom: 1px solid var(--border); font-size: 13px; background: var(--bg); }
    tr:last-child td { border-bottom: none; }
    tr.trow:hover > td { background: rgba(255,255,255,.025); cursor: pointer; }

    /* badges */
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap;
    }
    .bn  { background: var(--bg3); color: var(--muted); }
    .bip { background: rgba(88,166,255,.1); color: var(--blue); }
    .bwa { background: rgba(20,184,166,.1); color: var(--teal); }
    .bwh { background: rgba(245,158,11,.12); color: var(--orange); }
    .bd  { background: rgba(63,185,80,.1); color: var(--green); }
    .bf  { background: rgba(248,81,73,.1); color: var(--red); }
    .bb  { background: rgba(251,191,36,.1); color: var(--yellow); }
    .bar { background: var(--bg3); color: var(--muted); }

    /* expand */
    .expand-row { display: none; background: rgba(0,0,0,.25); }
    .expand-row.open { display: table-row; }
    .expand-inner { padding: 14px 18px; }
    .expand-raw { font-size: 12px; color: var(--muted); margin-bottom: 12px; line-height: 1.6; }
    .expand-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .expand-msg { font-size: 12px; margin-top: 8px; }
    .expand-msg.ok  { color: var(--green); }
    .expand-msg.err { color: var(--red); }

    /* buttons */
    .btn {
      padding: 6px 13px; border-radius: var(--r-sm); font-size: 12px; font-weight: 600;
      border: 1px solid var(--border); background: var(--bg3); color: var(--fg);
      transition: background .15s;
    }
    .btn:hover:not(:disabled) { background: rgba(255,255,255,.08); }
    .btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-approve { background: rgba(63,185,80,.1);   border-color: rgba(63,185,80,.4);   color: var(--green); }
    .btn-approve:hover:not(:disabled) { background: rgba(63,185,80,.25); }
    .btn-reprove { background: rgba(248,81,73,.1);   border-color: rgba(248,81,73,.4);   color: var(--red); }
    .btn-reprove:hover:not(:disabled) { background: rgba(248,81,73,.25); }
    .btn-cancel  { background: rgba(245,158,11,.1);  border-color: rgba(245,158,11,.4);  color: var(--orange); }
    .btn-cancel:hover:not(:disabled)  { background: rgba(245,158,11,.25); }

    /* ── review page ── */
    .rv-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r); margin-bottom: 14px; overflow: hidden; }
    .rv-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
    .rv-head h4 { flex: 1; font-size: 14px; font-weight: 600; }
    .rv-body { padding: 16px 18px; }
    .rv-raw { font-size: 12px; color: var(--muted); margin-bottom: 13px; line-height: 1.6; }
    .rv-actions { display: flex; gap: 8px; }
    .rv-msg { margin-top: 10px; font-size: 12px; }
    .rv-msg.ok  { color: var(--green); }
    .rv-msg.err { color: var(--red); }

    .empty { padding: 48px 24px; text-align: center; color: var(--muted); font-size: 13px; }

    /* ── stream page ── */
    .stream-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; }
    .stream-toolbar {
      padding: 10px 18px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600;
    }
    .stream-count { margin-left: auto; font-size: 12px; color: var(--muted); }
    .stream-log { font-family: var(--mono); font-size: 12px; max-height: calc(100vh - 200px); overflow-y: auto; }
    .srow { display: grid; grid-template-columns: 72px 150px 1fr; gap: 10px; padding: 5px 18px; }
    .srow:hover { background: rgba(255,255,255,.03); }
    .s-t { color: var(--muted); }
    .s-e { color: var(--teal); }
    .s-m { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stream-empty { padding: 32px; text-align: center; color: var(--muted); font-family: var(--font); font-size: 13px; }

    /* ── modal ── */
    .modal-back { position: fixed; inset: 0; background: rgba(0,0,0,.72); display: none; align-items: center; justify-content: center; z-index: 100; }
    .modal-back.open { display: flex; }
    .modal-box {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r);
      padding: 24px; width: 100%; max-width: 480px; margin: 16px;
    }
    .modal-box h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .modal-box p  { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
    .modal-label  { font-size: 12px; color: var(--muted); display: block; margin-bottom: 5px; font-weight: 600; }
    .modal-ta {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 8px 12px;
      font-size: 13px; resize: vertical; min-height: 88px; outline: none;
    }
    .modal-ta:focus { border-color: var(--teal); }
    .modal-check { display: flex; align-items: center; gap: 8px; margin-top: 11px; font-size: 13px; }
    .modal-err {
      margin-top: 10px; padding: 8px 12px; display: none;
      background: rgba(248,81,73,.1); border: 1px solid rgba(248,81,73,.3);
      border-radius: var(--r-sm); color: var(--red); font-size: 12px;
    }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }

    /* scrollbar */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* ── task detail drawer ── */
    #drawer {
      position: fixed; top: 0; right: 0; bottom: 0; width: 520px; max-width: 100vw;
      background: var(--bg2); border-left: 1px solid var(--border);
      z-index: 50; transform: translateX(100%); transition: transform .25s ease;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #drawer.open { transform: translateX(0); }
    .drawer-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      z-index: 49; display: none;
    }
    .drawer-overlay.open { display: block; }
    .drawer-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0;
    }
    .drawer-close {
      margin-left: auto; background: none; border: none; color: var(--muted);
      font-size: 18px; padding: 2px 6px; border-radius: var(--r-sm);
      cursor: pointer; line-height: 1; flex-shrink: 0;
    }
    .drawer-close:hover { color: var(--fg); background: var(--bg3); }
    .drawer-tabs {
      display: flex; border-bottom: 1px solid var(--border);
      padding: 0 20px; flex-shrink: 0;
    }
    .drawer-tab {
      padding: 8px 14px; font-size: 13px; background: none; border: none;
      color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -1px; font-weight: 500;
    }
    .drawer-tab.active { color: var(--teal); border-bottom-color: var(--teal); }
    .drawer-body { flex: 1; overflow-y: auto; padding: 20px; }
    .dtab-panel { display: none; }
    .dtab-panel.active { display: block; }
    .drawer-section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: var(--muted); margin-bottom: 10px; margin-top: 18px;
    }
    .drawer-section-title:first-child { margin-top: 0; }
    .drawer-field { font-size: 13px; color: var(--fg); line-height: 1.6; word-break: break-word; }
    .timeline-item {
      display: flex; gap: 12px; margin-bottom: 10px; position: relative;
    }
    .timeline-item::before {
      content: ''; position: absolute; left: 9px; top: 20px;
      width: 2px; bottom: -10px; background: var(--border);
    }
    .timeline-item:last-child::before { display: none; }
    .tl-dot {
      width: 20px; height: 20px; border-radius: 50%; background: var(--bg3);
      border: 2px solid var(--border); flex-shrink: 0; margin-top: 2px;
    }
    .tl-content { flex: 1; }
    .tl-agent { font-size: 13px; font-weight: 600; }
    .tl-meta { font-size: 11px; color: var(--muted); }
    .artifact-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); margin-bottom: 7px; cursor: pointer;
      transition: background .1s; border-left: 3px solid var(--border);
    }
    .artifact-item:hover { background: var(--bg3); border-left-color: var(--teal); }
    .artifact-icon { font-size: 14px; }
    .artifact-name { font-size: 12px; font-weight: 500; flex: 1; font-family: var(--mono); }
    .artifact-scope { font-size: 11px; color: var(--muted); }
    .artifact-content {
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-sm);
      padding: 12px 14px; font-size: 11px; font-family: var(--mono); line-height: 1.5;
      max-height: 280px; overflow: auto; margin-top: 8px; margin-bottom: 12px;
      white-space: pre-wrap; word-break: break-all;
    }

    /* ── settings page ── */
    .settings-section {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r);
      margin-bottom: 20px; overflow: hidden;
    }
    .settings-section-head {
      padding: 14px 20px; border-bottom: 1px solid var(--border);
      font-size: 14px; font-weight: 600;
    }
    .settings-section-body { padding: 20px; }
    .cfg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cfg-table th {
      text-align: left; padding: 8px 12px; font-size: 11px; color: var(--muted);
      font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 1px solid var(--border); background: var(--bg);
    }
    .cfg-table td {
      padding: 10px 12px; border-bottom: 1px solid var(--border);
      background: var(--bg2);
    }
    .cfg-table tr:last-child td { border-bottom: none; }
    .cfg-chip {
      display: inline-flex; align-items: center;
      padding: 2px 9px; border-radius: 12px; font-size: 11px; font-weight: 600;
      background: var(--bg3); color: var(--fg); white-space: nowrap; margin-right: 4px;
    }
    .cfg-chip.anthropic  { background: rgba(255,140,0,.12); color: #ff8c00; }
    .cfg-chip.openai,
    .cfg-chip.openai-compatible { background: rgba(20,184,166,.12); color: var(--teal); }
    .cfg-chip.lmstudio   { background: rgba(167,139,250,.12); color: var(--purple); }
    .cfg-chip.google     { background: rgba(88,166,255,.12); color: var(--blue); }
    .cfg-chip.mock       { background: rgba(125,133,144,.15); color: var(--muted); }
    .runtime-row {
      display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .runtime-row-label { min-width: 220px; }
    .runtime-row-label label { font-size: 13px; font-weight: 500; display: block; }
    .rt-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .rinput {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 6px 10px;
      font-size: 13px; outline: none; width: 100px;
    }
    .rinput:focus { border-color: var(--teal); }
    .runtime-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .settings-msg { font-size: 12px; margin-top: 10px; min-height: 16px; }
    .settings-msg.ok  { color: var(--green); }
    .settings-msg.err { color: var(--red); }
    .project-info-row { display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px; }
    .project-info-key { color: var(--muted); min-width: 130px; font-weight: 500; }

    /* ── metrics page ── */
    .metrics-period { display: flex; gap: 8px; margin-bottom: 20px; }
    .period-btn {
      padding: 5px 16px; border-radius: var(--r-sm); font-size: 12px; font-weight: 600;
      border: 1px solid var(--border); background: var(--bg2); color: var(--muted); cursor: pointer;
      transition: background .15s;
    }
    .period-btn.active { background: var(--teal-dim); border-color: var(--teal); color: var(--teal); }
    .sparkline-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r);
      padding: 18px 20px; margin-bottom: 20px;
    }
    .sparkline-card h4 { font-size: 13px; font-weight: 600; margin-bottom: 12px; }
    .sparkline-svg { width: 100%; height: 64px; display: block; }
    .ranking-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .ranking-table th {
      text-align: left; padding: 8px 14px;
      font-size: 11px; color: var(--muted); font-weight: 700;
      text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 1px solid var(--border); background: var(--bg2);
    }
    .ranking-table td {
      padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg);
    }
    .ranking-table tr:last-child td { border-bottom: none; }
    .rank-bar-wrap { width: 100%; background: var(--bg3); border-radius: 4px; height: 5px; margin-top: 5px; }
    .rank-bar { height: 5px; border-radius: 4px; background: var(--teal); }

    /* ── new-task modal ── */
    .modal-input {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 8px 12px;
      font-size: 13px; outline: none; margin-bottom: 10px;
    }
    .modal-input:focus { border-color: var(--teal); }
    .modal-row { display: flex; gap: 10px; margin-bottom: 10px; }
    .modal-select {
      flex: 1; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 8px 12px;
      font-size: 13px; outline: none;
    }
    .modal-select:focus { border-color: var(--teal); }

    /* ── topbar extras ── */
    .btn-newtask {
      padding: 5px 13px; border-radius: var(--r-sm);
      background: var(--teal-dim); border: 1px solid rgba(20,184,166,.35); color: var(--teal);
      font-size: 12px; font-weight: 700; cursor: pointer; transition: background .15s;
    }
    .btn-newtask:hover { background: rgba(20,184,166,.2); }
    .btn-notif {
      background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-sm);
      padding: 4px 8px; font-size: 14px; cursor: pointer; transition: background .15s;
      position: relative; line-height: 1.4;
    }
    .btn-notif:hover { background: var(--bg3); }
    .notif-dot {
      position: absolute; top: 3px; right: 3px; width: 7px; height: 7px;
      border-radius: 50%; background: var(--orange); display: none;
    }
    .notif-dot.on { display: block; }

    /* ── inline command footer ── */
    .cmd-footer { border-top: 1px solid var(--border); padding: 8px; }
    .cmd-wrap { display: flex; gap: 6px; align-items: center; }
    .cmd-input {
      flex: 1; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg); padding: 5px 9px;
      font-size: 12px; font-family: var(--mono); outline: none;
    }
    .cmd-input:focus { border-color: var(--teal); }
    .cmd-out {
      margin-top: 5px; font-size: 11px; font-family: var(--mono); color: var(--muted);
      max-height: 56px; overflow: hidden; white-space: pre-wrap;
    }

    @media (max-width: 900px) {
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
      .two-col    { grid-template-columns: 1fr; }
      #drawer { width: 100vw; }
    }
  </style>
</head>
<body>
<div class="layout">

  <!-- ── SIDEBAR ── -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-text-name">SYNX</div>
        <div class="brand-text-sub">Mission Control</div>
      </div>
    </div>

    <div class="sidebar-group">
      <div class="sidebar-label">Screens</div>
      <button class="nav-btn active" data-page="dashboard" onclick="go('dashboard')">
        <span class="nav-icon">◈</span> Dashboard
      </button>
      <button class="nav-btn" data-page="tasks" onclick="go('tasks')">
        <span class="nav-icon">≡</span> Task Board
        <span class="nav-badge" id="nb-active">0</span>
      </button>
      <button class="nav-btn" data-page="review" onclick="go('review')">
        <span class="nav-icon">◉</span> Review Queue
        <span class="nav-badge" id="nb-review">0</span>
      </button>
      <button class="nav-btn" data-page="stream" onclick="go('stream')">
        <span class="nav-icon">⊕</span> Live Stream
      </button>
      <button class="nav-btn" data-page="metrics" onclick="go('metrics')">
        <span class="nav-icon">📊</span> Metrics
      </button>
      <button class="nav-btn" data-page="settings" onclick="go('settings')">
        <span class="nav-icon">⚙️</span> Settings
      </button>
    </div>

    <div class="sidebar-footer">
      <div class="engine-pill" style="margin-bottom:8px">
        <span class="dot dot-unk" id="engine-dot"></span>
        <span id="engine-label">Connecting…</span>
      </div>
      <div class="cmd-footer">
        <div class="cmd-wrap">
          <input class="cmd-input" id="cmd-input" placeholder="> synx approve …" autocomplete="off">
          <button class="btn" style="font-size:11px;padding:4px 8px" onclick="runCmd()">Run</button>
        </div>
        <div class="cmd-out" id="cmd-out"></div>
      </div>
    </div>
  </aside>

  <!-- ── MAIN ── -->
  <main class="main">

    <div class="topbar">
      <span class="topbar-title" id="topbar-title">Dashboard</span>
      <div class="topbar-right">
        <button class="btn-newtask" onclick="openNewTask()">＋ Nova Task</button>
        <button class="btn-notif" id="btn-notif" onclick="requestNotifPermission()" title="Enable notifications">🔔<span class="notif-dot" id="notif-dot"></span></button>
        <button class="theme-btn" id="theme-btn" onclick="cycleTheme()" title="Toggle theme">🌙</button>
        <span class="pill-run"  id="pill-run"  style="display:none"><span class="dot dot-run"></span> Online</span>
        <span class="pill-stop" id="pill-stop" style="display:none"><span class="dot dot-stop"></span> Offline</span>
      </div>
    </div>

    <!-- DASHBOARD -->
    <div class="page active" id="page-dashboard">

      <div class="prompt-card">
        <h2>Welcome to Mission Control</h2>
        <p>Describe what you want to build — the squad decomposes it into tasks and starts working in parallel.</p>
        <div class="prompt-row">
          <textarea class="prompt-ta" id="prompt-ta" rows="1"
            placeholder="Build a user authentication system with JWT, refresh tokens, and a React login page…"
            autocomplete="off"></textarea>
          <button class="btn-send" id="btn-send">Send →</button>
        </div>
        <div class="prompt-msg" id="prompt-msg"></div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">≡</div>
          <div class="stat-num c-teal"   id="s-total">—</div>
          <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✓</div>
          <div class="stat-num c-green"  id="s-done">—</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⚡</div>
          <div class="stat-num c-blue"   id="s-active">—</div>
          <div class="stat-label">Active Agents</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">◉</div>
          <div class="stat-num c-orange" id="s-waiting">—</div>
          <div class="stat-label">Waiting Review</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✕</div>
          <div class="stat-num c-red"    id="s-failed">—</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>

      <div class="two-col">
        <div class="sc">
          <div class="sc-head">
            <h3>Recent Tasks</h3>
            <button class="sc-link" onclick="go('tasks')">View All →</button>
          </div>
          <div id="recent-tasks"><div class="empty">No tasks yet</div></div>
        </div>

        <div class="sc">
          <div class="sc-head"><h3>Active Agents</h3></div>
          <div id="agent-list">
            ${agentRow("🧠", "#1a2d2a", "#0d9488",  "Project Orchestrator", "Decomposes requests into tasks",  "Project Orchestrator")}
            ${agentRow("🎯", "#1a2236", "#3b82f6",  "Dispatcher",           "Triage &amp; routing",            "Dispatcher")}
            ${agentRow("🎨", "#1e2d2d", "#14b8a6",  "Front Expert",         "Next.js · TailwindCSS · WCAG",    "Synx Front Expert")}
            ${agentRow("📱", "#1c1a36", "#7c3aed",  "Mobile Expert",        "Expo · React Native · EAS",       "Synx Mobile Expert")}
            ${agentRow("⚙️", "#1a2d1a", "#15803d",  "Back Expert",          "NestJS · Prisma · TypeScript",    "Synx Back Expert")}
            ${agentRow("🔍", "#2d1a1a", "#b91c1c",  "QA Engineer",          "Playwright · Vitest",             "Synx QA Engineer")}
            ${agentRow("📈", "#1a1c2d", "#4338ca",  "SEO Specialist",       "Core Web Vitals · JSON-LD",       "Synx SEO Specialist")}
            ${agentRow("🛡️", "#2d1f1a", "#c2410c",  "Code Reviewer",        "SOLID · DRY · Security gates",    "Synx Code Reviewer")}
            ${agentRow("🐳", "#1a2d24", "#065f46",  "DevOps Expert",        "Docker · GitHub Actions · K8s",   "Synx DevOps Expert")}
          </div>
        </div>
      </div>
    </div>

    <!-- TASKS -->
    <div class="page" id="page-tasks">
      <div class="sc">
        <div class="search-row">
          <input class="sinput" type="search" id="task-search" placeholder="Search tasks…" oninput="renderTasks()">
          <select class="sselect" id="task-filter" onchange="renderTasks()">
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_agent">Waiting Agent</option>
            <option value="waiting_human">Waiting Review</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Task</th><th>Type</th><th>Status</th><th>Stage</th><th>Created</th>
            </tr>
          </thead>
          <tbody id="tasks-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- REVIEW -->
    <div class="page" id="page-review">
      <div id="review-list"><div class="empty">No tasks waiting for review</div></div>
    </div>

    <!-- STREAM -->
    <div class="page" id="page-stream">
      <div class="stream-card">
        <div class="stream-toolbar">
          Live Event Stream
          <span class="stream-count" id="stream-count">0 events</span>
          <button class="btn" onclick="clearStream()">Clear</button>
        </div>
        <div class="stream-log" id="stream-log">
          <div class="stream-empty">Waiting for events…</div>
        </div>
      </div>
    </div>

    <!-- METRICS -->
    <div class="page" id="page-metrics">
      <div class="metrics-period">
        <button class="period-btn active" data-period="24"  onclick="setPeriod(24)">24h</button>
        <button class="period-btn"        data-period="168" onclick="setPeriod(168)">7d</button>
        <button class="period-btn"        data-period="720" onclick="setPeriod(720)">30d</button>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon">🔤</div><div class="stat-num c-blue"   id="m-tokens">—</div><div class="stat-label">Total Tokens</div></div>
        <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-num c-teal"   id="m-cost">—</div><div class="stat-label">Est. Cost (USD)</div></div>
        <div class="stat-card"><div class="stat-icon">✓</div><div class="stat-num c-green"   id="m-tasks-done">—</div><div class="stat-label">Tasks Done</div></div>
        <div class="stat-card"><div class="stat-icon">🎯</div><div class="stat-num c-orange" id="m-rate">—</div><div class="stat-label">Approval Rate</div></div>
        <div class="stat-card"><div class="stat-icon">⏱</div><div class="stat-num c-muted"  id="m-avg">—</div><div class="stat-label">Avg Duration</div></div>
      </div>
      <div class="sparkline-card">
        <h4>Token Usage — last 30 days</h4>
        <svg class="sparkline-svg" id="sparkline" viewBox="0 0 800 64" preserveAspectRatio="none"></svg>
      </div>
      <div class="two-col">
        <div class="sc">
          <div class="sc-head"><h3>Top Agents by Cost</h3></div>
          <div id="m-agents-list"><div class="empty">Loading…</div></div>
        </div>
        <div class="sc">
          <div class="sc-head"><h3>Top Tasks by Cost</h3></div>
          <div id="m-tasks-list"><div class="empty">Loading…</div></div>
        </div>
      </div>
    </div>

    <!-- SETTINGS -->
    <div class="page" id="page-settings">
      <div class="settings-section">
        <div class="settings-section-head">⚙️ Providers &amp; Models</div>
        <div class="settings-section-body">
          <p style="font-size:13px;color:var(--muted);margin-bottom:14px">Active LLM configuration per agent. Edit <code style="font-family:var(--mono);background:var(--bg3);padding:1px 5px;border-radius:4px">.ai-agents/config/global.json</code> to add fallback chains.</p>
          <div id="cfg-providers-table"><div class="empty">Loading…</div></div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-head">🚀 Runtime Controls</div>
        <div class="settings-section-body">
          <div class="runtime-row">
            <div class="runtime-row-label">
              <label>Auto-approve threshold</label>
              <div class="rt-sub">Tasks with dispatcher confidence ≥ threshold advance automatically past human review (0 = disabled, 1 = always auto-approve).</div>
            </div>
            <input class="rinput" type="number" id="cfg-threshold" min="0" max="1" step="0.05" value="0" placeholder="0–1">
            <button class="btn btn-approve" onclick="saveThreshold()">Save</button>
          </div>
          <div class="runtime-btns">
            <button class="btn" onclick="runtimeControl('pause')">⏸ Pause engine</button>
            <button class="btn" onclick="runtimeControl('resume')">▶ Resume engine</button>
            <button class="btn btn-cancel" onclick="runtimeControl('stop')">⏹ Stop engine</button>
          </div>
          <div class="settings-msg" id="settings-msg"></div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-head">📋 Project Info</div>
        <div class="settings-section-body" id="cfg-project-info"><div class="empty">Loading…</div></div>
      </div>
    </div>

  </main>
</div>

<!-- TASK DETAIL DRAWER -->
<div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
<div id="drawer">
  <div class="drawer-header">
    <div style="flex:1;min-width:0">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Task Detail</div>
      <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="drawer-title">…</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px" id="drawer-subtitle">…</div>
    </div>
    <button class="drawer-close" onclick="closeDrawer()">✕</button>
  </div>
  <div class="drawer-tabs">
    <button class="drawer-tab active" data-dtab="overview"  onclick="drawerTab('overview')">Overview</button>
    <button class="drawer-tab"        data-dtab="artifacts" onclick="drawerTab('artifacts')">Artifacts</button>
    <button class="drawer-tab"        data-dtab="history"   onclick="drawerTab('history')">History</button>
  </div>
  <div class="drawer-body">
    <div class="dtab-panel active" id="dtab-overview"><div class="empty">Loading…</div></div>
    <div class="dtab-panel"        id="dtab-artifacts"><div class="empty">Loading…</div></div>
    <div class="dtab-panel"        id="dtab-history"><div class="empty">Loading…</div></div>
  </div>
</div>

<!-- NEW TASK MODAL -->
<div class="modal-back" id="newtask-modal">
  <div class="modal-box" style="max-width:560px">
    <h3>＋ Nova Task</h3>
    <p>Create a targeted task dispatched directly to the most appropriate expert.</p>
    <label class="modal-label">Title *</label>
    <input class="modal-input" type="text" id="nt-title" placeholder="Add email verification to user registration">
    <div class="modal-row">
      <select class="modal-select" id="nt-type">
        <option value="Feature">Feature</option>
        <option value="Bug">Bug</option>
        <option value="Refactor">Refactor</option>
        <option value="Research">Research</option>
        <option value="Documentation">Documentation</option>
        <option value="Mixed">Mixed</option>
      </select>
      <select class="modal-select" id="nt-e2e">
        <option value="auto">E2E: Auto</option>
        <option value="required">E2E: Required</option>
        <option value="skip">E2E: Skip</option>
      </select>
    </div>
    <label class="modal-label">Description *</label>
    <textarea class="modal-ta" id="nt-desc" placeholder="Describe what needs to be done in detail…"></textarea>
    <label class="modal-label" style="margin-top:10px">Related files <span style="font-weight:400;color:var(--muted)">(one per line, optional)</span></label>
    <textarea class="modal-ta" id="nt-files" style="min-height:52px;font-family:var(--mono);font-size:12px" placeholder="src/auth/users.ts&#10;src/lib/email.ts"></textarea>
    <div class="modal-err" id="nt-err"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeNewTask()">Cancel</button>
      <button class="btn btn-approve" id="nt-submit" onclick="submitNewTask()">Create Task →</button>
    </div>
  </div>
</div>

<!-- REPROVE MODAL -->
<div class="modal-back" id="reprove-modal">
  <div class="modal-box">
    <h3>Send Back for Revision</h3>
    <p>Describe what needs to be fixed. The agent will receive this feedback and retry.</p>
    <label class="modal-label">Reason *</label>
    <textarea class="modal-ta" id="reprove-reason"
      placeholder="e.g. Missing error handling for network timeouts, the loading state never clears…"></textarea>
    <div class="modal-check">
      <input type="checkbox" id="reprove-rollback">
      <label for="reprove-rollback">Roll back file changes made by this task</label>
    </div>
    <div class="modal-err" id="reprove-err"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-reprove" id="reprove-submit" onclick="submitReprove()">Send Back</button>
    </div>
  </div>
</div>

<script>
(function () {
  /* ── theme ── */
  var THEMES = ['dark', 'light', 'system'];
  var ICONS  = { dark: '🌙', light: '☀️', system: '💻' };
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = ICONS[t] || '🌙';
    try { localStorage.setItem('synx-theme', t); } catch(_) {}
  }
  window.cycleTheme = function () {
    var cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next);
  };
  (function initTheme() {
    var saved = 'dark';
    try { saved = localStorage.getItem('synx-theme') || 'dark'; } catch(_) {}
    applyTheme(saved);
  })();

  /* ── state ── */
  var allTasks   = [];
  var streamN    = 0;
  var page       = 'dashboard';
  var reproveId  = null;
  var drawerTaskId   = null;
  var drawerDetail   = null;
  var drawerFiles    = null;
  var metricsPeriod  = 24;
  var notifGranted   = false;

  /* ── navigation ── */
  window.go = function (p) {
    document.querySelectorAll('.page').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.nav-btn').forEach(function (el) { el.classList.remove('active'); });
    var pageEl = document.getElementById('page-' + p);
    var navEl  = document.querySelector('[data-page="' + p + '"]');
    if (pageEl) pageEl.classList.add('active');
    if (navEl)  navEl.classList.add('active');
    var titles = { dashboard: 'Dashboard', tasks: 'Task Board', review: 'Review Queue', stream: 'Live Stream', metrics: 'Metrics', settings: 'Settings' };
    document.getElementById('topbar-title').textContent = titles[p] || p;
    page = p;
    if (p === 'tasks')    refreshTasks();
    if (p === 'review')   refreshReview();
    if (p === 'metrics')  refreshMetrics();
    if (p === 'settings') loadSettings();
  };

  /* ── helpers ── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function ago(iso) {
    if (!iso) return '—';
    var d = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 60)   return d + 's ago';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400)return Math.round(d / 3600) + 'h ago';
    return new Date(iso).toLocaleDateString();
  }
  function badge(s) {
    var map = {
      new:'New', in_progress:'In Progress', waiting_agent:'Waiting Agent',
      waiting_human:'Review', done:'Done', failed:'Failed', blocked:'Blocked', archived:'Archived'
    };
    var cls = { new:'bn', in_progress:'bip', waiting_agent:'bwa', waiting_human:'bwh', done:'bd', failed:'bf', blocked:'bb', archived:'bar' };
    return '<span class="badge ' + (cls[s]||'bn') + '">' + (map[s]||s) + '</span>';
  }
  function dotColor(s) {
    var c = { in_progress:'var(--blue)', waiting_agent:'var(--teal)', waiting_human:'var(--orange)', done:'var(--green)', failed:'var(--red)', blocked:'var(--yellow)' };
    return 'background:' + (c[s] || 'var(--muted)');
  }

  /* ── overview ── */
  function refreshOverview() {
    fetch('/api/overview').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      var counts  = d.data ? d.data.counts  : (d.counts  || {});
      var running = d.data ? d.data.engine.status === 'running' : (d.engine && d.engine.status === 'running');

      document.getElementById('s-total').textContent   = counts.total          || 0;
      document.getElementById('s-done').textContent    = counts.done           || 0;
      document.getElementById('s-active').textContent  = counts.active         || 0;
      document.getElementById('s-waiting').textContent = counts.waiting_human  || 0;
      document.getElementById('s-failed').textContent  = counts.failed         || 0;

      document.getElementById('engine-dot').className   = 'dot ' + (running ? 'dot-run' : 'dot-stop');
      document.getElementById('engine-label').textContent = running ? 'Engine running' : 'Engine stopped';
      document.getElementById('pill-run').style.display  = running ? '' : 'none';
      document.getElementById('pill-stop').style.display = running ? 'none' : '';

      var w  = counts.waiting_human || 0;
      var nb = document.getElementById('nb-review');
      nb.textContent = w; nb.className = 'nav-badge' + (w > 0 ? ' on' : '');

      var a  = counts.active || 0;
      var na = document.getElementById('nb-active');
      na.textContent = a; na.className = 'nav-badge' + (a > 0 ? ' on' : '');
    }).catch(function(){});
  }

  /* ── dashboard tasks ── */
  function refreshDashboard() {
    refreshOverview();
    fetch('/api/tasks').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      allTasks = d.data || d;
      updateAgentDots(allTasks);

      var recent = allTasks.slice(0, 8);
      var el = document.getElementById('recent-tasks');
      if (!recent.length) { el.innerHTML = '<div class="empty">No tasks yet</div>'; return; }
      el.innerHTML = recent.map(function (t) {
        return '<div class="task-row-d" onclick="go(\\'tasks\\')">' +
          '<span class="tdot" style="' + dotColor(t.status) + '"></span>' +
          '<div class="tinfo"><div class="ttitle">' + esc(t.title) + '</div>' +
          '<div class="tsub">' + esc(t.status) + (t.typeHint ? ' · ' + esc(t.typeHint) : '') + '</div></div>' +
          '<span class="ttime">' + ago(t.createdAt) + '</span></div>';
      }).join('');
    }).catch(function(){});
  }

  /* ── agent dots ── */
  function updateAgentDots(tasks) {
    document.querySelectorAll('.agent-dot').forEach(function (el) { el.className = 'agent-dot ad-idle'; });
    var active = tasks.filter(function (t) { return t.status === 'in_progress' || t.status === 'waiting_agent'; });
    var review = tasks.filter(function (t) { return t.status === 'waiting_human'; });
    if (active.length > 0) {
      ['Dispatcher', 'Synx Front Expert', 'Synx Back Expert', 'Synx Mobile Expert', 'Project Orchestrator']
        .slice(0, Math.min(active.length + 1, 5))
        .forEach(function (a) {
          var el = document.querySelector('.agent-dot[data-agent="' + a + '"]');
          if (el) el.className = 'agent-dot ad-work';
        });
    }
    if (review.length > 0) {
      var el = document.querySelector('.agent-dot[data-agent="Synx QA Engineer"]');
      if (el) el.className = 'agent-dot ad-review';
    }
  }

  /* ── tasks page ── */
  function refreshTasks() {
    fetch('/api/tasks').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      allTasks = d.data || d;
      renderTasks();
    }).catch(function(){});
  }

  window.renderTasks = function () {
    var q   = (document.getElementById('task-search').value || '').toLowerCase();
    var fil = document.getElementById('task-filter').value || '';
    var list = allTasks.filter(function (t) {
      return (!q || t.title.toLowerCase().includes(q) || t.taskId.toLowerCase().includes(q)) &&
             (!fil || t.status === fil);
    });
    var tbody = document.getElementById('tasks-body');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No tasks found</td></tr>'; return; }
    tbody.innerHTML = list.map(function (t) {
      var id = esc(t.taskId);
      var approveBtn = (t.status === 'waiting_human')
        ? '<button class="btn btn-approve" onclick="event.stopPropagation();approveTask(\\'' + id + '\\')">Approve</button>'
        + '<button class="btn btn-reprove" onclick="event.stopPropagation();openReprove(\\'' + id + '\\')">Send Back</button>' : '';
      var cancelBtn = (t.status !== 'done' && t.status !== 'failed' && t.status !== 'archived')
        ? '<button class="btn btn-cancel" onclick="event.stopPropagation();cancelTask(\\'' + id + '\\')">Cancel</button>' : '';
      var detailBtn = '<button class="btn" style="font-size:11px;padding:4px 8px" onclick="event.stopPropagation();openDrawer(\\'' + id + '\\')">Details</button>';
      return '<tr class="trow" onclick="toggleExpand(\\'' + id + '\\')">' +
        '<td><div style="font-weight:500">' + esc(t.title) + '</div>' +
        '<div style="font-size:11px;color:var(--muted);font-family:var(--mono)">' + id + '</div></td>' +
        '<td style="color:var(--muted)">' + esc(t.typeHint || '—') + '</td>' +
        '<td>' + badge(t.status) + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + esc(t.stage || '—') + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + ago(t.createdAt) + '</td>' +
        '</tr>' +
        '<tr class="expand-row" id="exp-' + id + '">' +
        '<td colspan="5" style="padding:0"><div class="expand-inner">' +
        '<div class="expand-raw">' + esc(t.rawRequest || '') + '</div>' +
        '<div class="expand-actions">' + approveBtn + cancelBtn + detailBtn + '</div>' +
        '<div class="expand-msg" id="exp-msg-' + id + '"></div>' +
        '</div></td></tr>';
    }).join('');
  };

  window.toggleExpand = function (id) {
    var row = document.getElementById('exp-' + id);
    if (row) row.classList.toggle('open');
  };

  /* ── review page ── */
  function refreshReview() {
    fetch('/api/tasks').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      var tasks = (d.data || d).filter(function (t) { return t.status === 'waiting_human'; });
      var el = document.getElementById('review-list');
      if (!tasks.length) { el.innerHTML = '<div class="empty">No tasks waiting for review</div>'; return; }
      el.innerHTML = tasks.map(function (t) {
        var id = esc(t.taskId);
        return '<div class="rv-card">' +
          '<div class="rv-head">' + badge(t.status) + '<h4>' + esc(t.title) + '</h4>' +
          '<span style="font-size:12px;color:var(--muted)">' + ago(t.createdAt) + '</span></div>' +
          '<div class="rv-body"><div class="rv-raw">' + esc(t.rawRequest || '') + '</div>' +
          '<div class="rv-actions">' +
          '<button class="btn btn-approve" onclick="approveTask(\\'' + id + '\\', true)">Approve</button>' +
          '<button class="btn btn-reprove" onclick="openReprove(\\'' + id + '\\')">Send Back</button>' +
          '</div><div class="rv-msg" id="rv-msg-' + id + '"></div></div></div>';
      }).join('');
    }).catch(function(){});
  }

  /* ── actions ── */
  window.approveTask = function (id, fromReview) {
    var msgEl = document.getElementById(fromReview ? 'rv-msg-' + id : 'exp-msg-' + id);
    fetch('/api/tasks/' + id + '/approve', { method: 'POST' }).then(function (r) { return r.json().then(function(b){return{r:r,b:b};}); }).then(function (res) {
      if (res.r.ok) {
        if (msgEl) { msgEl.className = 'expand-msg ok'; msgEl.textContent = '✓ Approved'; }
        setTimeout(function () { refreshDashboard(); if (page === 'tasks') refreshTasks(); if (page === 'review') refreshReview(); }, 700);
      } else {
        if (msgEl) { msgEl.className = 'expand-msg err'; msgEl.textContent = res.b.error || 'Error'; }
      }
    }).catch(function () { if (msgEl) { msgEl.className = 'expand-msg err'; msgEl.textContent = 'Network error'; } });
  };

  window.cancelTask = function (id) {
    var msgEl = document.getElementById('exp-msg-' + id);
    fetch('/api/tasks/' + id + '/cancel', { method: 'POST' }).then(function (r) { return r.json().then(function(b){return{r:r,b:b};}); }).then(function (res) {
      if (res.r.ok) {
        if (msgEl) { msgEl.className = 'expand-msg ok'; msgEl.textContent = '✓ Cancelled'; }
        setTimeout(function () { refreshDashboard(); if (page === 'tasks') refreshTasks(); }, 700);
      } else {
        if (msgEl) { msgEl.className = 'expand-msg err'; msgEl.textContent = res.b.error || 'Error'; }
      }
    }).catch(function () { if (msgEl) { msgEl.className = 'expand-msg err'; msgEl.textContent = 'Network error'; } });
  };

  /* ── reprove modal ── */
  window.openReprove = function (id) {
    reproveId = id;
    document.getElementById('reprove-reason').value = '';
    document.getElementById('reprove-rollback').checked = false;
    document.getElementById('reprove-err').style.display = 'none';
    document.getElementById('reprove-modal').classList.add('open');
    setTimeout(function () { document.getElementById('reprove-reason').focus(); }, 40);
  };
  window.closeModal = function () {
    reproveId = null;
    document.getElementById('reprove-modal').classList.remove('open');
  };
  window.submitReprove = function () {
    var reason = document.getElementById('reprove-reason').value.trim();
    var errEl  = document.getElementById('reprove-err');
    if (!reason) { errEl.textContent = 'Please enter a reason.'; errEl.style.display = 'block'; return; }
    var rollback = document.getElementById('reprove-rollback').checked;
    document.getElementById('reprove-submit').disabled = true;
    fetch('/api/tasks/' + reproveId + '/reprove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason, rollback: rollback ? 'task' : undefined })
    }).then(function (r) { return r.json().then(function(b){return{r:r,b:b};}); }).then(function (res) {
      if (res.r.ok) {
        closeModal();
        setTimeout(function () { refreshDashboard(); if (page === 'tasks') refreshTasks(); if (page === 'review') refreshReview(); }, 500);
      } else {
        errEl.textContent = res.b.error || 'Error'; errEl.style.display = 'block';
      }
    }).catch(function () { errEl.textContent = 'Network error'; errEl.style.display = 'block'; })
      .finally(function () { document.getElementById('reprove-submit').disabled = false; });
  };
  document.getElementById('reprove-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

  /* ── prompt ── */
  var ta  = document.getElementById('prompt-ta');
  var btn = document.getElementById('btn-send');
  var msg = document.getElementById('prompt-msg');
  ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendProject(); } });
  ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  btn.addEventListener('click', sendProject);

  function sendProject() {
    var prompt = ta.value.trim();
    if (!prompt) return;
    btn.disabled = true;
    msg.className = 'prompt-msg'; msg.textContent = 'Sending…';
    fetch('/api/project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    }).then(function (r) { return r.json().then(function(b){return{r:r,b:b};}); }).then(function (res) {
      if (res.r.ok) {
        ta.value = ''; ta.style.height = 'auto';
        msg.className = 'prompt-msg ok';
        msg.textContent = '✓ Queued — the orchestrator is breaking this into tasks and dispatching them now.';
        setTimeout(function () { msg.textContent = ''; refreshDashboard(); }, 5000);
      } else {
        msg.className = 'prompt-msg err'; msg.textContent = res.b.error || 'Failed to queue project.';
      }
    }).catch(function () {
      msg.className = 'prompt-msg err'; msg.textContent = 'Network error — is the engine running?';
    }).finally(function () { btn.disabled = false; });
  }

  /* ── stream ── */
  function connectStream() {
    try {
      var es = new EventSource('/api/stream');
      es.onmessage = function (e) {
        var d; try { d = JSON.parse(e.data); } catch (_) { d = { type: 'message', message: e.data }; }
        addEvent(d);
        // Browser notification on review-ready events
        if (notifGranted && d.payload && d.payload.status === 'waiting_human') {
          try {
            new Notification('SYNX — Review Ready', {
              body: d.payload.title || d.taskId || 'A task is waiting for your review',
              icon: '/favicon.ico',
            });
          } catch(_) {}
        }
      };
      es.onerror = function () { es.close(); setTimeout(connectStream, 3000); };
    } catch(_) {}
  }
  function addEvent(d) {
    var log = document.getElementById('stream-log');
    var emp = log.querySelector('.stream-empty');
    if (emp) log.innerHTML = '';
    streamN++;
    document.getElementById('stream-count').textContent = streamN + ' event' + (streamN !== 1 ? 's' : '');
    var ts = new Date().toTimeString().slice(0, 8);
    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="s-t">' + ts + '</span>' +
      '<span class="s-e">' + esc(d.type || 'event') + '</span>' +
      '<span class="s-m">' + esc(d.message || d.taskId || JSON.stringify(d)) + '</span>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    if (d.type && d.type.includes('task')) {
      clearTimeout(window._dr);
      window._dr = setTimeout(refreshDashboard, 600);
    }
  }
  window.clearStream = function () {
    document.getElementById('stream-log').innerHTML = '<div class="stream-empty">Waiting for events…</div>';
    streamN = 0; document.getElementById('stream-count').textContent = '0 events';
  };

  /* ── drawer ── */
  window.openDrawer = function (id) {
    drawerTaskId = id;
    document.getElementById('drawer-title').textContent = '…';
    document.getElementById('drawer-subtitle').textContent = '…';
    document.getElementById('dtab-overview').innerHTML  = '<div class="empty">Loading…</div>';
    document.getElementById('dtab-artifacts').innerHTML = '<div class="empty">Loading…</div>';
    document.getElementById('dtab-history').innerHTML   = '<div class="empty">Loading…</div>';
    drawerTab('overview');
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    Promise.all([
      fetch('/api/tasks/' + encodeURIComponent(id)).then(function (r) { return r.json(); }),
      fetch('/api/tasks/' + encodeURIComponent(id) + '/files').then(function (r) { return r.json(); }),
    ]).then(function (results) {
      drawerDetail = results[0].data;
      drawerFiles  = results[1].data;
      if (!drawerDetail) return;
      var d = drawerDetail;
      document.getElementById('drawer-title').textContent = d.title || id;
      document.getElementById('drawer-subtitle').textContent = (d.typeHint || '') + (d.status ? ' · ' + d.status : '');
      renderDrawerOverview(d);
      renderDrawerArtifacts(id, drawerFiles);
      renderDrawerHistory(d);
    }).catch(function (err) {
      document.getElementById('dtab-overview').innerHTML = '<div class="empty">Failed to load: ' + esc(String(err)) + '</div>';
    });
  };

  function renderDrawerOverview(d) {
    var id = esc(d.taskId || drawerTaskId);
    var actBtns = '';
    if (d.status === 'waiting_human') {
      actBtns = '<div style="display:flex;gap:8px;margin-bottom:16px">' +
        '<button class="btn btn-approve" onclick="approveTask(\\'' + id + '\\');closeDrawer()">Approve</button>' +
        '<button class="btn btn-reprove" onclick="openReprove(\\'' + id + '\\')">Send Back</button>' +
        '</div>';
    } else if (d.status !== 'done' && d.status !== 'failed' && d.status !== 'archived') {
      actBtns = '<div style="display:flex;gap:8px;margin-bottom:16px">' +
        '<button class="btn btn-cancel" onclick="cancelTask(\\'' + id + '\\');closeDrawer()">Cancel Task</button>' +
        '</div>';
    }
    var fields = [
      ['Status',     badge(d.status)],
      ['Type',       esc(d.typeHint || '—')],
      ['Agent',      esc(d.nextAgent || d.currentAgent || '—')],
      ['Project',    esc(d.project || '—')],
      ['Created',    esc(ago(d.createdAt))],
    ];
    var infoHtml = fields.map(function (f) {
      return '<div class="project-info-row"><span class="project-info-key">' + f[0] + '</span><span class="drawer-field">' + f[1] + '</span></div>';
    }).join('');
    var rawHtml = d.rawRequest
      ? '<div class="drawer-section-title">Request</div>' +
        '<div class="drawer-field" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px 14px;line-height:1.6">' + esc(d.rawRequest) + '</div>'
      : '';
    var timelineHtml = '';
    if (d.history && d.history.length) {
      timelineHtml = '<div class="drawer-section-title" style="margin-top:16px">Timeline</div>' +
        d.history.map(function (h) {
          var dur = h.durationMs ? Math.round(h.durationMs / 1000) + 's' : '—';
          var model = h.model ? ' · ' + esc(h.model) : '';
          return '<div class="timeline-item">' +
            '<div class="tl-dot"></div>' +
            '<div class="tl-content">' +
            '<div class="tl-agent">' + esc(h.agent || h.stage || '—') + '</div>' +
            '<div class="tl-meta">' + esc(ago(h.startedAt)) + ' · ' + dur + model + '</div>' +
            '</div></div>';
        }).join('');
    }
    document.getElementById('dtab-overview').innerHTML = actBtns + infoHtml + rawHtml + timelineHtml;
  }

  function renderDrawerArtifacts(id, files) {
    if (!files) { document.getElementById('dtab-artifacts').innerHTML = '<div class="empty">No artifacts found</div>'; return; }
    var items = [];
    (files.done || []).forEach(function (f) { items.push({ scope: 'done', name: f, icon: '📄' }); });
    (files.views || []).forEach(function (f) { items.push({ scope: 'views', name: f, icon: f.endsWith('.md') ? '📝' : '📄' }); });
    (files.artifacts || []).forEach(function (f) { items.push({ scope: 'artifacts', name: f, icon: '🗂️' }); });
    if (!items.length) { document.getElementById('dtab-artifacts').innerHTML = '<div class="empty">No artifacts yet</div>'; return; }
    var html = items.map(function (item) {
      return '<div class="artifact-item" onclick="loadArtifact(\\'' + esc(id) + '\\',\\'' + esc(item.scope) + '\\',\\'' + esc(item.name) + '\\')">' +
        '<span class="artifact-icon">' + item.icon + '</span>' +
        '<span class="artifact-name">' + esc(item.name) + '</span>' +
        '<span class="artifact-scope">' + esc(item.scope) + '</span>' +
        '</div>' +
        '<div class="artifact-content" id="art-' + esc(item.scope) + '-' + esc(item.name.replace(/\./g, '-')) + '" style="display:none"></div>';
    }).join('');
    document.getElementById('dtab-artifacts').innerHTML = html;
  }

  window.loadArtifact = function (id, scope, name) {
    var safeId = esc(scope) + '-' + esc(name.replace(/\./g, '-'));
    var el = document.getElementById('art-' + safeId);
    if (!el) return;
    if (el.style.display !== 'none') { el.style.display = 'none'; return; }
    el.textContent = 'Loading…';
    el.style.display = 'block';
    fetch('/api/tasks/' + encodeURIComponent(id) + '/artifact?scope=' + encodeURIComponent(scope) + '&name=' + encodeURIComponent(name))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok && d.data) {
          var raw = d.data.content;
          try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch(_) {}
          el.textContent = raw;
        } else {
          el.textContent = d.error || 'Error loading artifact';
        }
      }).catch(function (err) { el.textContent = String(err); });
  };

  function renderDrawerHistory(d) {
    var reproves = (d.history || []).filter(function (h) { return h.reproveReason; });
    var learnings = d.learnings || [];
    var html = '';
    if (reproves.length) {
      html += '<div class="drawer-section-title">Reproves (' + reproves.length + ')</div>';
      html += reproves.map(function (h) {
        return '<div style="background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.2);border-radius:var(--r-sm);padding:10px 13px;margin-bottom:8px;">' +
          '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">' + esc(ago(h.startedAt)) + ' → ' + esc(h.agent || '—') + '</div>' +
          '<div style="font-size:13px">' + esc(h.reproveReason || '—') + '</div>' +
          '</div>';
      }).join('');
    }
    if (learnings.length) {
      html += '<div class="drawer-section-title" style="margin-top:14px">Learnings (' + learnings.length + ')</div>';
      html += learnings.map(function (l) {
        return '<div style="background:rgba(63,185,80,.07);border:1px solid rgba(63,185,80,.2);border-radius:var(--r-sm);padding:10px 13px;margin-bottom:8px;font-size:13px">' + esc(l) + '</div>';
      }).join('');
    }
    if (!html) html = '<div class="empty">No reproves or learnings recorded</div>';
    document.getElementById('dtab-history').innerHTML = html;
  }

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    drawerTaskId = null;
  };

  window.drawerTab = function (t) {
    document.querySelectorAll('.drawer-tab').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.dtab-panel').forEach(function (el) { el.classList.remove('active'); });
    var tabBtn = document.querySelector('[data-dtab="' + t + '"]');
    var tabPanel = document.getElementById('dtab-' + t);
    if (tabBtn)   tabBtn.classList.add('active');
    if (tabPanel) tabPanel.classList.add('active');
  };

  /* ── settings ── */
  function loadSettings() {
    fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.data) return;
      var g = d.data.global || {};
      var l = d.data.local  || {};

      // Auto-approve threshold
      var thresh = document.getElementById('cfg-threshold');
      if (thresh) thresh.value = typeof l.autoApproveThreshold === 'number' ? l.autoApproveThreshold : 0;

      // Providers table
      var provEl = document.getElementById('cfg-providers-table');
      if (provEl) {
        var rows = [];
        var defaultProv = (g.providers && g.providers.dispatcher) ? g.providers.dispatcher : {};
        rows.push({ agent: 'Dispatcher (default)', prov: defaultProv });
        if (g.providers && g.providers.planner) {
          rows.push({ agent: 'Planner', prov: g.providers.planner });
        }
        var agentProviders = g.agentProviders || {};
        Object.keys(agentProviders).forEach(function (k) {
          rows.push({ agent: k, prov: agentProviders[k] });
        });
        if (!rows.length) { provEl.innerHTML = '<div class="empty">No provider config found</div>'; return; }
        var tableHtml = '<table class="cfg-table"><thead><tr><th>Agent</th><th>Provider</th><th>Model</th><th>Fallbacks</th></tr></thead><tbody>';
        tableHtml += rows.map(function (row) {
          var p = row.prov || {};
          var typeClass = (p.type || '').toLowerCase().replace(/[-]/g, '');
          var fallbacks = (p.fallbackModels || []).map(function (f) {
            return '<span class="cfg-chip ' + (f.type || '').toLowerCase() + '">' + esc(f.model || f.type) + '</span>';
          }).join('');
          return '<tr><td>' + esc(row.agent) + '</td>' +
            '<td><span class="cfg-chip ' + typeClass + '">' + esc(p.type || '—') + '</span></td>' +
            '<td style="font-family:var(--mono);font-size:12px">' + esc(p.model || '—') + '</td>' +
            '<td>' + (fallbacks || '<span style="color:var(--muted);font-size:12px">—</span>') + '</td></tr>';
        }).join('');
        tableHtml += '</tbody></table>';
        provEl.innerHTML = tableHtml;
      }

      // Project info
      var projEl = document.getElementById('cfg-project-info');
      if (projEl) {
        var fields = [
          ['Project name', l.projectName || '—'],
          ['Language',     l.language    || '—'],
          ['Framework',    l.framework   || '—'],
          ['Human reviewer', l.humanReviewer || '—'],
          ['Tasks dir',    l.tasksDir    || '.ai-agents/tasks'],
        ];
        projEl.innerHTML = fields.map(function (f) {
          return '<div class="project-info-row"><span class="project-info-key">' + esc(f[0]) + '</span><span class="drawer-field">' + esc(f[1]) + '</span></div>';
        }).join('');
      }
    }).catch(function(){});
  }

  window.saveThreshold = function () {
    var msgEl = document.getElementById('settings-msg');
    var val = parseFloat(document.getElementById('cfg-threshold').value);
    if (isNaN(val) || val < 0 || val > 1) {
      msgEl.className = 'settings-msg err'; msgEl.textContent = 'Enter a value between 0 and 1.'; return;
    }
    msgEl.className = 'settings-msg'; msgEl.textContent = 'Saving…';
    fetch('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoApproveThreshold: val }),
    }).then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); }).then(function (res) {
      if (res.r.ok) {
        msgEl.className = 'settings-msg ok'; msgEl.textContent = '✓ Saved';
        setTimeout(function () { msgEl.textContent = ''; }, 3000);
      } else {
        msgEl.className = 'settings-msg err'; msgEl.textContent = res.b.error || 'Error saving';
      }
    }).catch(function () { msgEl.className = 'settings-msg err'; msgEl.textContent = 'Network error'; });
  };

  window.runtimeControl = function (cmd) {
    var msgEl = document.getElementById('settings-msg');
    msgEl.className = 'settings-msg'; msgEl.textContent = 'Sending ' + cmd + '…';
    fetch('/api/runtime/' + cmd, { method: 'POST' })
      .then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); })
      .then(function (res) {
        if (res.r.ok) {
          msgEl.className = 'settings-msg ok'; msgEl.textContent = '✓ Engine ' + cmd + ' requested';
          setTimeout(function () { msgEl.textContent = ''; refreshOverview(); }, 1500);
        } else {
          msgEl.className = 'settings-msg err'; msgEl.textContent = res.b.error || 'Error';
        }
      }).catch(function () { msgEl.className = 'settings-msg err'; msgEl.textContent = 'Network error'; });
  };

  /* ── metrics ── */
  window.setPeriod = function (h) {
    metricsPeriod = h;
    document.querySelectorAll('.period-btn').forEach(function (el) {
      el.classList.toggle('active', Number(el.getAttribute('data-period')) === h);
    });
    refreshMetrics();
  };

  function refreshMetrics() {
    Promise.all([
      fetch('/api/metrics/overview?hours=' + metricsPeriod).then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/metrics/agents?limit=8').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/metrics/tasks?limit=8').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/metrics/timeline?days=30').then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (results) {
      var ov      = results[0] && results[0].data ? results[0].data : {};
      var agents  = results[1] && results[1].data ? results[1].data : [];
      var tasks   = results[2] && results[2].data ? results[2].data : [];
      var timeline = results[3] && results[3].data ? results[3].data : [];

      var fmt = function (n) { return n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)); };
      document.getElementById('m-tokens').textContent    = fmt(ov.totalTokens);
      document.getElementById('m-cost').textContent      = ov.totalCostUsd != null ? '$' + ov.totalCostUsd.toFixed(4) : '—';
      document.getElementById('m-tasks-done').textContent = fmt(ov.tasksDone || ov.completedTasks);
      var rate = ov.approvalRate != null ? Math.round(ov.approvalRate * 100) + '%' : '—';
      document.getElementById('m-rate').textContent = rate;
      var avg = ov.avgDurationMs != null ? Math.round(ov.avgDurationMs / 1000) + 's' : '—';
      document.getElementById('m-avg').textContent = avg;

      // Sparkline
      renderSparkline(timeline);

      // Agent ranking
      var agentEl = document.getElementById('m-agents-list');
      if (agentEl) {
        if (!agents.length) { agentEl.innerHTML = '<div class="empty">No data</div>'; }
        else {
          var maxCost = Math.max.apply(null, agents.map(function (a) { return a.totalCostUsd || 0; })) || 1;
          var tbl = '<table class="ranking-table"><thead><tr><th>Agent</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>';
          tbl += agents.map(function (a) {
            var pct = Math.round(((a.totalCostUsd || 0) / maxCost) * 100);
            return '<tr><td>' + esc(a.agent || a.name || '—') + '<div class="rank-bar-wrap"><div class="rank-bar" style="width:' + pct + '%"></div></div></td>' +
              '<td style="white-space:nowrap;color:var(--muted)">' + fmt(a.totalTokens) + '</td>' +
              '<td style="white-space:nowrap;color:var(--teal)">$' + (a.totalCostUsd || 0).toFixed(4) + '</td></tr>';
          }).join('');
          agentEl.innerHTML = tbl + '</tbody></table>';
        }
      }

      // Task ranking
      var taskEl = document.getElementById('m-tasks-list');
      if (taskEl) {
        if (!tasks.length) { taskEl.innerHTML = '<div class="empty">No data</div>'; }
        else {
          var maxT = Math.max.apply(null, tasks.map(function (t) { return t.totalCostUsd || 0; })) || 1;
          var tt = '<table class="ranking-table"><thead><tr><th>Task</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>';
          tt += tasks.map(function (t) {
            var pct = Math.round(((t.totalCostUsd || 0) / maxT) * 100);
            var title = (t.title || t.taskId || '—').slice(0, 35);
            return '<tr><td>' + esc(title) + '<div class="rank-bar-wrap"><div class="rank-bar" style="width:' + pct + '%"></div></div></td>' +
              '<td style="white-space:nowrap;color:var(--muted)">' + fmt(t.totalTokens) + '</td>' +
              '<td style="white-space:nowrap;color:var(--teal)">$' + (t.totalCostUsd || 0).toFixed(4) + '</td></tr>';
          }).join('');
          taskEl.innerHTML = tt + '</tbody></table>';
        }
      }
    }).catch(function(){});
  }

  function renderSparkline(timeline) {
    var svg = document.getElementById('sparkline');
    if (!svg) return;
    if (!timeline || !timeline.length) { svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="var(--muted)" font-size="12">No data</text>'; return; }
    var vals = timeline.map(function (d) { return d.totalTokens || 0; });
    var max = Math.max.apply(null, vals) || 1;
    var W = 800, H = 64, pad = 4;
    var xs = vals.map(function (_, i) { return pad + (i / Math.max(vals.length - 1, 1)) * (W - 2 * pad); });
    var ys = vals.map(function (v) { return H - pad - (v / max) * (H - 2 * pad); });
    var pts = xs.map(function (x, i) { return x + ',' + ys[i]; }).join(' ');
    var fill = xs.map(function (x, i) { return x + ',' + ys[i]; }).join(' ') +
      ' ' + (W - pad) + ',' + (H - pad) + ' ' + pad + ',' + (H - pad);
    svg.innerHTML =
      '<polygon points="' + fill + '" fill="rgba(20,184,166,0.15)" />' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
      vals.map(function (_, i) {
        return '<circle cx="' + xs[i] + '" cy="' + ys[i] + '" r="3" fill="var(--teal)" />';
      }).join('');
  }

  /* ── new task modal ── */
  window.openNewTask = function () {
    document.getElementById('nt-title').value = '';
    document.getElementById('nt-desc').value  = '';
    document.getElementById('nt-files').value = '';
    document.getElementById('nt-type').value  = 'Feature';
    document.getElementById('nt-e2e').value   = 'auto';
    document.getElementById('nt-err').style.display = 'none';
    document.getElementById('newtask-modal').classList.add('open');
    setTimeout(function () { document.getElementById('nt-title').focus(); }, 40);
  };
  window.closeNewTask = function () {
    document.getElementById('newtask-modal').classList.remove('open');
  };
  window.submitNewTask = function () {
    var title   = document.getElementById('nt-title').value.trim();
    var desc    = document.getElementById('nt-desc').value.trim();
    var type    = document.getElementById('nt-type').value;
    var e2e     = document.getElementById('nt-e2e').value;
    var rawFiles = document.getElementById('nt-files').value.trim();
    var errEl   = document.getElementById('nt-err');
    if (!title) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; return; }
    if (!desc)  { errEl.textContent = 'Description is required.'; errEl.style.display = 'block'; return; }
    var relatedFiles = rawFiles ? rawFiles.split('\\n').map(function (f) { return f.trim(); }).filter(Boolean) : [];
    document.getElementById('nt-submit').disabled = true;
    errEl.style.display = 'none';
    fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, rawRequest: desc, typeHint: type, e2ePolicy: e2e, relatedFiles: relatedFiles }),
    }).then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); }).then(function (res) {
      if (res.r.ok) {
        closeNewTask();
        setTimeout(function () {
          refreshDashboard();
          if (page === 'tasks') refreshTasks();
        }, 400);
      } else {
        errEl.textContent = res.b.error || 'Failed to create task.';
        errEl.style.display = 'block';
      }
    }).catch(function () { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; })
      .finally(function () { document.getElementById('nt-submit').disabled = false; });
  };
  document.getElementById('newtask-modal').addEventListener('click', function (e) { if (e.target === this) closeNewTask(); });
  document.getElementById('nt-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('nt-desc').focus(); } });

  /* ── notifications ── */
  window.requestNotifPermission = function () {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function (p) {
      notifGranted = p === 'granted';
      var dot = document.getElementById('notif-dot');
      if (dot) dot.className = 'notif-dot' + (notifGranted ? ' on' : '');
    });
  };
  (function initNotifState() {
    if ('Notification' in window && Notification.permission === 'granted') {
      notifGranted = true;
      var dot = document.getElementById('notif-dot');
      if (dot) dot.className = 'notif-dot on';
    }
  })();

  /* ── inline command ── */
  window.runCmd = function () {
    var input = document.getElementById('cmd-input').value.trim();
    var outEl = document.getElementById('cmd-out');
    if (!input) return;
    outEl.textContent = 'Running…';
    fetch('/api/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: input, mode: 'command' }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok && d.data) {
        outEl.textContent = d.data.lines.map(function (l) { return l.message; }).join('\\n') || '✓ Done';
      } else {
        outEl.textContent = d.error || 'Error';
      }
    }).catch(function (err) { outEl.textContent = String(err); });
  };
  document.getElementById('cmd-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); runCmd(); }
  });

  /* ── init ── */
  refreshDashboard();
  setInterval(refreshDashboard, 5000);
  connectStream();
})();
</script>
</body>
</html>`;
}

function agentRow(icon: string, bgFrom: string, bgTo: string, name: string, role: string, agentKey: string): string {
  return `<div class="agent-row">
    <div class="agent-av" style="background:linear-gradient(135deg,${bgFrom},${bgTo})">${icon}</div>
    <div class="agent-info">
      <div class="agent-name">${name}</div>
      <div class="agent-role">${role}</div>
    </div>
    <span class="agent-dot ad-idle" data-agent="${agentKey}"></span>
  </div>`;
}
