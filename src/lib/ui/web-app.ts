import { buildSynxThemeCssVariables } from "./theme.js";
import { buildThemeBootstrapScript, SYNX_THEME_STORAGE_KEY } from "./theme-provider.js";
import { buildHeader, buildMainLayout, buildSidebar } from "./layout.js";

export function buildWebUiHtml(): string {
  const themeCssVariables = buildSynxThemeCssVariables();
  const themeBootstrapScript = buildThemeBootstrapScript(SYNX_THEME_STORAGE_KEY);
  const appShellMarkup = buildMainLayout({
    sidebar: buildSidebar(),
    header: buildHeader(),
    content: `
        <section class="card">
          <div class="snapshot-grid">
            <div class="snapshot-item"><div class="muted text-label">Engine</div><strong id="snapshot-engine" class="text-value">-</strong></div>
            <div class="snapshot-item"><div class="muted text-label">Active Tasks</div><strong id="snapshot-active" class="text-value">0</strong></div>
            <div class="snapshot-item"><div class="muted text-label">Waiting Human</div><strong id="snapshot-waiting" class="text-value">0</strong></div>
            <div class="snapshot-item"><div class="muted text-label">Estimated Cost</div><strong id="snapshot-cost" class="text-value">0</strong></div>
            <div class="snapshot-item"><div class="muted text-label">Updated</div><strong id="snapshot-updated" class="text-value">-</strong></div>
          </div>
        </section>

        <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>

        <section class="card command-console">
          <div class="command-head">
            <div><strong>Command Center</strong><div class="muted">Hacker-premium runtime console with snippets, slash commands and realtime feedback.</div></div>
            <div class="command-head-actions">
              <button type="button" class="btn" data-toggle-command-ref>Catalog</button>
              <button type="button" class="btn" data-open-command-palette>Cmd/Ctrl + K</button>
            </div>
          </div>
          <div class="command-shell">
            <form id="web-command-form" class="command-form">
              <input id="web-command-input" class="field-input command-input" autocomplete="off" spellcheck="false" placeholder='/status --all | /deploy | /rollback | approve --task-id task-123' />
              <select id="web-command-mode" class="field-select">
                <option value="command">Command mode</option>
                <option value="human">Human input mode</option>
              </select>
              <button type="submit" class="btn approve">Run</button>
            </form>
            <div id="command-suggest" class="command-suggest" hidden></div>
            <div class="command-log-tools">
              <div class="command-filter" role="group" aria-label="Command log filter">
                <button type="button" class="btn active" data-command-filter="all">All</button>
                <button type="button" class="btn" data-command-filter="info">Info</button>
                <button type="button" class="btn" data-command-filter="success">Success</button>
                <button type="button" class="btn" data-command-filter="error">Error</button>
              </div>
            </div>
            <div class="command-quick">
              <button type="button" class="btn" data-web-command="/status --all">/status</button>
              <button type="button" class="btn" data-web-command="/deploy" data-web-fill="true">/deploy</button>
              <button type="button" class="btn reprove" data-web-command="/rollback" data-web-fill="true">/rollback</button>
              <button type="button" class="btn" data-web-command="/pause-all">/pause-all</button>
              <button type="button" class="btn approve" data-web-command="/resume-runtime">/resume-runtime</button>
              <button type="button" class="btn cancel" data-web-command="/stop-runtime">/stop-runtime</button>
            </div>
            <section id="command-reference" class="command-ref" hidden>
              <input id="command-ref-filter" class="field-input" placeholder="Filter command by category, trigger or usage..." />
              <div id="command-ref-list" class="command-ref-list"></div>
            </section>
            <div id="web-command-log" class="command-log" role="log" aria-live="polite"></div>
          </div>
        </section>

        <section class="card">
          <div id="content" role="region" aria-live="polite" aria-busy="false"></div>
        </section>

        <section id="command-palette" class="command-palette" hidden aria-hidden="true">
          <div class="command-palette-backdrop" data-close-command-palette></div>
          <div class="command-palette-panel" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
            <div class="command-palette-head">
              <strong id="command-palette-title">Global Search</strong>
              <button type="button" class="btn" data-close-command-palette>Close</button>
            </div>
            <input id="command-palette-filter" class="field-input" autocomplete="off" spellcheck="false" placeholder="Search tasks, agents, events or actions..." />
            <div id="command-palette-list" class="command-palette-list"></div>
          </div>
        </section>

        <section id="command-confirm" class="command-confirm" hidden aria-hidden="true">
          <div class="command-confirm-backdrop" data-close-command-confirm></div>
          <div class="command-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="command-confirm-title">
            <h3 id="command-confirm-title">Confirm Critical Command</h3>
            <p id="command-confirm-body" class="muted">This action can impact the runtime. Continue?</p>
            <div class="actions">
              <button type="button" class="btn" data-close-command-confirm>Cancel</button>
              <button type="button" class="btn cancel" data-confirm-command>Confirm</button>
            </div>
          </div>
        </section>

        <section id="task-context-drawer" class="task-drawer" hidden aria-hidden="true">
          <button type="button" class="task-drawer-backdrop" data-close-task-drawer aria-label="Close task context drawer"></button>
          <aside class="task-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title">
            <div class="task-drawer-head">
              <div>
                <div id="task-drawer-path" class="muted">Task Context</div>
                <h3 id="task-drawer-title">Task Detail</h3>
              </div>
              <button type="button" class="btn" data-close-task-drawer>Close</button>
            </div>
            <div id="task-drawer-content" class="task-drawer-content">
              <div class="loading">Loading task context...</div>
            </div>
          </aside>
        </section>`,
  });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SYNX.js - Mission Control</title>
    <script>${themeBootstrapScript}</script>
    <style>
      ${themeCssVariables}
      * {
        box-sizing: border-box;
      }
      :focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 2px;
      }
      body {
        margin: 0;
        font-family: var(--font-sans);
        font-size: var(--type-body-size);
        font-weight: var(--type-body-weight);
        background:
          radial-gradient(circle at 14% 10%, var(--bg-glow-left) 0%, transparent 32%),
          radial-gradient(circle at 85% 15%, var(--bg-glow-right) 0%, transparent 34%),
          linear-gradient(180deg, var(--bg-elev) 0%, var(--bg) 100%);
        background-repeat: no-repeat;
        min-height: 100vh;
        height: 100vh;
        overflow: hidden;
        color: var(--fg);
        line-height: var(--type-body-line);
      }
      .skip-link {
        position: absolute;
        top: -40px;
        left: var(--space-3);
        background: var(--surface-strong);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        color: var(--fg);
        text-decoration: none;
        font-weight: 700;
      }
      .skip-link:focus {
        top: var(--space-3);
        z-index: 20;
      }
      main {
        width: 100%;
        height: 100vh;
        margin: 0;
        padding: var(--space-2);
      }
      .app-shell {
        height: calc(100vh - var(--space-4));
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: var(--space-3);
        align-items: stretch;
        position: relative;
      }
      .sidebar-backdrop {
        display: none;
      }
      .workspace {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .workspace-scroll {
        min-height: 0;
        overflow: auto;
        padding: var(--space-6);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--color-bg-base) 58%, transparent);
      }
      .side-rail {
        width: 100%;
        min-width: 240px;
        max-width: 280px;
        min-height: 0;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--panel);
        box-shadow: var(--shadow-soft, var(--shadow));
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
      }
      .rail-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .brand-block {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        letter-spacing: 0.08em;
        background: linear-gradient(135deg, color-mix(in srgb, var(--synx-cyan) 34%, var(--surface-soft)) 0%, color-mix(in srgb, var(--synx-magenta) 20%, var(--surface-soft)) 100%);
        color: #040a14;
      }
      .brand-copy {
        min-width: 0;
        display: grid;
      }
      .brand-copy strong {
        font-size: 0.88rem;
        letter-spacing: 0.03em;
      }
      .build-version {
        color: var(--muted);
        font-size: 0.73rem;
      }
      .sidebar-bottom {
        margin-top: auto;
        display: grid;
        gap: var(--space-1);
        padding-top: var(--space-3);
      }
      .utility-link {
        text-decoration: none;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--muted);
        font-weight: 600;
        padding: var(--space-2) var(--space-3);
      }
      .utility-link:hover {
        border-color: var(--border);
        background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
        color: var(--fg);
      }
      .utility-icon {
        width: 17px;
        height: 17px;
        display: inline-flex;
      }
      .utility-icon svg {
        width: 100%;
        height: 100%;
      }
      .rail-panel {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface-soft);
        padding: var(--space-3);
        margin-top: var(--space-2);
        display: grid;
        gap: var(--space-2);
      }
      .rail-panel > * {
        margin: 0;
      }
      .rail-headline {
        margin: var(--space-2) 0 2px;
        font-size: var(--type-label-size);
        line-height: var(--type-label-line);
        font-weight: var(--type-label-weight);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .rail-subline {
        margin: 0;
        color: var(--muted);
        font-size: var(--type-body-size);
      }
      .review-hotspot[hidden] {
        display: none;
      }
      .review-hotspot .actions {
        margin-top: var(--space-2);
      }
      .view-nav {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: var(--space-2);
        margin-top: var(--space-3);
        margin-bottom: 0;
      }
      .nav-divider {
        border-top: 1px solid var(--border);
        margin: var(--space-2) 0;
      }
      .view-nav .nav-link {
        position: relative;
        border: 1px solid transparent;
        border-left: 1px solid transparent;
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3) var(--space-2) 14px;
        background: color-mix(in srgb, var(--surface-strong) 74%, transparent);
        color: var(--fg);
        font-weight: 700;
        cursor: pointer;
        min-height: 44px;
        text-align: left;
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        align-items: center;
        gap: var(--space-2);
      }
      .view-nav .nav-link::before {
        content: "";
        position: absolute;
        left: 0;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: transparent;
        border-radius: 99px;
      }
      .view-nav .nav-link:hover {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface-soft) 82%, transparent);
      }
      .view-nav .nav-link .nav-icon {
        width: 16px;
        height: 16px;
        display: inline-flex;
        color: var(--muted);
      }
      .view-nav .nav-link .nav-icon svg {
        width: 16px;
        height: 16px;
      }
      .view-nav .nav-link .nav-copy {
        min-width: 0;
      }
      .view-nav .nav-link .nav-label {
        display: block;
        font-size: 0.83rem;
        letter-spacing: 0.02em;
      }
      .view-nav .nav-link .nav-sub {
        display: block;
        font-size: 0.74rem;
        color: var(--muted);
        font-weight: 500;
        margin-top: 2px;
      }
      .view-nav .nav-link.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 24%, var(--border));
        background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
      }
      .view-nav .nav-link.active::before {
        background: var(--color-accent-working);
      }
      .view-nav .nav-link.active .nav-icon,
      .view-nav .nav-link.active .nav-label {
        color: var(--fg);
      }
      .workspace-header {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--panel);
        box-shadow: var(--shadow-soft, var(--shadow));
        padding: var(--space-3);
        margin-bottom: var(--space-3);
        min-height: 64px;
      }
      .app-header {
        display: grid;
        grid-template-columns: minmax(0, 260px) minmax(260px, 1fr) auto;
        align-items: center;
        gap: var(--space-3);
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
      }
      .header-title {
        min-width: 0;
      }
      .header-breadcrumb {
        color: var(--muted);
        font-size: var(--type-label-size);
        line-height: var(--type-label-line);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .header-title h1 {
        margin: 2px 0 0;
        font-size: 1rem;
        font-weight: 700;
      }
      .global-search {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        padding: 0 var(--space-2);
        min-height: 42px;
      }
      .global-search .field-input {
        border: 0;
        background: transparent;
        padding: 0;
      }
      .global-search .field-input:focus-visible {
        outline: none;
      }
      .search-icon {
        width: 16px;
        height: 16px;
        color: var(--muted);
        display: inline-flex;
      }
      .search-icon svg {
        width: 100%;
        height: 100%;
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .connectivity-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: 0 var(--space-2);
        min-height: 34px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--border);
        background: var(--surface-soft);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
      }
      .connectivity-chip .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
      }
      .connectivity-chip.is-online {
        color: var(--color-accent-online);
      }
      .connectivity-chip.is-online .dot {
        background: var(--color-accent-online);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-online) 54%, transparent);
        animation: pulse-dot 1.7s infinite;
      }
      .connectivity-chip.is-offline {
        color: var(--color-accent-error);
      }
      .connectivity-chip.is-offline .dot {
        background: var(--color-accent-error);
      }
      @keyframes pulse-dot {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-online) 50%, transparent); }
        70% { box-shadow: 0 0 0 7px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }
      .runtime-chip {
        min-height: 34px;
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
        display: inline-flex;
        align-items: center;
        padding: 0 var(--space-2);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
        color: var(--muted);
      }
      .icon-btn {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
        color: var(--fg);
        border-radius: var(--radius-sm);
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
      }
      .icon-btn svg {
        width: 16px;
        height: 16px;
      }
      .notif-btn {
        width: 40px;
        height: 34px;
      }
      .notif-count {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--color-accent-error);
        color: #120609;
        font-size: 0.64rem;
        font-weight: 800;
      }
      .sidebar-toggle,
      .sidebar-close {
        display: none;
      }
      .title-wrap p {
        margin: 0;
      }
      .snapshot-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
        gap: var(--space-2);
      }
      .snapshot-item {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        background: var(--surface);
      }
      .snapshot-item strong {
        display: block;
        margin-top: 3px;
        font-size: var(--type-value-size);
        line-height: var(--type-value-line);
        font-weight: var(--type-value-weight);
      }
      .topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .brand-panel {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;
      }
      .synx-logo {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        background: var(--surface-soft);
        width: 100%;
        min-width: 0;
        max-width: 100%;
        display: grid;
        justify-items: center;
        text-align: center;
        overflow-x: auto;
      }
      .logo-ascii {
        margin: 0 auto;
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1;
        white-space: pre;
        display: inline-block;
        max-width: none;
        overflow-x: visible;
        letter-spacing: 0;
        font-variant-ligatures: none;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
        background: var(--title-gradient);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }
      .logo-tag {
        margin-top: var(--space-2);
        font-size: var(--type-label-size);
        line-height: var(--type-label-line);
        font-weight: var(--type-label-weight);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--synx-purple-soft);
        text-align: center;
      }
      .topbar-controls {
        display: grid;
        gap: var(--space-2);
        min-width: 250px;
        justify-items: end;
      }
      .theme-switch {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--surface-soft);
      }
      .theme-btn {
        border: 0;
        background: transparent;
        color: var(--muted);
        padding: var(--space-2) var(--space-3);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
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
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-pill);
        background: var(--accent-soft);
        color: var(--fg);
        font-size: var(--type-body-size);
        font-weight: var(--type-label-weight);
        border: 1px solid var(--border);
      }
      .legacy-nav {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }
      .legacy-nav button {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-2) var(--space-3);
        background: var(--surface-strong);
        color: var(--fg);
        font-weight: 600;
        font-size: var(--type-body-size);
        cursor: pointer;
        min-height: 44px;
      }
      .legacy-nav button.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 38%, var(--border));
        background: linear-gradient(90deg, color-mix(in srgb, var(--synx-cyan) 18%, var(--surface)) 0%, color-mix(in srgb, var(--synx-magenta) 16%, var(--surface)) 100%);
        color: var(--fg);
      }
      .card {
        background: var(--card);
        border-radius: var(--radius-md);
        padding: var(--space-4);
        box-shadow: var(--shadow-soft, var(--shadow));
        margin-bottom: var(--space-4);
        border: 1px solid var(--border);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .ops-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .ops-span-3 {
        grid-column: span 3;
      }
      .ops-span-4 {
        grid-column: span 4;
      }
      .ops-span-6 {
        grid-column: span 6;
      }
      .ops-span-8 {
        grid-column: span 8;
      }
      .ops-span-12 {
        grid-column: span 12;
      }
      .metric {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        background: var(--surface);
      }
      .metric strong {
        display: block;
        font-size: var(--type-value-size);
        line-height: var(--type-value-line);
        font-weight: var(--type-value-weight);
        margin-top: 2px;
      }
      .overview-root {
        display: grid;
        gap: var(--space-3);
      }
      .hero-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface) 78%, transparent);
        backdrop-filter: blur(8px);
        padding: var(--space-4);
        position: relative;
        overflow: hidden;
      }
      .hero-card::after {
        content: "";
        position: absolute;
        width: 320px;
        height: 320px;
        right: -190px;
        top: -130px;
        border-radius: 999px;
        background: radial-gradient(circle, color-mix(in srgb, var(--color-accent-working) 22%, transparent) 0%, transparent 68%);
        pointer-events: none;
      }
      .hero-content {
        display: grid;
        gap: var(--space-2);
        max-width: min(72ch, 72%);
      }
      .hero-title {
        margin: 0;
        font-size: clamp(1.18rem, 2.2vw, 1.62rem);
        letter-spacing: 0.01em;
        color: var(--color-text-primary);
      }
      .hero-context {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: 0.97rem;
      }
      .hero-meta {
        display: inline-flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-top: var(--space-1);
      }
      .hero-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        padding: 0 var(--space-2);
        background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
        color: var(--muted);
      }
      .hero-chip.strong {
        color: var(--fg);
      }
      .hero-art {
        position: absolute;
        right: var(--space-4);
        top: 50%;
        transform: translateY(-50%);
        width: 100px;
        height: 100px;
        opacity: 0.66;
        color: color-mix(in srgb, var(--color-accent-working) 58%, var(--color-accent-review));
        pointer-events: none;
      }
      .hero-art svg {
        width: 100%;
        height: 100%;
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .stat-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface) 76%, transparent);
        backdrop-filter: blur(8px);
        padding: var(--space-3);
        min-height: 144px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: var(--space-2);
      }
      .stat-card.waiting-hot {
        border-color: color-mix(in srgb, var(--color-accent-attention) 64%, var(--border));
        animation: waiting-pulse 2.4s ease-in-out infinite;
      }
      @keyframes waiting-pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-attention) 22%, transparent); }
        70% { box-shadow: 0 0 0 6px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }
      .stat-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .stat-label {
        color: var(--muted);
        font-size: var(--type-label-size);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: var(--type-label-weight);
      }
      .stat-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        color: color-mix(in srgb, var(--fg) 54%, var(--muted));
      }
      .stat-icon svg {
        width: 100%;
        height: 100%;
      }
      .stat-value {
        margin: 0;
        font-size: clamp(1.16rem, 1.8vw, 1.5rem);
        line-height: 1.16;
        font-weight: var(--type-value-weight);
      }
      .stat-value.online {
        color: var(--color-accent-online);
      }
      .stat-value.working {
        color: var(--color-accent-working);
      }
      .stat-value.review {
        color: var(--color-accent-review);
      }
      .stat-value.attention {
        color: var(--color-accent-attention);
      }
      .stat-value.error {
        color: var(--color-accent-error);
      }
      .stat-sub {
        margin-top: 3px;
        color: var(--muted);
        font-size: 0.8rem;
      }
      .stat-link {
        justify-self: start;
        border: 1px solid transparent;
        background: transparent;
        color: var(--muted);
        padding: 0;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      .stat-link:hover {
        color: var(--fg);
      }
      .recent-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface) 74%, transparent);
        backdrop-filter: blur(8px);
        padding: var(--space-3);
      }
      .recent-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
      }
      .recent-head h3 {
        margin: 0;
        font-size: 0.96rem;
      }
      .recent-list {
        display: grid;
        gap: var(--space-1);
      }
      .recent-item {
        width: 100%;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
        color: var(--fg);
        text-align: left;
        cursor: pointer;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
      }
      .recent-item:hover {
        border-color: var(--border);
      }
      .recent-copy {
        min-width: 0;
      }
      .recent-title {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .recent-sub {
        margin: 2px 0 0;
        color: var(--muted);
        font-size: 0.78rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .recent-time {
        color: var(--muted);
        font-size: 0.76rem;
        font-weight: 600;
      }
      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        display: inline-flex;
      }
      .status-dot.done {
        background: var(--color-accent-online);
      }
      .status-dot.waiting {
        background: var(--color-accent-attention);
      }
      .status-dot.failed {
        background: var(--color-accent-error);
      }
      .status-dot.active {
        background: var(--color-accent-working);
      }
      .status-dot.neutral {
        background: var(--muted);
      }
      .overview-skeleton {
        display: grid;
        gap: var(--space-3);
      }
      .skeleton-block {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface-soft) 86%, transparent);
        padding: var(--space-3);
      }
      .skeleton-line,
      .skeleton-pill {
        position: relative;
        overflow: hidden;
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--surface-strong) 86%, transparent);
      }
      .skeleton-line::after,
      .skeleton-pill::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--synx-cyan) 18%, transparent) 50%, transparent 100%);
        animation: shimmer 1.15s infinite;
      }
      @keyframes shimmer {
        100% { transform: translateX(100%); }
      }
      .skeleton-line.lg {
        height: 22px;
        width: min(48%, 340px);
      }
      .skeleton-line.md {
        margin-top: var(--space-2);
        height: 14px;
        width: min(64%, 420px);
      }
      .skeleton-pill {
        margin-top: var(--space-2);
        width: 132px;
        height: 28px;
      }
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .skeleton-stat {
        height: 144px;
      }
      .skeleton-recent {
        display: grid;
        gap: var(--space-2);
      }
      .skeleton-row {
        height: 50px;
      }
      .muted {
        color: var(--muted);
        font-size: var(--type-body-size);
        line-height: var(--type-body-line);
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: var(--type-body-size);
        line-height: var(--type-body-line);
      }
      .text-label {
        font-size: var(--type-label-size);
        line-height: var(--type-label-line);
        font-weight: var(--type-label-weight);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .text-value {
        font-size: var(--type-value-size);
        line-height: var(--type-value-line);
        font-weight: var(--type-value-weight);
      }
      .text-body {
        font-size: var(--type-body-size);
        line-height: var(--type-body-line);
        font-weight: var(--type-body-weight);
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .toolbar input {
        width: min(380px, 100%);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
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
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        font: inherit;
      }
      .field-select {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        background: var(--surface);
        color: var(--fg);
        font: inherit;
      }
      .panel-block {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        background: var(--surface-soft);
      }
      .section-title {
        margin: var(--space-5) 0 var(--space-2);
      }
      .review-alert {
        margin-top: 8px;
        color: var(--status-failed-fg);
        font-weight: 700;
      }
      .command-console {
        margin-bottom: var(--space-3);
      }
      .command-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-head-actions {
        display: inline-flex;
        gap: var(--space-2);
      }
      .command-shell {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background:
          radial-gradient(circle at 14% 8%, color-mix(in srgb, var(--synx-cyan) 16%, transparent) 0%, transparent 32%),
          radial-gradient(circle at 88% 18%, color-mix(in srgb, var(--synx-magenta) 18%, transparent) 0%, transparent 36%),
          #060b14;
        padding: var(--space-3);
        font-family: var(--font-mono);
        position: relative;
      }
      .command-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: var(--space-2);
      }
      .command-input {
        width: 100%;
        font-family: inherit;
        background: color-mix(in srgb, #04070f 86%, var(--surface-soft));
      }
      .command-suggest {
        margin-top: var(--space-2);
        border: 1px solid color-mix(in srgb, var(--synx-cyan) 24%, var(--border));
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #040710 88%, var(--surface-soft));
        overflow: hidden;
      }
      .command-suggest[hidden] {
        display: none;
      }
      .command-suggest-item {
        width: 100%;
        text-align: left;
        border: 0;
        border-bottom: 1px solid var(--border);
        background: transparent;
        color: var(--fg);
        cursor: pointer;
        padding: 8px 10px;
        display: grid;
        gap: 4px;
      }
      .command-suggest-item:last-child {
        border-bottom: 0;
      }
      .command-suggest-item:hover,
      .command-suggest-item.active {
        background: color-mix(in srgb, var(--synx-cyan) 16%, transparent);
      }
      .command-suggest-item .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-suggest-item .trigger {
        color: #8dd8ff;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .command-suggest-item .snippet {
        color: var(--muted);
        font-size: 0.74rem;
      }
      .command-log-tools {
        margin-top: var(--space-2);
        display: flex;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-filter {
        display: inline-flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .command-filter .btn {
        padding: 4px 8px;
      }
      .command-filter .btn.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 52%, var(--border));
        background: color-mix(in srgb, var(--synx-cyan) 16%, var(--surface-strong));
      }
      .command-quick {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
        margin-top: var(--space-2);
      }
      .command-log {
        margin-top: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #03060e 90%, var(--surface-soft));
        padding: var(--space-2);
        min-height: 104px;
        max-height: 320px;
        overflow: auto;
        font-family: var(--font-mono);
        font-size: 0.82rem;
      }
      .command-entry {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #050a12 88%, var(--surface));
        margin-bottom: var(--space-2);
        padding: 8px 10px;
        display: grid;
        gap: 8px;
      }
      .command-entry:last-child {
        margin-bottom: 0;
      }
      .command-entry.note.system {
        border-style: dashed;
      }
      .command-entry.status-success {
        border-color: color-mix(in srgb, var(--color-accent-online) 48%, var(--border));
      }
      .command-entry.status-error {
        border-color: color-mix(in srgb, var(--color-accent-error) 48%, var(--border));
      }
      .command-entry.status-pending {
        border-color: color-mix(in srgb, var(--color-accent-working) 48%, var(--border));
      }
      .command-entry-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-entry-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .command-entry-status {
        width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      .command-entry-status .spinner {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--color-accent-working) 32%, transparent);
        border-top-color: var(--color-accent-working);
        animation: spin 0.9s linear infinite;
      }
      .command-entry-status.success {
        color: var(--color-accent-online);
      }
      .command-entry-status.error {
        color: var(--color-accent-error);
      }
      .command-entry-prompt {
        font-size: 0.78rem;
        font-weight: 700;
        color: #9bd5ff;
      }
      .command-entry-prompt.human {
        color: #f3c188;
      }
      .command-entry-command {
        color: var(--fg);
        background: transparent;
        padding: 0;
        word-break: break-word;
      }
      .command-entry-time {
        color: var(--muted);
        font-size: 0.7rem;
        flex: 0 0 auto;
      }
      .command-entry-output {
        display: grid;
        gap: 6px;
      }
      .command-entry-line {
        margin: 0;
        white-space: pre-wrap;
      }
      .command-entry-line.info {
        color: var(--fg);
      }
      .command-entry-line.success {
        color: var(--color-accent-online);
      }
      .command-entry-line.critical {
        color: var(--status-failed-fg);
      }
      .command-output-json {
        margin: 0;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: color-mix(in srgb, #060a14 90%, var(--surface));
        padding: 8px;
        color: #9bd5ff;
      }
      .command-output-table-wrap {
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: auto;
      }
      .command-output-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75rem;
      }
      .command-output-table th,
      .command-output-table td {
        padding: 5px 6px;
      }
      .command-output-table td {
        color: var(--fg);
      }
      .command-ref {
        margin-top: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #050914 90%, var(--surface));
        padding: var(--space-3);
      }
      .command-ref[hidden] {
        display: none;
      }
      .command-ref-list {
        margin-top: var(--space-2);
        display: grid;
        gap: var(--space-2);
        max-height: 320px;
        overflow: auto;
      }
      .command-ref-item {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #060c18 88%, var(--surface-soft));
        padding: var(--space-2) var(--space-3);
      }
      .command-ref-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-ref-code {
        margin-top: 6px;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: var(--fg);
        background: color-mix(in srgb, #03060f 92%, var(--surface));
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 5px 7px;
      }
      .command-ref-item .muted {
        margin-top: 4px;
      }
      .command-palette {
        position: fixed;
        inset: 0;
        z-index: 70;
      }
      .command-palette[hidden] {
        display: none;
      }
      .command-palette-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(2, 5, 10, 0.76);
      }
      .command-palette-panel {
        position: relative;
        margin: min(8vh, 64px) auto 0;
        width: min(860px, calc(100vw - 32px));
        max-height: min(80vh, 760px);
        border: 1px solid color-mix(in srgb, var(--synx-cyan) 26%, var(--border));
        border-radius: var(--radius-md);
        background: color-mix(in srgb, #040913 93%, var(--surface-soft));
        padding: var(--space-3);
        display: grid;
        gap: var(--space-2);
        overflow: hidden;
      }
      .command-palette-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-palette-list {
        overflow: auto;
        display: grid;
        gap: var(--space-2);
        max-height: min(64vh, 620px);
      }
      .command-palette-group {
        display: grid;
        gap: 6px;
      }
      .command-palette-group-label {
        color: var(--muted);
        font-size: 0.74rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .command-palette-item {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #050a15 90%, var(--surface));
        padding: 8px 10px;
        display: grid;
        gap: 4px;
      }
      .command-palette-item.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 50%, var(--border));
        background: color-mix(in srgb, var(--synx-cyan) 16%, #060c18);
      }
      .command-palette-item .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .command-palette-item .trigger {
        color: #8dd8ff;
        font-weight: 700;
      }
      .command-palette-item .snippet {
        font-family: var(--font-mono);
        font-size: 0.74rem;
        color: var(--muted);
      }
      .command-confirm {
        position: fixed;
        inset: 0;
        z-index: 80;
      }
      .command-confirm[hidden] {
        display: none;
      }
      .command-confirm-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(2, 5, 10, 0.76);
      }
      .command-confirm-panel {
        position: relative;
        margin: min(18vh, 170px) auto 0;
        width: min(460px, calc(100vw - 32px));
        border: 1px solid color-mix(in srgb, var(--color-accent-error) 36%, var(--border));
        border-radius: var(--radius-md);
        background: color-mix(in srgb, #090812 94%, var(--surface));
        padding: var(--space-4);
        display: grid;
        gap: var(--space-3);
      }
      .command-confirm-panel h3 {
        margin: 0;
      }
      .hl {
        background: color-mix(in srgb, var(--color-accent-attention) 28%, transparent);
        color: var(--fg);
        padding: 0 1px;
        border-radius: 2px;
      }
      .task-drawer {
        position: fixed;
        inset: 0;
        z-index: 90;
      }
      .task-drawer[hidden] {
        display: none;
      }
      .task-drawer-backdrop {
        position: absolute;
        inset: 0;
        border: 0;
        margin: 0;
        padding: 0;
        background: rgba(3, 7, 14, 0.62);
      }
      .task-drawer-panel {
        position: absolute;
        top: var(--space-2);
        right: var(--space-2);
        bottom: var(--space-2);
        width: min(560px, calc(100vw - 16px));
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, #050a15 94%, var(--surface));
        padding: var(--space-3);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: var(--space-2);
      }
      .task-drawer-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .task-drawer-head h3 {
        margin: 0;
      }
      .task-drawer-content {
        overflow: auto;
        display: grid;
        gap: var(--space-2);
      }
      .task-drawer-grid {
        display: grid;
        gap: var(--space-2);
      }
      .task-drawer-meta {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
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
        border-radius: var(--radius-pill);
        padding: var(--space-1) var(--space-2);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
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
        margin-bottom: var(--space-2);
        color: var(--fg);
        font-size: var(--type-body-size);
      }
      .feedback.error {
        color: var(--danger);
      }
      .empty {
        border: 1px dashed var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-5);
        color: var(--muted);
      }
      .loading {
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
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
        gap: var(--space-3);
        margin: 6px 0 2px;
      }
      .chart-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
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
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .btn {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        background: var(--surface-strong);
        color: var(--fg);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
        cursor: pointer;
      }
      .btn.approve {
        border-color: color-mix(in srgb, var(--color-accent-online) 62%, var(--border));
        background: color-mix(in srgb, var(--color-accent-online) 18%, var(--surface));
        color: color-mix(in srgb, var(--color-accent-online) 80%, #06140f);
      }
      .btn.reprove {
        border-color: color-mix(in srgb, var(--color-accent-review) 58%, var(--border));
        background: color-mix(in srgb, var(--color-accent-review) 16%, var(--surface));
        color: color-mix(in srgb, var(--color-accent-review) 84%, #11061c);
      }
      .btn.cancel {
        border-color: color-mix(in srgb, var(--color-accent-error) 60%, var(--border));
        background: color-mix(in srgb, var(--color-accent-error) 16%, var(--surface));
        color: color-mix(in srgb, var(--color-accent-error) 82%, #17060a);
      }
      .review-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        margin-bottom: var(--space-2);
        background: var(--surface);
        transition: border-color 0.18s ease, transform 0.18s ease;
      }
      .review-card:last-child {
        margin-bottom: 0;
      }
      .review-card.waiting {
        border-color: color-mix(in srgb, var(--color-accent-attention) 52%, var(--border));
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-attention) 26%, transparent);
        animation: review-pulse 2.2s ease-in-out infinite;
      }
      @keyframes review-pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-attention) 26%, transparent); }
        70% { box-shadow: 0 0 0 6px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }
      .review-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: 6px;
      }
      .review-evidence {
        margin: 0 0 var(--space-2);
        color: var(--muted);
        font-size: 0.82rem;
      }
      .quick-reasons {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: var(--space-2);
      }
      .quick-reason {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
        color: var(--muted);
        border-radius: var(--radius-pill);
        padding: 4px 9px;
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
      }
      .quick-reason:hover {
        color: var(--fg);
      }
      .review-card-meta {
        display: flex;
        gap: var(--space-3);
        flex-wrap: wrap;
        color: var(--muted);
        font-size: var(--type-body-size);
        margin-bottom: var(--space-2);
      }
      .review-toolbar {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        margin-bottom: var(--space-3);
        background: var(--surface-soft);
      }
      .decision-station {
        display: grid;
        grid-template-columns: minmax(230px, 0.78fr) minmax(420px, 1.45fr) minmax(250px, 0.85fr);
        gap: var(--space-3);
        align-items: start;
      }
      .decision-pane {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface) 93%, transparent);
        padding: var(--space-3);
      }
      .decision-pane h3 {
        margin: 0 0 var(--space-2);
        font-size: 0.9rem;
      }
      .decision-pane h4 {
        margin: var(--space-3) 0 var(--space-2);
        font-size: 0.8rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .decision-list {
        display: grid;
        gap: 6px;
      }
      .decision-list .item {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 8px;
        background: color-mix(in srgb, var(--surface-soft) 86%, transparent);
      }
      .decision-list .item strong {
        font-size: 0.78rem;
      }
      .decision-list .item .meta {
        color: var(--muted);
        font-size: 0.74rem;
      }
      .review-panel {
        display: grid;
        gap: var(--space-2);
      }
      .review-compare {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
      }
      .artifact-pane {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--surface-soft) 92%, transparent);
        min-height: 240px;
        display: grid;
        grid-template-rows: auto 1fr;
      }
      .artifact-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
      }
      .artifact-head strong {
        font-size: 0.8rem;
      }
      .artifact-lang {
        color: var(--muted);
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .artifact-code {
        margin: 0;
        padding: 10px;
        white-space: pre-wrap;
        font-family: var(--font-mono);
        font-size: 0.78rem;
        line-height: 1.45;
        overflow: auto;
      }
      .code-line-key { color: #7ad8ff; }
      .code-line-string { color: #97f2ce; }
      .code-line-number { color: #ffc979; }
      .code-line-keyword { color: #bfa2ff; }
      .decision-actions {
        display: grid;
        gap: var(--space-2);
      }
      .decision-actions .btn {
        justify-content: center;
      }
      .decision-actions .btn[disabled] {
        opacity: 0.68;
        cursor: wait;
      }
      .decision-history {
        display: grid;
        gap: 6px;
      }
      .decision-history .row {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 8px;
        background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
      }
      .decision-history .title {
        font-size: 0.77rem;
        font-weight: 700;
      }
      .decision-history .reason {
        margin-top: 3px;
        font-size: 0.74rem;
        color: var(--muted);
      }
      .event-feed {
        display: grid;
        gap: var(--space-2);
      }
      #board-root {
        display: grid;
        gap: var(--space-2);
      }
      #board-root.mode-kanban .board-columns,
      #board-root.mode-agent .board-columns {
        animation: board-fade-in 0.18s ease;
      }
      @keyframes board-fade-in {
        from { opacity: 0.55; transform: translateY(2px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .board-columns {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(280px, 1fr);
        gap: var(--space-3);
        overflow-x: auto;
        padding-bottom: 8px;
        transition: opacity 0.2s ease;
      }
      .board-mode {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
      }
      .board-controls {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .board-view-toggle {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--surface-soft);
      }
      .board-toggle-btn {
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        min-height: 34px;
        padding: 0 var(--space-3);
        cursor: pointer;
      }
      .board-toggle-btn.active {
        background: color-mix(in srgb, var(--color-accent-working) 22%, var(--surface-strong));
        color: var(--fg);
      }
      .board-filter {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        min-height: 34px;
        padding: 0 var(--space-2);
        min-width: min(320px, 45vw);
      }
      .board-filter input {
        border: 0;
        background: transparent;
        padding: 0;
      }
      .board-filter input:focus-visible {
        outline: none;
      }
      .board-column {
        min-width: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
        padding: var(--space-2);
        display: grid;
        grid-template-rows: auto auto minmax(140px, 1fr);
        gap: var(--space-2);
        transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
      }
      .board-column-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        position: sticky;
        top: 0;
        z-index: 1;
        background: color-mix(in srgb, var(--surface-soft) 94%, transparent);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        border: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
      }
      .board-column h3 {
        margin: 0;
        font-size: 0.91rem;
      }
      .board-column .meta {
        margin: 0;
        padding: 0 var(--space-1);
        font-size: 0.76rem;
      }
      .board-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--border);
        color: var(--fg);
        font-size: 0.72rem;
        font-weight: var(--type-label-weight);
        background: var(--surface);
      }
      .board-stack {
        display: grid;
        gap: var(--space-2);
        align-content: start;
      }
      .board-empty {
        border: 1px dashed var(--border);
        border-radius: var(--radius-sm);
        min-height: 96px;
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 0.8rem;
        background: color-mix(in srgb, var(--surface) 74%, transparent);
      }
      .board-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--surface) 90%, transparent);
        padding: var(--space-3);
        transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        display: grid;
        gap: var(--space-2);
        cursor: pointer;
        animation: board-card-enter 0.22s ease both;
      }
      @keyframes board-card-enter {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .board-card:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--synx-cyan) 24%, var(--border));
      }
      .board-card .head {
        display: flex;
        justify-content: space-between;
        gap: var(--space-2);
        align-items: center;
      }
      .board-card .id {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .board-ticket {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .priority-badge {
        border-radius: var(--radius-pill);
        padding: 2px 7px;
        border: 1px solid var(--border);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.04em;
      }
      .priority-badge.p0 {
        color: var(--color-accent-error);
        border-color: color-mix(in srgb, var(--color-accent-error) 56%, var(--border));
        background: color-mix(in srgb, var(--color-accent-error) 14%, var(--surface));
      }
      .priority-badge.p1 {
        color: var(--color-accent-attention);
        border-color: color-mix(in srgb, var(--color-accent-attention) 56%, var(--border));
        background: color-mix(in srgb, var(--color-accent-attention) 14%, var(--surface));
      }
      .priority-badge.p2 {
        color: var(--color-accent-working);
        border-color: color-mix(in srgb, var(--color-accent-working) 56%, var(--border));
        background: color-mix(in srgb, var(--color-accent-working) 12%, var(--surface));
      }
      .priority-badge.p3 {
        color: var(--muted);
      }
      .agent-mini {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface-soft) 84%, transparent);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        color: var(--fg);
      }
      .agent-mini.dispatcher { color: #8bc4ff; }
      .agent-mini.research { color: #84e7df; }
      .agent-mini.architect { color: #b6a0ff; }
      .agent-mini.coder { color: #67d0ff; }
      .agent-mini.qa { color: #96efc7; }
      .agent-mini.human { color: #ffc979; }
      .agent-mini.blocked { color: #ff96a5; }
      .board-card .title {
        margin: 0;
        font-size: 0.94rem;
        line-height: 1.32;
      }
      .board-card .summary {
        color: var(--muted);
        font-size: 0.82rem;
      }
      .board-card .chip-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .board-chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        padding: 2px 7px;
        font-size: 0.72rem;
        font-weight: var(--type-label-weight);
        color: var(--muted);
        background: var(--surface-soft);
      }
      .board-chip.strong {
        color: var(--fg);
      }
      .board-progress {
        display: grid;
        gap: 6px;
      }
      .board-progress-track {
        width: 100%;
        height: 5px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--surface-soft) 84%, transparent);
        overflow: hidden;
      }
      .board-progress-fill {
        height: 100%;
        border-radius: inherit;
        width: 0%;
        background: var(--color-accent-working);
        transition: width 0.25s ease;
      }
      .board-progress-fill.done { background: var(--color-accent-online); }
      .board-progress-fill.review { background: var(--color-accent-attention); }
      .board-progress-fill.blocked { background: var(--color-accent-error); }
      .board-progress-meta {
        color: var(--muted);
        font-size: 0.72rem;
      }
      .board-card .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .board-card .next-owner {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.76rem;
        color: var(--fg);
      }
      .board-card .updated {
        font-size: 0.78rem;
        color: var(--muted);
      }
      .agent-avatar {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        border: 1px solid var(--border);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.03em;
        color: var(--fg);
        background: color-mix(in srgb, var(--surface-strong) 88%, transparent);
      }
      .agent-avatar.human {
        border-color: color-mix(in srgb, var(--color-accent-attention) 48%, var(--border));
        color: var(--color-accent-attention);
      }
      .board-card.waiting_human {
        border-color: color-mix(in srgb, var(--status-waiting-fg) 36%, var(--border));
        background: color-mix(in srgb, var(--status-waiting-bg) 30%, var(--surface));
      }
      .board-card.human-focus {
        border-color: color-mix(in srgb, var(--color-accent-attention) 62%, var(--border));
      }
      .board-card.done {
        border-color: color-mix(in srgb, var(--status-done-fg) 32%, var(--border));
      }
      .board-card.failed,
      .board-card.blocked,
      .board-card.archived {
        border-color: color-mix(in srgb, var(--status-failed-fg) 34%, var(--border));
      }
      .board-column.kanban-backlog {
        border-top: 3px solid color-mix(in srgb, var(--status-neutral-fg) 34%, var(--border));
      }
      .board-column.kanban-todo {
        border-top: 3px solid color-mix(in srgb, var(--status-progress-fg) 32%, var(--border));
      }
      .board-column.kanban-progress {
        border-top: 3px solid color-mix(in srgb, var(--accent) 46%, var(--border));
      }
      .board-column.kanban-review {
        border-top: 3px solid color-mix(in srgb, var(--status-waiting-fg) 40%, var(--border));
      }
      .board-column.kanban-done {
        border-top: 3px solid color-mix(in srgb, var(--status-done-fg) 40%, var(--border));
      }
      .board-column.kanban-blocked {
        border-top: 3px solid color-mix(in srgb, var(--status-failed-fg) 40%, var(--border));
      }
      .board-column.agent-human {
        border-color: color-mix(in srgb, var(--color-accent-attention) 52%, var(--border));
        background: color-mix(in srgb, var(--status-waiting-bg) 26%, var(--surface-soft));
      }
      .live-stream {
        display: grid;
        gap: var(--space-3);
      }
      .live-filters {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .live-filters .btn.active {
        border-color: color-mix(in srgb, var(--synx-cyan) 48%, var(--border));
        background: color-mix(in srgb, var(--synx-cyan) 18%, var(--surface));
      }
      .event-feed {
        max-height: min(72vh, 760px);
        overflow: auto;
        display: grid;
        gap: var(--space-2);
        padding-right: 2px;
      }
      .event-feed.virtual {
        position: relative;
      }
      .event-spacer {
        width: 100%;
      }
      .event-pins {
        display: grid;
        gap: var(--space-2);
      }
      .event-pins-label {
        color: var(--color-accent-attention);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }
      .event-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        background: color-mix(in srgb, var(--surface) 92%, transparent);
        display: grid;
        gap: 8px;
      }
      .event-card[data-open-task-drawer] {
        cursor: pointer;
      }
      .event-card.fresh {
        animation: event-card-enter 0.28s ease both;
      }
      @keyframes event-card-enter {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .event-card.pinned {
        border-color: color-mix(in srgb, var(--color-accent-attention) 52%, var(--border));
        background: color-mix(in srgb, var(--status-waiting-bg) 30%, var(--surface));
      }
      .event-card.alert {
        border-color: color-mix(in srgb, var(--color-accent-error) 54%, var(--border));
        background: color-mix(in srgb, var(--status-failed-bg) 28%, var(--surface));
      }
      .event-card.alert .event-icon {
        color: var(--status-failed-fg);
      }
      .event-card.pinned .event-icon {
        color: var(--status-waiting-fg);
      }
      .event-card .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .event-card .title-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .event-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        color: var(--fg);
      }
      .event-icon svg {
        width: 100%;
        height: 100%;
      }
      .event-card .title {
        font-weight: 700;
        color: var(--fg);
      }
      .event-card .time {
        color: var(--muted);
        font-size: 0.8rem;
        white-space: nowrap;
      }
      .event-card .summary {
        color: var(--fg);
        font-size: 0.91rem;
      }
      .event-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .event-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        padding: 2px 8px;
        color: var(--muted);
        font-size: 0.72rem;
      }
      .event-tag strong {
        color: var(--fg);
      }
      .event-alert-actions {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .event-raw {
        margin: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, #060911 92%, var(--surface));
        padding: 8px;
        font-family: var(--font-mono);
        font-size: 0.77rem;
        color: var(--muted);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: var(--radius-pill);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
        padding: 3px 8px;
      }
      .pill.runtime { background: var(--pill-runtime-bg); color: var(--pill-runtime-fg); }
      .pill.task { background: var(--pill-task-bg); color: var(--pill-task-fg); }
      .pill.review { background: var(--pill-review-bg); color: var(--pill-review-fg); }
      .pill.metrics { background: var(--pill-metrics-bg); color: var(--pill-metrics-fg); }
      .pill.alert { background: var(--status-failed-bg); color: var(--status-failed-fg); }
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
        border-radius: var(--radius-md);
        padding: var(--space-3);
      }
      code {
        background: var(--surface-soft);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
      }
      @media (max-width: 1120px) {
        main {
          padding: var(--space-2);
        }
        .app-shell {
          grid-template-columns: 1fr;
          gap: var(--space-2);
        }
        .side-rail {
          position: fixed;
          left: var(--space-2);
          top: var(--space-2);
          bottom: var(--space-2);
          width: min(82vw, 280px);
          max-width: 280px;
          transform: translateX(calc(-100% - var(--space-3)));
          transition: transform 0.2s ease;
          z-index: 30;
        }
        .app-shell.menu-open .side-rail {
          transform: translateX(0);
        }
        .sidebar-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          border: 0;
          padding: 0;
          margin: 0;
          background: rgba(5, 10, 18, 0.62);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          z-index: 20;
        }
        .app-shell.menu-open .sidebar-backdrop {
          opacity: 1;
          pointer-events: auto;
        }
        .sidebar-toggle,
        .sidebar-close {
          display: inline-flex;
        }
        .workspace-scroll {
          padding: var(--space-5);
        }
      }
      @media (max-width: 940px) {
        .app-header {
          grid-template-columns: 1fr;
          gap: var(--space-2);
        }
        .header-right {
          justify-content: flex-start;
          flex-wrap: wrap;
        }
        .global-search {
          width: 100%;
        }
        .hero-content {
          max-width: 100%;
        }
        .hero-art {
          width: 78px;
          height: 78px;
          right: var(--space-3);
        }
        .kpi-grid,
        .skeleton-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .snapshot-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .ops-grid {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
        .ops-span-8,
        .ops-span-6,
        .ops-span-4,
        .ops-span-3 {
          grid-column: span 6;
        }
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .toolbar {
          flex-direction: column;
          align-items: stretch;
        }
        .command-head {
          flex-direction: column;
          align-items: stretch;
        }
        .command-head-actions {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .command-head-actions .btn {
          width: 100%;
        }
        .command-log-tools {
          flex-direction: column;
          align-items: stretch;
        }
        .board-mode {
          width: 100%;
          justify-content: space-between;
        }
        .board-controls {
          width: 100%;
          justify-content: flex-start;
        }
        .board-filter {
          min-width: 0;
          width: 100%;
        }
        .decision-station {
          grid-template-columns: 1fr;
        }
        .review-compare {
          grid-template-columns: 1fr;
        }
        .command-quick {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .command-quick .btn {
          width: 100%;
        }
        .command-form {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .workspace-scroll {
          padding: var(--space-4);
        }
        .workspace-header {
          padding: var(--space-3);
        }
        .hero-card {
          padding: var(--space-3);
        }
        .hero-art {
          display: none;
        }
        .kpi-grid,
        .skeleton-grid {
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        .ops-grid {
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        .ops-span-12,
        .ops-span-8,
        .ops-span-6,
        .ops-span-4,
        .ops-span-3 {
          grid-column: span 1;
        }
        .grid {
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        .theme-switch {
          width: 100%;
        }
        .theme-btn {
          flex: 1;
        }
        .command-quick {
          grid-template-columns: 1fr;
        }
        .command-log {
          max-height: 240px;
        }
        .command-palette-panel {
          margin-top: var(--space-3);
          width: calc(100vw - 16px);
        }
        .task-drawer-panel {
          top: var(--space-1);
          right: var(--space-1);
          bottom: var(--space-1);
          width: calc(100vw - 8px);
          border-radius: var(--radius-sm);
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${appShellMarkup}
    <script>
      const THEME_STORAGE_KEY = ${JSON.stringify(SYNX_THEME_STORAGE_KEY)};
      const rootEl = document.documentElement;
      const initialThemePreference = (() => {
        const attributeValue = rootEl.getAttribute("data-theme-preference");
        if (attributeValue === "light" || attributeValue === "dark" || attributeValue === "system") return attributeValue;
        return "system";
      })();
      const initialThemeResolved = rootEl.getAttribute("data-theme") === "dark" ? "dark" : "light";
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
        overviewRenderedKey: "",
        tasksRenderedKey: "",
        reviewRenderedKey: "",
        boardRenderedKey: "",
        detailRenderedKey: "",
        analyticsRenderedKey: "",
        analyticsPreset: "30d",
        analyticsCustomFrom: "",
        analyticsCustomTo: "",
        analyticsOperationalReport: null,
        liveRenderedCount: -1,
        liveRenderedConnected: null,
        liveRenderedKey: "",
        liveFilter: "all",
        liveAutoScroll: true,
        liveScrollTop: 0,
        liveViewportHeight: 0,
        liveExpandedLogKey: "",
        detailOriginView: "overview",
        detailOriginLabel: "Dashboard",
        drawerOpen: false,
        drawerTaskId: "",
        drawerContextLabel: "",
        drawerLoading: false,
        drawerDetail: null,
        omniTasksCache: [],
        omniTasksCacheAt: 0,
        omniLoading: false,
        omniResults: [],
        omniActiveIndex: 0,
        commandMode: "command",
        commandLog: [],
        commandRunCounter: 0,
        commandLogFilter: "all",
        commandRefOpen: false,
        commandRefQuery: "",
        commandSuggestionsOpen: false,
        commandSuggestionsIndex: 0,
        commandSuggestions: [],
        commandHistory: [],
        commandHistoryIndex: -1,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        commandConfirm: null,
        boardMode: "kanban",
        boardFilter: "",
        pendingActionKey: "",
        themePreference: initialThemePreference,
        themeResolved: initialThemeResolved,
        renderedViews: {},
      };
      const contentEl = document.getElementById("content");
      const pollStatusEl = document.getElementById("poll-status");
      const feedbackEl = document.getElementById("feedback");
      const navButtons = Array.from(document.querySelectorAll(".view-nav button[data-view]"));
      const themeButtons = Array.from(document.querySelectorAll("[data-theme-option]"));
      const commandFormEl = document.getElementById("web-command-form");
      const commandInputEl = document.getElementById("web-command-input");
      const commandModeEl = document.getElementById("web-command-mode");
      const commandLogEl = document.getElementById("web-command-log");
      const commandSuggestEl = document.getElementById("command-suggest");
      const commandRefEl = document.getElementById("command-reference");
      const commandRefFilterEl = document.getElementById("command-ref-filter");
      const commandRefListEl = document.getElementById("command-ref-list");
      const commandPaletteEl = document.getElementById("command-palette");
      const commandPaletteFilterEl = document.getElementById("command-palette-filter");
      const commandPaletteListEl = document.getElementById("command-palette-list");
      const commandConfirmEl = document.getElementById("command-confirm");
      const commandConfirmBodyEl = document.getElementById("command-confirm-body");
      const taskDrawerEl = document.getElementById("task-context-drawer");
      const taskDrawerPathEl = document.getElementById("task-drawer-path");
      const taskDrawerTitleEl = document.getElementById("task-drawer-title");
      const taskDrawerContentEl = document.getElementById("task-drawer-content");
      const reviewHotspotEl = document.getElementById("review-hotspot");
      const reviewHotspotMetaEl = document.getElementById("review-hotspot-meta");
      const appShellEl = document.querySelector("[data-app-shell]");
      const headerViewKeyEl = document.getElementById("header-view-key");
      const headerScreenTitleEl = document.getElementById("header-screen-title");
      const connectivityIndicatorEl = document.getElementById("connectivity-indicator");
      const connectivityLabelEl = document.getElementById("connectivity-label");
      const headerNotifCountEl = document.getElementById("header-notif-count");
      const runtimeStatusPillEl = document.getElementById("runtime-status-pill");
      const globalSearchInputEl = document.getElementById("global-search-input");
      const locale = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().locale || (navigator && navigator.language) || undefined;
        } catch {
          return undefined;
        }
      })();
      const viewMeta = {
        overview: { breadcrumb: "Dashboard", title: "Mission Dashboard" },
        tasks: { breadcrumb: "Team / Agents", title: "Agent Team Board" },
        board: { breadcrumb: "Task Board", title: "Task Flow Board" },
        review: { breadcrumb: "Review Queue", title: "Human Review Queue" },
        detail: { breadcrumb: "Task Detail", title: "Task Drilldown" },
        live: { breadcrumb: "Live Stream", title: "Realtime Event Stream" },
        analytics: { breadcrumb: "Analytics", title: "Runtime Analytics" },
      };
      const UI_PREFS_STORAGE_KEY = "synx-ui-prefs-v1";

      function safeReadLocalStorage(key) {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      }

      function safeWriteLocalStorage(key, value) {
        try {
          localStorage.setItem(key, value);
        } catch {
          // ignore storage write errors
        }
      }

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
      const relativeTimeFormatter = typeof Intl.RelativeTimeFormat === "function"
        ? new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" })
        : null;
      const commandCatalog = [
        {
          category: "Runtime",
          mode: "command",
          trigger: "/status",
          name: "Runtime status",
          usage: "status --all",
          snippet: "status --all",
          description: "Show runtime health, queue and active tasks.",
        },
        {
          category: "Runtime",
          mode: "command",
          trigger: "/pause-all",
          name: "Pause runtime",
          usage: "/pause-all",
          snippet: "/pause-all",
          description: "Pause all automation workers.",
        },
        {
          category: "Runtime",
          mode: "command",
          trigger: "/resume-runtime",
          name: "Resume runtime",
          usage: "/resume-runtime",
          snippet: "/resume-runtime",
          description: "Resume processing after pause.",
        },
        {
          category: "Runtime",
          mode: "command",
          trigger: "/stop-runtime",
          name: "Stop runtime",
          usage: "/stop-runtime",
          snippet: "/stop-runtime",
          description: "Gracefully stop runtime loop (critical).",
          critical: true,
        },
        {
          category: "Tasks",
          mode: "command",
          trigger: "/deploy",
          name: "Create deploy task",
          usage: '/deploy',
          snippet: 'new "Deploy release" --type Feature',
          description: "Create a deployment-oriented task skeleton.",
        },
        {
          category: "Tasks",
          mode: "command",
          trigger: "/rollback",
          name: "Rollback template",
          usage: "/rollback",
          snippet: 'reprove --task-id task-123 --reason "Rollback requested"',
          description: "Prepare rollback/reprove command with required reason.",
        },
        {
          category: "Maintenance",
          mode: "command",
          trigger: "/clear-cache",
          name: "Clear cache",
          usage: "/clear-cache",
          snippet: "/clear-cache",
          description: "Reserved maintenance command (requires integration).",
          critical: true,
        },
        {
          category: "Review",
          mode: "command",
          trigger: "/approve",
          name: "Approve task",
          usage: "approve --task-id task-123",
          snippet: "approve --task-id task-123",
          description: "Approve a waiting_human task.",
        },
        {
          category: "Review",
          mode: "command",
          trigger: "/reprove",
          name: "Reprove task",
          usage: 'reprove --task-id task-123 --reason "Need changes"',
          snippet: 'reprove --task-id task-123 --reason "Need changes"',
          description: "Send a task back to agents with explicit feedback.",
        },
        {
          category: "Human",
          mode: "human",
          trigger: "yes",
          name: "Quick approve",
          usage: "yes",
          snippet: "yes",
          description: "Approve preferred pending review task.",
        },
        {
          category: "Human",
          mode: "human",
          trigger: "no",
          name: "Quick reprove",
          usage: "no because <reason>",
          snippet: "no because out of scope",
          description: "Reprove preferred review task with reason.",
        },
      ];

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

      function fmtRelativeTime(value) {
        const raw = String(value || "").trim();
        if (!raw) return "unknown";
        const date = new Date(raw);
        const ts = date.getTime();
        if (!Number.isFinite(ts)) return raw;
        const deltaMs = ts - Date.now();
        const absMs = Math.abs(deltaMs);
        if (!relativeTimeFormatter) return fmtDateTime(raw);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (absMs >= day) return relativeTimeFormatter.format(Math.round(deltaMs / day), "day");
        if (absMs >= hour) return relativeTimeFormatter.format(Math.round(deltaMs / hour), "hour");
        return relativeTimeFormatter.format(Math.round(deltaMs / minute), "minute");
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function fuzzyScore(query, target) {
        const q = String(query || "").trim().toLowerCase();
        const t = String(target || "").toLowerCase();
        if (!q) return 1;
        if (!t) return 0;
        const directIndex = t.indexOf(q);
        if (directIndex >= 0) {
          const directBoost = 1200 - directIndex * 3;
          return Math.max(1, directBoost - Math.max(0, t.length - q.length));
        }
        let ti = 0;
        let matched = 0;
        let gapPenalty = 0;
        for (let qi = 0; qi < q.length; qi += 1) {
          const ch = q[qi];
          let foundAt = -1;
          for (let search = ti; search < t.length; search += 1) {
            if (t[search] === ch) {
              foundAt = search;
              break;
            }
          }
          if (foundAt < 0) return 0;
          gapPenalty += Math.max(0, foundAt - ti);
          matched += 1;
          ti = foundAt + 1;
        }
        const score = 800 + matched * 10 - gapPenalty * 2 - (t.length - matched);
        return Math.max(1, score);
      }

      function highlightFuzzyMatch(text, query) {
        const source = String(text || "");
        const q = String(query || "").trim();
        if (!q) return escapeHtml(source);
        const lowerSource = source.toLowerCase();
        const lowerQuery = q.toLowerCase();
        const directIndex = lowerSource.indexOf(lowerQuery);
        if (directIndex >= 0) {
          const before = escapeHtml(source.slice(0, directIndex));
          const match = escapeHtml(source.slice(directIndex, directIndex + q.length));
          const after = escapeHtml(source.slice(directIndex + q.length));
          return before + "<mark class=\"hl\">" + match + "</mark>" + after;
        }
        const marks = new Set();
        let ti = 0;
        for (let qi = 0; qi < lowerQuery.length; qi += 1) {
          const ch = lowerQuery[qi];
          let foundAt = -1;
          for (let search = ti; search < lowerSource.length; search += 1) {
            if (lowerSource[search] === ch) {
              foundAt = search;
              break;
            }
          }
          if (foundAt < 0) return escapeHtml(source);
          marks.add(foundAt);
          ti = foundAt + 1;
        }
        let out = "";
        for (let index = 0; index < source.length; index += 1) {
          const ch = escapeHtml(source[index]);
          if (marks.has(index)) out += "<mark class=\"hl\">" + ch + "</mark>";
          else out += ch;
        }
        return out;
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

      function setConnectivityIndicator(isOnline, label) {
        if (!(connectivityIndicatorEl instanceof HTMLElement) || !(connectivityLabelEl instanceof HTMLElement)) return;
        connectivityIndicatorEl.classList.toggle("is-online", Boolean(isOnline));
        connectivityIndicatorEl.classList.toggle("is-offline", !isOnline);
        connectivityLabelEl.textContent = label || (isOnline ? "Online" : "Offline");
      }

      function setHeaderNotificationCount(value) {
        if (!(headerNotifCountEl instanceof HTMLElement)) return;
        const count = Math.max(0, Number(value || 0));
        headerNotifCountEl.textContent = String(count);
      }

      function setRuntimeStatusPill(runtime) {
        if (!(runtimeStatusPillEl instanceof HTMLElement)) return;
        const active = Boolean(runtime && runtime.isAlive);
        const provider = runtime && runtime.provider ? String(runtime.provider) : "Local LLM";
        runtimeStatusPillEl.textContent = provider + ": " + (active ? "Active" : "Idle");
      }

      function closeSidebarOverlay() {
        if (!(appShellEl instanceof HTMLElement)) return;
        appShellEl.classList.remove("menu-open");
      }

      function openSidebarOverlay() {
        if (!(appShellEl instanceof HTMLElement)) return;
        appShellEl.classList.add("menu-open");
      }

      function setFeedback(message, tone) {
        if (!feedbackEl) return;
        feedbackEl.textContent = message || "";
        feedbackEl.classList.toggle("error", tone === "error");
      }

      function setDecisionPending(taskId, action, pending) {
        const normalizedTaskId = String(taskId || "");
        const key = normalizedTaskId ? normalizedTaskId + ":" + String(action || "") : "";
        state.pendingActionKey = pending ? key : "";
        const buttons = Array.from(document.querySelectorAll("[data-task-action]"));
        for (const item of buttons) {
          if (!(item instanceof HTMLButtonElement)) continue;
          const buttonTaskId = String(item.dataset.taskId || state.selectedTaskId || "");
          const buttonAction = String(item.dataset.taskAction || "");
          const sameTask = buttonTaskId === normalizedTaskId;
          if (!sameTask) continue;
          if (pending) {
            item.disabled = true;
            if (!item.dataset.baseLabel) item.dataset.baseLabel = item.textContent || "";
            if (buttonAction === action) item.textContent = "Sending...";
          } else {
            item.disabled = false;
            if (item.dataset.baseLabel) item.textContent = item.dataset.baseLabel;
          }
        }
      }

      async function executeTaskAction(taskAction, taskIdToUse, reason, rollbackMode, rollbackStep) {
        if (!taskIdToUse) throw new Error("Select a task first.");
        const actionKey = String(taskAction || "");
        if (state.pendingActionKey) throw new Error("Another decision is still being submitted.");
        setDecisionPending(taskIdToUse, actionKey, true);
        try {
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
              rollbackStep,
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
        } finally {
          setDecisionPending(taskIdToUse, actionKey, false);
        }
      }

      function trimCommandLog() {
        if (state.commandLog.length > 180) state.commandLog = state.commandLog.slice(-180);
      }

      function catalogMatches(row, filter) {
        if (!filter) return true;
        return String(row.category || "").toLowerCase().includes(filter)
          || String(row.mode || "").toLowerCase().includes(filter)
          || String(row.trigger || "").toLowerCase().includes(filter)
          || String(row.name || "").toLowerCase().includes(filter)
          || String(row.usage || "").toLowerCase().includes(filter)
          || String(row.snippet || "").toLowerCase().includes(filter)
          || String(row.description || "").toLowerCase().includes(filter);
      }

      function listCatalogRows(filter) {
        const normalized = String(filter || "").trim().toLowerCase();
        return commandCatalog.filter((row) => catalogMatches(row, normalized));
      }

      function parseStructuredCommandOutput(message) {
        const raw = String(message || "");
        const trimmed = raw.trim();
        if (!trimmed) {
          return { kind: "text", message: "[empty]" };
        }

        const maybeJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
        if (maybeJson) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length && parsed.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
              const headerSet = new Set();
              for (const row of parsed) {
                for (const key of Object.keys(row)) {
                  headerSet.add(String(key));
                  if (headerSet.size >= 8) break;
                }
                if (headerSet.size >= 8) break;
              }
              const headers = Array.from(headerSet);
              const rows = parsed.slice(0, 24).map((row) => headers.map((header) => String(row[header] == null ? "" : row[header])));
              return {
                kind: "table",
                headers,
                rows,
              };
            }
            return {
              kind: "json",
              message: JSON.stringify(parsed, null, 2),
            };
          } catch {
            // fall through to plain text
          }
        }
        return { kind: "text", message: raw };
      }

      function commandEntryFilterKey(entry) {
        if (entry && entry.type === "run") {
          if (entry.status === "error") return "error";
          if (entry.status === "success") return "success";
          return "info";
        }
        const tone = String(entry && entry.tone || "info");
        if (tone === "critical") return "error";
        if (tone === "success") return "success";
        return "info";
      }

      function renderCommandOutputRow(row) {
        const tone = String(row && row.tone || "info");
        const normalizedTone = tone === "critical" || tone === "success" ? tone : "info";
        const formatted = row && row.formatted ? row.formatted : { kind: "text", message: String(row && row.message || "") };
        if (formatted.kind === "json") {
          return '<pre class="command-output-json">' + escapeHtml(formatted.message) + "</pre>";
        }
        if (formatted.kind === "table") {
          const headers = Array.isArray(formatted.headers) ? formatted.headers : [];
          const rows = Array.isArray(formatted.rows) ? formatted.rows : [];
          const tableHead = headers.map((header) => "<th>" + escapeHtml(header) + "</th>").join("");
          const tableRows = rows.map((cells) => "<tr>" + cells.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("");
          return '<div class="command-output-table-wrap"><table class="command-output-table"><thead><tr>' + tableHead + "</tr></thead><tbody>" + tableRows + "</tbody></table></div>";
        }
        return '<p class="command-entry-line ' + normalizedTone + '">' + escapeHtml(String(formatted.message || row.message || "")) + "</p>";
      }

      function renderCommandLog() {
        if (!(commandLogEl instanceof HTMLElement)) return;
        if (!state.commandLog.length) {
          commandLogEl.innerHTML = '<article class="command-entry note system"><p class="command-entry-line info">Command center ready.</p></article>';
          return;
        }

        const filter = String(state.commandLogFilter || "all");
        const rows = state.commandLog.filter((entry) => {
          if (filter === "all") return true;
          return commandEntryFilterKey(entry) === filter;
        });

        if (!rows.length) {
          commandLogEl.innerHTML = '<article class="command-entry note system"><p class="command-entry-line info">No log lines for this filter.</p></article>';
          return;
        }

        commandLogEl.innerHTML = rows.map((entry) => {
          if (!entry || entry.type !== "run") {
            const tone = String(entry && entry.tone || "info");
            const lineTone = tone === "critical" || tone === "success" ? tone : "info";
            return '<article class="command-entry note ' + escapeHtml(tone) + '"><p class="command-entry-line ' + escapeHtml(lineTone) + '">' + escapeHtml(String(entry && entry.message || "")) + "</p></article>";
          }
          const isPending = entry.status === "pending";
          const statusClass = isPending ? "pending" : entry.status === "error" ? "error" : "success";
          const statusIcon = isPending
            ? '<span class="spinner" aria-hidden="true"></span>'
            : statusClass === "success"
            ? "✓"
            : "!";
          const prompt = entry.mode === "human" ? "human>" : "$";
          const promptClass = entry.mode === "human" ? "human" : "command";
          const lines = Array.isArray(entry.outputs) ? entry.outputs : [];
          const outputHtml = lines.length
            ? lines.map((row) => renderCommandOutputRow(row)).join("")
            : '<p class="command-entry-line info">' + (isPending ? "Executing..." : "Completed.") + "</p>";
          return [
            '<article class="command-entry status-' + escapeHtml(entry.status) + '">',
            '<div class="command-entry-head">',
            '<div class="command-entry-meta">',
            '<span class="command-entry-status ' + statusClass + '" aria-hidden="true">' + statusIcon + "</span>",
            '<span class="command-entry-prompt ' + promptClass + '">' + prompt + "</span>",
            '<code class="command-entry-command">' + escapeHtml(entry.input) + "</code>",
            "</div>",
            '<span class="command-entry-time">' + escapeHtml(fmtRelativeTime(entry.at || "")) + "</span>",
            "</div>",
            '<div class="command-entry-output">' + outputHtml + "</div>",
            "</article>",
          ].join("");
        }).join("");
        commandLogEl.scrollTop = commandLogEl.scrollHeight;
      }

      function renderCommandReference() {
        if (!(commandRefEl instanceof HTMLElement) || !(commandRefListEl instanceof HTMLElement)) return;
        if (!state.commandRefOpen) {
          commandRefEl.setAttribute("hidden", "");
          return;
        }
        commandRefEl.removeAttribute("hidden");
        const rows = listCatalogRows(state.commandRefQuery);
        if (!rows.length) {
          commandRefListEl.innerHTML = '<div class="empty">No commands match this filter.</div>';
          return;
        }
        commandRefListEl.innerHTML = rows.map((row) => {
          return [
            '<article class="command-ref-item">',
            '<div class="command-ref-top"><strong>' + escapeHtml(row.name) + '</strong><span class="status ' + (row.mode === "human" ? "waiting_human" : "in_progress") + '">' + escapeHtml(row.category) + "</span></div>",
            '<div class="command-ref-code">' + escapeHtml(row.trigger) + "</div>",
            '<div class="muted">' + escapeHtml(row.description) + "</div>",
            '<div class="command-ref-code">' + escapeHtml("Usage: " + row.usage) + "</div>",
            '<div class="actions" style="margin-top:6px;"><button type="button" class="btn" data-command-snippet="' + escapeHtml(row.snippet) + '" data-command-mode="' + escapeHtml(row.mode) + '">Use snippet</button></div>',
            "</article>",
          ].join("");
        }).join("");
      }

      async function refreshOmniTasksCache(force) {
        const now = Date.now();
        if (!force && Array.isArray(state.omniTasksCache) && state.omniTasksCache.length && now - Number(state.omniTasksCacheAt || 0) < 15_000) {
          return;
        }
        if (state.omniLoading) return;
        state.omniLoading = true;
        try {
          const tasks = await api("/api/tasks");
          state.omniTasksCache = Array.isArray(tasks) ? tasks : [];
          state.omniTasksCacheAt = Date.now();
        } catch {
          // ignore refresh failures and keep stale cache
        } finally {
          state.omniLoading = false;
        }
      }

      function omniQuickActions(query, tasks) {
        const actions = [
          { label: "Go to Dashboard", subtitle: "Mission KPIs and recent tasks", kind: "nav", view: "overview" },
          { label: "View Active Agents", subtitle: "Open Team/Agents view", kind: "nav", view: "tasks" },
          { label: "Open Review Queue", subtitle: "Pending human decisions", kind: "nav", view: "review" },
          { label: "Blocked Tasks", subtitle: "Task Board filtered by blocked tasks", kind: "preset", view: "board", boardFilter: "status:blocked" },
          { label: "My Reviews", subtitle: "Task Board filtered by waiting human", kind: "preset", view: "board", boardFilter: "status:waiting_human" },
        ];
        const normalizedQuery = String(query || "").trim().toLowerCase();
        if (normalizedQuery) {
          const targetIdToken = normalizedQuery.match(/#?tx-?(\d+)/i);
          if (targetIdToken) {
            const numeric = Number(targetIdToken[1] || 0);
            if (Number.isFinite(numeric) && numeric > 0) {
              const found = tasks.find((task) => boardShortTaskId(task.taskId).toLowerCase() === ("#tx-" + String(numeric).padStart(3, "0")));
              if (found) {
                actions.unshift({
                  label: "Go to " + boardShortTaskId(found.taskId),
                  subtitle: String(found.title || found.taskId),
                  kind: "task",
                  taskId: found.taskId,
                });
              }
            }
          }
        }
        return actions;
      }

      function buildOmniResults() {
        const query = String(state.commandPaletteQuery || "").trim();
        const tasks = Array.isArray(state.omniTasksCache) ? state.omniTasksCache : [];
        const events = state.liveEvents.slice(-240).map((event, index) => buildStreamItem(event, index));
        const agentsMap = new Map();
        for (const task of tasks) {
          const current = String(task.currentAgent || "").trim();
          const next = String(task.nextAgent || "").trim();
          if (current) agentsMap.set(current.toLowerCase(), current);
          if (next) agentsMap.set(next.toLowerCase(), next);
        }
        const agents = Array.from(agentsMap.values());
        const groups = [];
        const flattened = [];

        function pushGroup(groupLabel, rows) {
          if (!rows.length) return;
          groups.push({ label: groupLabel, rows });
          for (const row of rows) flattened.push(row);
        }

        const quickActionRows = omniQuickActions(query, tasks)
          .map((row) => {
            const text = String(row.label || "") + " " + String(row.subtitle || "");
            return {
              ...row,
              category: "Quick Actions",
              score: fuzzyScore(query, text),
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
        pushGroup("Quick Actions", quickActionRows);

        const taskRows = tasks
          .map((task) => {
            const text = [task.taskId, boardShortTaskId(task.taskId), task.title, task.project, task.currentAgent, task.status].join(" ");
            return {
              category: "Tasks",
              kind: "task",
              taskId: task.taskId,
              label: String(task.title || task.taskId),
              subtitle: boardShortTaskId(task.taskId) + " • " + String(task.status || "unknown"),
              score: fuzzyScore(query, text),
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        pushGroup("Tasks", taskRows);

        const agentRows = agents
          .map((agent) => ({
            category: "Agents",
            kind: "agent",
            agent,
            label: agent,
            subtitle: "Filter board by " + agent,
            score: fuzzyScore(query, agent),
          }))
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
        pushGroup("Agents", agentRows);

        const eventRows = events
          .map((item) => {
            const text = [item.title, item.summary, item.taskId, item.agent, item.rawEvent, item.group].join(" ");
            return {
              category: "Events",
              kind: "event",
              eventKey: item.key,
              taskId: item.taskId,
              label: item.title,
              subtitle: (item.taskId ? boardShortTaskId(item.taskId) + " • " : "") + item.summary,
              score: fuzzyScore(query, text),
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        pushGroup("Events", eventRows);

        const commandRows = commandCatalog
          .map((row) => {
            const text = [row.name, row.trigger, row.snippet, row.usage, row.description].join(" ");
            return {
              category: "Commands",
              kind: "command",
              commandMode: row.mode,
              label: row.name,
              subtitle: row.usage,
              snippet: row.snippet,
              score: fuzzyScore(query, text),
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        pushGroup("Commands", commandRows);

        state.omniResults = flattened;
        if (state.omniActiveIndex >= state.omniResults.length) state.omniActiveIndex = Math.max(0, state.omniResults.length - 1);
        return groups;
      }

      function applyOmniSelection(index) {
        const row = state.omniResults[index];
        if (!row) return;
        closeCommandPalette();
        if (row.kind === "task" && row.taskId) {
          openTaskDetail(row.taskId, state.view);
          return;
        }
        if (row.kind === "agent" && row.agent) {
          state.boardFilter = "agent:" + row.agent;
          state.boardRenderedKey = "";
          setView("board");
          return;
        }
        if (row.kind === "event") {
          setView("live");
          if (row.taskId) void openTaskDrawer(row.taskId, "Agent Logs");
          return;
        }
        if (row.kind === "command" && row.snippet) {
          applyCommandSnippet(row.snippet, row.commandMode || "command", false);
          return;
        }
        if (row.kind === "preset") {
          state.boardFilter = String(row.boardFilter || "");
          state.boardRenderedKey = "";
          setView(String(row.view || "board"));
          return;
        }
        if (row.kind === "nav") {
          setView(String(row.view || "overview"));
          return;
        }
      }

      function renderCommandPalette() {
        if (!(commandPaletteEl instanceof HTMLElement) || !(commandPaletteListEl instanceof HTMLElement)) return;
        if (!state.commandPaletteOpen) {
          commandPaletteEl.setAttribute("hidden", "");
          commandPaletteEl.setAttribute("aria-hidden", "true");
          return;
        }
        commandPaletteEl.removeAttribute("hidden");
        commandPaletteEl.setAttribute("aria-hidden", "false");
        const groups = buildOmniResults();
        if (state.omniLoading && (!state.omniTasksCache || !state.omniTasksCache.length)) {
          commandPaletteListEl.innerHTML = '<div class="loading">Loading search index...</div>';
          return;
        }
        if (!groups.length) {
          commandPaletteListEl.innerHTML = '<div class="empty">No results for this search.</div>';
          return;
        }
        let indexCursor = 0;
        const query = String(state.commandPaletteQuery || "");
        commandPaletteListEl.innerHTML = groups.map((group) => {
          return [
            '<section class="command-palette-group">',
            '<div class="command-palette-group-label">' + escapeHtml(group.label) + "</div>",
            group.rows.map((row) => {
              const itemIndex = indexCursor;
              indexCursor += 1;
              const active = itemIndex === state.omniActiveIndex ? " active" : "";
              return [
                '<article class="command-palette-item' + active + '" data-omni-index="' + String(itemIndex) + '" role="button" tabindex="0">',
                '<div class="top"><strong>' + highlightFuzzyMatch(String(row.label || ""), query) + '</strong><span class="status in_progress">' + escapeHtml(String(row.category || "")) + "</span></div>",
                '<div class="snippet">' + highlightFuzzyMatch(String(row.subtitle || ""), query) + "</div>",
                "</article>",
              ].join("");
            }).join(""),
            "</section>",
          ].join("");
        }).join("");
      }

      function renderCommandSuggestions(inputValue) {
        if (!(commandSuggestEl instanceof HTMLElement)) return;
        const raw = String(inputValue || "").trim();
        if (!raw.startsWith("/")) {
          state.commandSuggestionsOpen = false;
          state.commandSuggestions = [];
          state.commandSuggestionsIndex = 0;
          commandSuggestEl.setAttribute("hidden", "");
          return;
        }
        const query = String(raw.split(/\s+/)[0] || "").toLowerCase();
        const suggestions = commandCatalog
          .filter((row) => String(row.trigger || "").toLowerCase().startsWith(query))
          .slice(0, 8);
        state.commandSuggestions = suggestions;
        state.commandSuggestionsIndex = 0;
        if (!suggestions.length) {
          state.commandSuggestionsOpen = false;
          commandSuggestEl.setAttribute("hidden", "");
          return;
        }
        state.commandSuggestionsOpen = true;
        commandSuggestEl.removeAttribute("hidden");
        commandSuggestEl.innerHTML = suggestions.map((row, index) => {
          const active = index === state.commandSuggestionsIndex ? " active" : "";
          return [
            '<button type="button" class="command-suggest-item' + active + '" data-command-suggest-index="' + String(index) + '" data-command-snippet="' + escapeHtml(row.snippet) + '" data-command-mode="' + escapeHtml(row.mode) + '">',
            '<span class="top"><span class="trigger">' + escapeHtml(row.trigger) + '</span><span class="status ' + (row.critical ? "failed" : "in_progress") + '">' + escapeHtml(row.category) + "</span></span>",
            '<span class="snippet">' + escapeHtml(row.description) + "</span>",
            "</button>",
          ].join("");
        }).join("");
      }

      function setCommandSuggestionActive(nextIndex) {
        if (!state.commandSuggestionsOpen) return;
        const total = Array.isArray(state.commandSuggestions) ? state.commandSuggestions.length : 0;
        if (!total) return;
        const normalized = ((nextIndex % total) + total) % total;
        state.commandSuggestionsIndex = normalized;
        const buttons = Array.from(document.querySelectorAll(".command-suggest-item"));
        for (const [index, button] of buttons.entries()) {
          if (!(button instanceof HTMLElement)) continue;
          button.classList.toggle("active", index === normalized);
        }
      }

      function applyCommandSnippet(snippet, mode, closePalette) {
        const value = String(snippet || "").trim();
        if (!value || !(commandInputEl instanceof HTMLInputElement)) return;
        commandInputEl.value = value;
        state.commandHistoryIndex = -1;
        if (mode && commandModeEl instanceof HTMLSelectElement) {
          const normalized = mode === "human" ? "human" : "command";
          commandModeEl.value = normalized;
          state.commandMode = normalized;
        }
        if (closePalette) {
          state.commandPaletteOpen = false;
          renderCommandPalette();
        }
        commandInputEl.focus();
        renderCommandSuggestions(value);
      }

      function openCommandPalette(seedQuery) {
        state.commandPaletteOpen = true;
        if (typeof seedQuery === "string") state.commandPaletteQuery = seedQuery;
        state.omniActiveIndex = 0;
        renderCommandPalette();
        void refreshOmniTasksCache(false).then(() => {
          if (state.commandPaletteOpen) renderCommandPalette();
        });
        if (commandPaletteFilterEl instanceof HTMLInputElement) {
          commandPaletteFilterEl.value = state.commandPaletteQuery;
          commandPaletteFilterEl.focus();
          commandPaletteFilterEl.select();
        }
      }

      function closeCommandPalette() {
        state.commandPaletteOpen = false;
        renderCommandPalette();
      }

      function openCommandConfirm(payload) {
        state.commandConfirm = payload || null;
        if (!(commandConfirmEl instanceof HTMLElement) || !(commandConfirmBodyEl instanceof HTMLElement)) return;
        if (!state.commandConfirm) {
          commandConfirmEl.setAttribute("hidden", "");
          commandConfirmEl.setAttribute("aria-hidden", "true");
          return;
        }
        const commandText = String(state.commandConfirm.input || "");
        commandConfirmBodyEl.textContent = "Command: " + commandText + ". This can impact runtime stability. Continue?";
        commandConfirmEl.removeAttribute("hidden");
        commandConfirmEl.setAttribute("aria-hidden", "false");
      }

      function closeCommandConfirm() {
        state.commandConfirm = null;
        if (!(commandConfirmEl instanceof HTMLElement)) return;
        commandConfirmEl.setAttribute("hidden", "");
        commandConfirmEl.setAttribute("aria-hidden", "true");
      }

      function pushCommandLog(message, tone) {
        const normalizedTone = tone === "critical" || tone === "success" || tone === "system" ? tone : "info";
        state.commandRunCounter += 1;
        state.commandLog.push({
          id: state.commandRunCounter,
          type: "note",
          message: String(message || ""),
          tone: normalizedTone,
          at: new Date().toISOString(),
        });
        trimCommandLog();
        renderCommandLog();
      }

      function startCommandRun(input, mode) {
        state.commandRunCounter += 1;
        const run = {
          id: state.commandRunCounter,
          type: "run",
          input: String(input || ""),
          mode: mode === "human" ? "human" : "command",
          status: "pending",
          outputs: [],
          at: new Date().toISOString(),
        };
        state.commandLog.push(run);
        trimCommandLog();
        renderCommandLog();
        return run;
      }

      function appendRunOutput(run, message, tone) {
        if (!run) return;
        const text = String(message || "");
        const level = tone === "critical" || tone === "success" ? tone : "info";
        run.outputs.push({
          tone: level,
          message: text,
          formatted: parseStructuredCommandOutput(text),
        });
      }

      function finalizeRun(run, status) {
        if (!run) return;
        run.status = status === "error" ? "error" : status === "success" ? "success" : "pending";
        renderCommandLog();
      }

      function rememberCommandHistory(rawInput) {
        const value = String(rawInput || "").trim();
        if (!value) return;
        const history = Array.isArray(state.commandHistory) ? state.commandHistory : [];
        if (!history.length || history[history.length - 1] !== value) history.push(value);
        if (history.length > 80) history.splice(0, history.length - 80);
        state.commandHistory = history;
        state.commandHistoryIndex = -1;
      }

      function browseCommandHistory(direction) {
        const history = Array.isArray(state.commandHistory) ? state.commandHistory : [];
        if (!history.length) return "";
        const step = direction < 0 ? -1 : 1;
        const current = Number(state.commandHistoryIndex);
        if (current < 0 && step < 0) {
          state.commandHistoryIndex = history.length - 1;
        } else if (current >= 0) {
          state.commandHistoryIndex = Math.min(history.length, Math.max(0, current + step));
          if (state.commandHistoryIndex === history.length) {
            state.commandHistoryIndex = -1;
            return "";
          }
        }
        if (state.commandHistoryIndex < 0) return "";
        return String(history[state.commandHistoryIndex] || "");
      }

      function resolveCommandDispatch(rawInput) {
        const raw = String(rawInput || "").trim();
        const firstToken = String(raw.split(/\s+/)[0] || "").toLowerCase();
        if (!raw) return { kind: "inline", input: "" };
        if (firstToken === "/status") return { kind: "inline", input: raw.includes("--all") ? "status --all" : "status" };
        if (firstToken === "/help") return { kind: "inline", input: "help" };
        if (firstToken === "/deploy") return { kind: "inline", input: 'new "Deploy release" --type Feature' };
        if (firstToken === "/rollback") return { kind: "inline", input: 'reprove --task-id task-123 --reason "Rollback requested"' };
        if (firstToken === "/pause-all" || firstToken === "pause") return { kind: "runtime", action: "pause" };
        if (firstToken === "/resume-runtime" || firstToken === "resume") return { kind: "runtime", action: "resume" };
        if (firstToken === "/stop-runtime") return { kind: "runtime", action: "stop" };
        if (firstToken === "/clear-cache") {
          return { kind: "unsupported", message: "/clear-cache is not wired in backend yet. Integrate runtime cache API first." };
        }
        if (firstToken.startsWith("/")) return { kind: "inline", input: raw.slice(1) };
        return { kind: "inline", input: raw };
      }

      function isCriticalCommand(rawInput, dispatch) {
        const firstToken = String(String(rawInput || "").trim().split(/\s+/)[0] || "").toLowerCase();
        if (dispatch && dispatch.kind === "runtime" && dispatch.action === "stop") return true;
        if (dispatch && dispatch.kind === "unsupported" && firstToken === "/clear-cache") return true;
        return firstToken === "stop" || firstToken === "/stop-runtime" || firstToken === "/flush-db" || firstToken === "flush-db";
      }

      async function executeWebCommand(input, mode, options) {
        const raw = String(input || "").trim();
        if (!raw) return;
        const selectedMode = mode === "human" ? "human" : "command";
        const dispatch = resolveCommandDispatch(raw);
        if (!options || options.skipConfirm !== true) {
          if (isCriticalCommand(raw, dispatch)) {
            openCommandConfirm({
              input: raw,
              mode: selectedMode,
            });
            return;
          }
        }

        rememberCommandHistory(raw);
        const run = startCommandRun(raw, selectedMode);
        try {
          if (dispatch.kind === "unsupported") {
            appendRunOutput(run, dispatch.message, "critical");
            finalizeRun(run, "error");
            setFeedback(dispatch.message, "error");
            return;
          }

          if (dispatch.kind === "runtime") {
            await postApi("/api/runtime/" + encodeURIComponent(dispatch.action), {
              reason: "Triggered from command center",
            });
            appendRunOutput(run, "Runtime command accepted: " + dispatch.action + ".", "success");
            setPollStatus("Runtime command sent: " + dispatch.action);
            finalizeRun(run, "success");
            requestRender("user");
            return;
          }

          const runtimeInput = String(dispatch.input || "");
          const result = await postApi("/api/command", {
            input: runtimeInput,
            mode: selectedMode,
          });
          const lines = Array.isArray(result && result.lines) ? result.lines : [];
          if (!lines.length) {
            appendRunOutput(run, "No output lines returned by command handler.", "info");
          } else {
            for (const line of lines) {
              const text = String(line && line.message || "");
              const tone = String(line && line.level || "info");
              appendRunOutput(run, text || "[empty]", tone === "critical" ? "critical" : "success");
            }
          }
          if (result && result.stopRequested) {
            appendRunOutput(run, "Runtime stop requested from command input.", "success");
          }
          const hasCritical = run.outputs.some((row) => row.tone === "critical");
          finalizeRun(run, hasCritical ? "error" : "success");
          requestRender("user");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Command failed";
          appendRunOutput(run, message, "critical");
          finalizeRun(run, "error");
          setFeedback(message, "error");
        }
      }

      function loadThemePreference() {
        const attributeValue = rootEl.getAttribute("data-theme-preference");
        if (attributeValue === "light" || attributeValue === "dark" || attributeValue === "system") return attributeValue;
        try {
          const stored = localStorage.getItem(THEME_STORAGE_KEY);
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
        rootEl.setAttribute("data-theme-preference", normalized);
        rootEl.setAttribute("data-theme", resolved);
        rootEl.style.colorScheme = resolved;
        for (const button of themeButtons) {
          if (!(button instanceof HTMLElement)) continue;
          const isActive = button.dataset.themeOption === normalized;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        }
        if (persist !== false) {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, normalized);
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

      function updateReviewHotspot(waitingCount) {
        const count = Math.max(0, Number(waitingCount || 0));
        if (reviewHotspotMetaEl) {
          reviewHotspotMetaEl.textContent = count > 0
            ? fmtNumber(count) + " task(s) waiting for human decision."
            : "No tasks waiting right now.";
        }
        if (reviewHotspotEl) {
          if (count > 0) reviewHotspotEl.removeAttribute("hidden");
          else reviewHotspotEl.setAttribute("hidden", "");
        }
      }

      function applyOverviewSnapshot(overview) {
        const safe = asObject(overview);
        const runtime = asObject(safe.runtime);
        const counts = asObject(safe.counts);
        const consumption = asObject(safe.consumption);
        setTextIfChanged("snapshot-engine", runtime.isAlive ? "Alive" : "Stopped");
        setTextIfChanged("snapshot-active", fmtNumber(counts.active));
        setTextIfChanged("snapshot-waiting", fmtNumber(counts.waitingHuman));
        setTextIfChanged("snapshot-cost", fmtCost(consumption.estimatedCostUsd));
        setTextIfChanged("snapshot-updated", fmtTimeNow());
        setHeaderNotificationCount(counts.waitingHuman);
        setRuntimeStatusPill(runtime);
        updateReviewHotspot(counts.waitingHuman);
      }

      let snapshotInFlight = false;
      async function refreshGlobalSnapshot() {
        if (snapshotInFlight) return;
        snapshotInFlight = true;
        try {
          const overview = await api("/api/overview");
          applyOverviewSnapshot(overview);
        } catch {
          // ignore snapshot refresh failures; main view rendering keeps detailed errors
        } finally {
          snapshotInFlight = false;
        }
      }

      function asObject(value) {
        return value && typeof value === "object" ? value : {};
      }

      function eventTone(eventType, rawEvent, payloadObj) {
        const payload = asObject(payloadObj);
        const rawPayload = asObject(payload.payload);
        const status = String(rawPayload.status || payload.status || "").toLowerCase();
        const raw = String(rawEvent || "").toLowerCase();
        if (eventType === "task.review_required") return "review";
        if (eventType === "task.decision_recorded") return "review";
        if (status === "failed" || status === "blocked" || status === "archived") return "alert";
        if (/\berror\b|\bfailed\b|\bblocked\b/.test(raw)) return "alert";
        if (eventType === "task.updated") return "task";
        if (eventType === "metrics.updated") return "metrics";
        return "runtime";
      }

      function eventGroup(eventType, tone) {
        if (tone === "alert") return "alerts";
        if (eventType === "task.decision_recorded") return "human";
        if (eventType === "task.updated" || eventType === "task.review_required") return "tasks";
        return "runtime";
      }

      function eventExecutor(payloadObj, fallback) {
        const payload = asObject(payloadObj);
        const rawPayload = asObject(payload.payload);
        return String(
          rawPayload.currentAgent
          || rawPayload.agent
          || rawPayload.requestedBy
          || payload.source
          || fallback
          || "system",
        );
      }

      function eventTitle(eventType, rawEvent, payloadObj) {
        const payload = asObject(payloadObj);
        const rawPayload = asObject(payload.payload);
        const stage = String(rawPayload.currentStage || "").toLowerCase();
        const status = String(rawPayload.status || "").toLowerCase();
        const decision = String(rawPayload.decision || "").toLowerCase();
        const raw = String(rawEvent || "").toLowerCase();
        if (eventType === "task.review_required") return "Revisão humana necessária";
        if (eventType === "task.decision_recorded") {
          if (decision === "approved") return "Aprovação humana registrada";
          if (decision === "reproved") return "Reprovação humana registrada";
          return "Decisão humana registrada";
        }
        if (eventType === "task.updated") {
          if (raw === "task.created") return "Nova tarefa recebida";
          if (status === "failed" || status === "blocked") return "Falha crítica em tarefa";
          if (stage.includes("research")) return "Pesquisa de mercado iniciada";
          if (stage.includes("qa")) return "Validação de QA em andamento";
          if (stage.includes("review")) return "Tarefa movida para revisão";
          if (status === "done") return "Tarefa concluída";
          return "Atualização operacional de tarefa";
        }
        if (eventType === "runtime.updated") {
          if (raw === "engine.started") return "Runtime iniciado";
          if (raw === "engine.stopped") return "Runtime interrompido";
          if (raw === "engine.paused") return "Runtime pausado";
          if (raw === "engine.resumed") return "Runtime retomado";
          if (raw === "engine.stop_requested") return "Solicitação de parada recebida";
          return "Atualização de runtime";
        }
        if (eventType === "metrics.updated") return "Métricas atualizadas";
        return "Evento operacional";
      }

      function eventSummary(event) {
        const payloadObj = asObject(event.payload);
        const rawPayload = asObject(payloadObj.payload);
        const rawEvent = String(payloadObj.rawEvent || event.type || "");
        const stage = String(rawPayload.currentStage || event.stage || "");
        const currentAgent = eventExecutor(payloadObj, "agent");
        const nextAgent = String(rawPayload.nextAgent || rawPayload.returnedTo || "");
        const reason = String(rawPayload.reason || payloadObj.reason || "");
        const status = String(rawPayload.status || "").toLowerCase();

        if (event.type === "task.review_required") {
          const context = [
            stage ? "stage " + stage : "",
            currentAgent ? "agent " + currentAgent : "",
          ].filter(Boolean).join(" • ");
          return context
            ? "A tarefa está aguardando decisão humana (" + context + ")."
            : "A tarefa entrou no gargalo de revisão humana.";
        }
        if (event.type === "task.decision_recorded") {
          const decision = String(rawPayload.decision || "");
          if (decision === "approved") return "A saída da IA foi aprovada e o fluxo seguiu para done.";
          if (decision === "reproved") {
            const rollbackMode = String(rawPayload.rollbackMode || "");
            const toAgent = nextAgent ? "retornando para " + nextAgent : "retornando ao fluxo de implementação";
            const rollback = rollbackMode ? " (rollback: " + rollbackMode + ")" : "";
            const why = reason ? " Motivo: " + reason + "." : "";
            return "Reprovação registrada, " + toAgent + rollback + "." + why;
          }
          return "Uma decisão humana foi anexada ao histórico da tarefa.";
        }
        if (event.type === "metrics.updated") {
          const prev = Number(payloadObj.previousCount || 0);
          const curr = Number(payloadObj.currentCount || 0);
          if (Number.isFinite(prev) && Number.isFinite(curr)) {
            return "A amostragem operacional mudou de " + prev + " para " + curr + " pontos.";
          }
          return "Os indicadores de performance foram atualizados.";
        }
        if (event.type === "runtime.updated") {
          const requestedBy = String(rawPayload.requestedBy || "");
          const reasonText = String(rawPayload.reason || "");
          if (rawEvent === "engine.started") return "O loop principal foi iniciado e está apto a processar tarefas.";
          if (rawEvent === "engine.stopped") return "O loop principal foi interrompido.";
          if (rawEvent === "engine.paused") return "O processamento está pausado aguardando intervenção.";
          if (rawEvent === "engine.resumed") return "O processamento voltou ao estado ativo.";
          if (rawEvent === "engine.stop_requested") {
            const context = [requestedBy ? "requestedBy=" + requestedBy : "", reasonText ? "reason=" + reasonText : ""]
              .filter(Boolean)
              .join(" • ");
            return context ? "Parada graciosa solicitada (" + context + ")." : "Parada graciosa solicitada.";
          }
          return "Estado de runtime alterado.";
        }
        if (event.type === "task.updated") {
          if (rawEvent === "task.created") {
            const title = String(rawPayload.title || "");
            const project = String(rawPayload.project || "");
            const parts = [title ? "título: " + title : "", project ? "projeto: " + project : ""]
              .filter(Boolean)
              .join(" • ");
            return parts ? "Uma nova demanda entrou no pipeline (" + parts + ")." : "Uma nova demanda entrou no pipeline.";
          }
          if (rawEvent === "task.cancel_requested") {
            return reason
              ? "Cancelamento solicitado para a tarefa. Motivo: " + reason + "."
              : "Cancelamento solicitado para a tarefa.";
          }
          const context = [
            status ? "status " + status : "",
            stage ? "stage " + stage : "",
            currentAgent ? "executor " + currentAgent : "",
            nextAgent ? "próximo " + nextAgent : "",
            reason ? "motivo " + reason : "",
          ].filter(Boolean).join(" • ");
          return context ? "A tarefa mudou de estado (" + context + ")." : "Mudança operacional registrada na tarefa.";
        }
        return "Evento operacional recebido.";
      }

      function eventIconKey(eventType, rawEvent, payloadObj, tone) {
        const payload = asObject(payloadObj);
        const rawPayload = asObject(payload.payload);
        const stage = String(rawPayload.currentStage || "").toLowerCase();
        const decision = String(rawPayload.decision || "").toLowerCase();
        const raw = String(rawEvent || "").toLowerCase();
        if (tone === "alert") return "alert";
        if (eventType === "task.review_required") return "review";
        if (eventType === "task.decision_recorded") return decision === "approved" ? "approved" : "review";
        if (stage.includes("research")) return "research";
        if (stage.includes("qa")) return "qa";
        if (stage.includes("build") || stage.includes("coder") || stage.includes("front") || stage.includes("back")) return "build";
        if (raw.includes("engine")) return "runtime";
        return "task";
      }

      function renderEventIcon(iconKey) {
        const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
        if (iconKey === "research") return '<svg ' + common + '><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>';
        if (iconKey === "build") return '<svg ' + common + '><path d="m14 7 3 3-8 8-3 1 1-3z" /><path d="m12 9 3 3" /></svg>';
        if (iconKey === "approved") return '<svg ' + common + '><circle cx="12" cy="12" r="8" /><path d="m8.8 12.2 2.2 2.2 4.4-4.4" /></svg>';
        if (iconKey === "review") return '<svg ' + common + '><path d="M4 12h7" /><path d="m9 7 5 5-5 5" /><rect x="14" y="4" width="7" height="16" rx="2" /></svg>';
        if (iconKey === "runtime") return '<svg ' + common + '><path d="M12 3v8" /><path d="M8.1 5.8A8 8 0 1 0 16 5.8" /></svg>';
        if (iconKey === "alert") return '<svg ' + common + '><path d="M12 4 3 20h18z" /><path d="M12 9v5" /><circle cx="12" cy="17" r="1" /></svg>';
        if (iconKey === "qa") return '<svg ' + common + '><path d="m8 12 2.5 2.5L16 9" /><rect x="4" y="4" width="16" height="16" rx="2" /></svg>';
        return '<svg ' + common + '><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg>';
      }

      function buildStreamItem(event, index) {
        const payloadObj = asObject(event.payload);
        const rawPayload = asObject(payloadObj.payload);
        const rawEvent = String(payloadObj.rawEvent || event.type || "");
        const tone = eventTone(event.type, rawEvent, payloadObj);
        const group = eventGroup(event.type, tone);
        const title = eventTitle(event.type, rawEvent, payloadObj);
        const summary = eventSummary(event);
        const iconKey = eventIconKey(event.type, rawEvent, payloadObj, tone);
        const taskId = String(event.taskId || rawPayload.taskId || "");
        const agent = eventExecutor(payloadObj, rawPayload.currentAgent || "");
        const pin = event.type === "task.review_required";
        const alert = tone === "alert";
        const key = String(event.id || "") + "|" + String(event.at || "") + "|" + String(index);
        return {
          key,
          tone,
          group,
          title,
          summary,
          iconKey,
          taskId,
          agent,
          pin,
          alert,
          at: String(event.at || ""),
          rawEvent,
          payloadObj,
        };
      }

      function streamFilterMatches(item, filter) {
        const normalized = String(filter || "all");
        if (normalized === "all") return true;
        if (normalized === "tasks") return item.group === "tasks";
        if (normalized === "runtime") return item.group === "runtime";
        if (normalized === "human") return item.group === "human";
        if (normalized === "alerts") return item.alert;
        return true;
      }

      function isKnownView(view) {
        return view === "overview"
          || view === "tasks"
          || view === "board"
          || view === "review"
          || view === "detail"
          || view === "live"
          || view === "analytics";
      }

      function persistUiPrefs() {
        safeWriteLocalStorage(UI_PREFS_STORAGE_KEY, JSON.stringify({
          lastView: state.view,
          boardFilter: state.boardFilter,
          liveFilter: state.liveFilter,
          commandMode: state.commandMode,
          analyticsPreset: state.analyticsPreset,
          analyticsCustomFrom: state.analyticsCustomFrom,
          analyticsCustomTo: state.analyticsCustomTo,
        }));
      }

      function loadUiPrefs() {
        const raw = safeReadLocalStorage(UI_PREFS_STORAGE_KEY);
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          const lastView = String(parsed && parsed.lastView || "");
          const boardFilter = String(parsed && parsed.boardFilter || "");
          const liveFilter = String(parsed && parsed.liveFilter || "");
          const commandMode = String(parsed && parsed.commandMode || "");
          const analyticsPreset = String(parsed && parsed.analyticsPreset || "");
          const analyticsCustomFrom = String(parsed && parsed.analyticsCustomFrom || "");
          const analyticsCustomTo = String(parsed && parsed.analyticsCustomTo || "");
          if (isKnownView(lastView)) state.view = lastView;
          if (boardFilter) state.boardFilter = boardFilter;
          if (liveFilter === "all" || liveFilter === "tasks" || liveFilter === "runtime" || liveFilter === "human" || liveFilter === "alerts") {
            state.liveFilter = liveFilter;
          }
          if (commandMode === "human" || commandMode === "command") state.commandMode = commandMode;
          if (analyticsPreset === "24h" || analyticsPreset === "7d" || analyticsPreset === "30d" || analyticsPreset === "custom") {
            state.analyticsPreset = analyticsPreset;
          }
          if (analyticsCustomFrom) state.analyticsCustomFrom = analyticsCustomFrom;
          if (analyticsCustomTo) state.analyticsCustomTo = analyticsCustomTo;
        } catch {
          // ignore invalid persisted payload
        }
      }

      function syncUrlState() {
        let url = null;
        try {
          url = new URL(window.location.href);
        } catch {
          url = null;
        }
        if (!url) return;
        const params = url.searchParams;
        params.set("view", state.view);
        if (state.boardFilter) params.set("board", state.boardFilter);
        else params.delete("board");
        if (state.boardFilter.startsWith("status:")) params.set("status", state.boardFilter.slice("status:".length));
        else params.delete("status");
        if (state.liveFilter && state.liveFilter !== "all") params.set("live", state.liveFilter);
        else params.delete("live");
        if (state.view === "analytics") {
          params.set("range", state.analyticsPreset);
          if (state.analyticsPreset === "custom") {
            if (state.analyticsCustomFrom) params.set("from", state.analyticsCustomFrom);
            else params.delete("from");
            if (state.analyticsCustomTo) params.set("to", state.analyticsCustomTo);
            else params.delete("to");
          } else {
            params.delete("from");
            params.delete("to");
          }
        } else {
          params.delete("range");
          params.delete("from");
          params.delete("to");
        }
        if (state.view === "detail" && state.selectedTaskId) params.set("task", state.selectedTaskId);
        else params.delete("task");
        if (state.drawerOpen && state.drawerTaskId) {
          params.set("drawerTask", state.drawerTaskId);
          if (state.drawerContextLabel) params.set("drawerCtx", state.drawerContextLabel);
        } else {
          params.delete("drawerTask");
          params.delete("drawerCtx");
        }
        const nextUrl = url.pathname + (params.toString() ? "?" + params.toString() : "");
        try {
          history.replaceState(null, "", nextUrl);
        } catch {
          // ignore history errors
        }
      }

      function applyRouteState() {
        let url = null;
        try {
          url = new URL(window.location.href);
        } catch {
          url = null;
        }
        if (!url) return;
        const view = String(url.searchParams.get("view") || "");
        const board = String(url.searchParams.get("board") || "");
        const status = String(url.searchParams.get("status") || "");
        const live = String(url.searchParams.get("live") || "");
        const range = String(url.searchParams.get("range") || "");
        const from = String(url.searchParams.get("from") || "");
        const to = String(url.searchParams.get("to") || "");
        const task = String(url.searchParams.get("task") || "");
        const drawerTask = String(url.searchParams.get("drawerTask") || "");
        const drawerCtx = String(url.searchParams.get("drawerCtx") || "");
        if (isKnownView(view)) state.view = view;
        if (board) state.boardFilter = board;
        else if (status) state.boardFilter = "status:" + status;
        if (live === "all" || live === "tasks" || live === "runtime" || live === "human" || live === "alerts") {
          state.liveFilter = live;
        }
        if (range === "24h" || range === "7d" || range === "30d" || range === "custom") {
          state.analyticsPreset = range;
        }
        if (from) state.analyticsCustomFrom = from;
        if (to) state.analyticsCustomTo = to;
        if (task) state.selectedTaskId = task;
        if (drawerTask) {
          state.drawerOpen = true;
          state.drawerTaskId = drawerTask;
          state.drawerContextLabel = drawerCtx || "Agent Logs";
        }
      }

      function viewLabel(view) {
        return viewMeta[view] ? viewMeta[view].breadcrumb : viewMeta.overview.breadcrumb;
      }

      function updateHeaderMeta() {
        const meta = viewMeta[state.view] || viewMeta.overview;
        let breadcrumb = meta.breadcrumb;
        let title = meta.title;
        if (state.view === "detail" && state.selectedTaskId) {
          const taskChip = boardShortTaskId(state.selectedTaskId);
          breadcrumb = (state.detailOriginLabel || "Task Board") + " > " + taskChip;
          title = "Task Drilldown " + taskChip;
        }
        if (state.drawerOpen && state.drawerTaskId) {
          const taskChip = boardShortTaskId(state.drawerTaskId);
          breadcrumb = viewLabel(state.view) + " > " + taskChip + " > " + (state.drawerContextLabel || "Agent Logs");
        }
        if (headerViewKeyEl) headerViewKeyEl.textContent = breadcrumb;
        if (headerScreenTitleEl) headerScreenTitleEl.textContent = title;
      }

      function setView(view, options) {
        const nextView = isKnownView(view) ? view : "overview";
        const source = options && isKnownView(options.sourceView) ? options.sourceView : state.view;
        if (nextView === "detail" && state.selectedTaskId) {
          state.detailOriginView = source;
          state.detailOriginLabel = viewLabel(source);
        }
        state.view = nextView;
        navButtons.forEach((button) => {
          const isActive = button.dataset.view === nextView;
          button.classList.toggle("active", isActive);
          if (isActive) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
        });
        if (nextView === "live") {
          state.liveAutoScroll = true;
          state.liveRenderedKey = "";
        } else if (state.drawerOpen) {
          state.drawerOpen = false;
          state.drawerTaskId = "";
          state.drawerContextLabel = "";
          state.drawerDetail = null;
          state.drawerLoading = false;
          renderTaskDrawer();
        }
        updateHeaderMeta();
        syncUrlState();
        persistUiPrefs();
        closeSidebarOverlay();
        requestRender("user");
      }

      function openTaskDetail(taskId, sourceView) {
        const normalizedTaskId = String(taskId || "").trim();
        if (!normalizedTaskId) return;
        state.selectedTaskId = normalizedTaskId;
        state.detailOriginView = isKnownView(sourceView) ? sourceView : state.view;
        state.detailOriginLabel = viewLabel(state.detailOriginView);
        setView("detail", { sourceView: state.detailOriginView });
      }

      function closeTaskDrawer() {
        state.drawerOpen = false;
        state.drawerTaskId = "";
        state.drawerContextLabel = "";
        state.drawerDetail = null;
        state.drawerLoading = false;
        if (taskDrawerEl instanceof HTMLElement) {
          taskDrawerEl.setAttribute("hidden", "");
          taskDrawerEl.setAttribute("aria-hidden", "true");
        }
        syncUrlState();
        updateHeaderMeta();
      }

      function renderTaskDrawer() {
        if (!(taskDrawerEl instanceof HTMLElement) || !(taskDrawerContentEl instanceof HTMLElement)) return;
        if (!state.drawerOpen || !state.drawerTaskId) {
          taskDrawerEl.setAttribute("hidden", "");
          taskDrawerEl.setAttribute("aria-hidden", "true");
          return;
        }
        taskDrawerEl.removeAttribute("hidden");
        taskDrawerEl.setAttribute("aria-hidden", "false");
        if (taskDrawerPathEl instanceof HTMLElement) {
          taskDrawerPathEl.textContent = (state.drawerContextLabel || "Task Context") + " • " + boardShortTaskId(state.drawerTaskId);
        }
        if (taskDrawerTitleEl instanceof HTMLElement) {
          taskDrawerTitleEl.textContent = state.drawerDetail && state.drawerDetail.title
            ? String(state.drawerDetail.title)
            : boardShortTaskId(state.drawerTaskId);
        }
        if (state.drawerLoading) {
          taskDrawerContentEl.innerHTML = '<div class="loading">Loading task context...</div>';
          return;
        }
        const detail = asObject(state.drawerDetail);
        const events = Array.isArray(detail.recentEvents) ? detail.recentEvents.slice(-16).reverse() : [];
        taskDrawerContentEl.innerHTML = [
          '<div class="task-drawer-grid">',
          '<div class="task-drawer-meta"><strong>Task</strong><div class="muted">' + escapeHtml(String(detail.taskId || state.drawerTaskId)) + "</div></div>",
          '<div class="task-drawer-meta"><strong>Status</strong><div class="muted">' + escapeHtml(String(detail.status || "unknown")) + "</div></div>",
          '<div class="task-drawer-meta"><strong>Current Agent</strong><div class="muted">' + escapeHtml(String(detail.currentAgent || "[none]")) + "</div></div>",
          '<div class="task-drawer-meta"><strong>Updated</strong><div class="muted">' + escapeHtml(fmtDateTime(detail.updatedAt || "")) + "</div></div>",
          '<div class="actions"><button type="button" class="btn approve" data-open-task="' + escapeHtml(String(detail.taskId || state.drawerTaskId)) + '">Open Full Detail</button>',
          '<button type="button" class="btn" data-open-review>Open Review Queue</button></div>',
          events.length
            ? '<pre class="event-raw">' + escapeHtml(events.join("\n")) + "</pre>"
            : '<div class="empty">No logs available for this task.</div>',
          "</div>",
        ].join("");
      }

      async function openTaskDrawer(taskId, contextLabel) {
        const normalizedTaskId = String(taskId || "").trim();
        if (!normalizedTaskId) return;
        state.drawerOpen = true;
        state.drawerTaskId = normalizedTaskId;
        state.drawerContextLabel = String(contextLabel || "Agent Logs");
        state.drawerLoading = true;
        state.drawerDetail = null;
        renderTaskDrawer();
        updateHeaderMeta();
        syncUrlState();
        try {
          const detail = await api("/api/tasks/" + encodeURIComponent(normalizedTaskId));
          state.drawerDetail = detail;
        } catch (error) {
          state.drawerDetail = {
            taskId: normalizedTaskId,
            title: "Task context unavailable",
            status: "unknown",
            currentAgent: "[none]",
            recentEvents: [
              error instanceof Error ? error.message : "Unable to load task details.",
            ],
            updatedAt: "",
          };
        } finally {
          state.drawerLoading = false;
          renderTaskDrawer();
        }
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

      function overviewStatusTone(status) {
        const normalized = String(status || "").toLowerCase();
        if (normalized === "done") return "done";
        if (normalized === "waiting_human") return "waiting";
        if (normalized === "failed" || normalized === "blocked" || normalized === "archived") return "failed";
        if (normalized === "in_progress" || normalized === "waiting_agent" || normalized === "new") return "active";
        return "neutral";
      }

      function overviewStatIcon(kind) {
        const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
        if (kind === "total") return '<svg ' + common + '><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg>';
        if (kind === "done") return '<svg ' + common + '><circle cx="12" cy="12" r="8" /><path d="m8.8 12.2 2.2 2.2 4.4-4.4" /></svg>';
        if (kind === "agents") return '<svg ' + common + '><circle cx="8" cy="9" r="2.6" /><circle cx="16" cy="8" r="2.2" /><path d="M4.3 18a3.7 3.7 0 0 1 7.4 0" /><path d="M13.2 18a3.2 3.2 0 0 1 6.4 0" /></svg>';
        if (kind === "review") return '<svg ' + common + '><path d="M4 12h7" /><path d="m9 7 5 5-5 5" /><rect x="14" y="4" width="7" height="16" rx="2" /></svg>';
        if (kind === "failed") return '<svg ' + common + '><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6" /><path d="m15 9-6 6" /></svg>';
        return '<svg ' + common + '><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19V3" /></svg>';
      }

      function renderStatCard(config) {
        const valueTone = config && config.valueTone ? String(config.valueTone) : "working";
        const waitingHot = config && config.waitingHot ? " waiting-hot" : "";
        const value = config && config.value != null ? String(config.value) : "0";
        const subtitleRaw = config && config.subtitle ? String(config.subtitle) : "";
        const subtitle = subtitleRaw ? '<div class="stat-sub">' + escapeHtml(subtitleRaw) + "</div>" : "";
        const view = config && config.view ? String(config.view) : "tasks";
        const statFilter = config && config.statFilter ? String(config.statFilter) : "";
        const icon = config && config.icon ? String(config.icon) : "total";
        const label = config && config.label ? String(config.label) : "Metric";
        return [
          '<article class="stat-card' + waitingHot + '">',
          '<div class="stat-head">',
          '<div class="stat-label">' + escapeHtml(label) + "</div>",
          '<span class="stat-icon" aria-hidden="true">' + overviewStatIcon(icon) + "</span>",
          "</div>",
          "<div>",
          '<p class="stat-value ' + valueTone + '">' + escapeHtml(value) + "</p>",
          subtitle,
          "</div>",
          '<button type="button" class="stat-link" data-stat-view="' + escapeHtml(view) + '"' + (statFilter ? ' data-stat-filter="' + escapeHtml(statFilter) + '"' : "") + '>Details</button>',
          "</article>",
        ].join("");
      }

      function renderOverviewSkeleton() {
        if (!contentEl) return;
        contentEl.setAttribute("aria-busy", "true");
        const statsSkeleton = Array.from({ length: 6 }, () => '<div class="skeleton-block skeleton-stat"></div>').join("");
        const recentRows = Array.from({ length: 6 }, () => '<div class="skeleton-line skeleton-row"></div>').join("");
        contentEl.innerHTML = [
          '<div id="overview-root" class="overview-root overview-skeleton">',
          '<section class="hero-card skeleton-block">',
          '<div class="skeleton-line lg"></div>',
          '<div class="skeleton-line md"></div>',
          '<div class="skeleton-pill"></div>',
          "</section>",
          '<section class="skeleton-grid">' + statsSkeleton + "</section>",
          '<section class="recent-card skeleton-recent">',
          '<div class="skeleton-line lg" style="width:35%;"></div>',
          recentRows,
          "</section>",
          "</div>",
        ].join("");
      }

      function buildOverviewContext(runtime, activeAgents, waitingHuman) {
        const runtimeLabel = runtime && runtime.isAlive ? "Runtime online." : "Runtime offline.";
        const agentsCount = Math.max(0, Number(activeAgents || 0));
        const waitingCount = Math.max(0, Number(waitingHuman || 0));
        const agentsLabel = agentsCount + " active agent" + (agentsCount === 1 ? "" : "s");
        const waitingLabel = waitingCount + " task" + (waitingCount === 1 ? "" : "s") + " waiting for approval";
        return runtimeLabel + " " + agentsLabel + ", " + waitingLabel + ".";
      }

      function normalizeDateValue(value) {
        const raw = String(value || "").trim();
        if (!raw) return 0;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? ts : 0;
      }

      function computeActiveAgentCount(tasks, runtime) {
        const runtimeWorkers = Number(runtime && runtime.workerCount || 0);
        if (runtimeWorkers > 0) return runtimeWorkers;
        const activeStatuses = new Set(["in_progress", "waiting_agent", "waiting_human"]);
        const activeAgents = new Set();
        for (const task of tasks) {
          const status = String(task && task.status || "");
          if (!activeStatuses.has(status)) continue;
          const currentAgent = String(task && task.currentAgent || "").trim();
          if (currentAgent) activeAgents.add(currentAgent);
        }
        return activeAgents.size;
      }

      function renderRecentTaskRows(tasks) {
        if (!tasks.length) {
          return '<div class="empty">No task activity yet. Start by creating a new task in the command console.</div>';
        }
        return tasks.map((task) => {
          const statusTone = overviewStatusTone(task.status);
          const owner = String(task.currentAgent || task.nextAgent || "system");
          const project = String(task.project || "General");
          const subtitle = owner + " • " + project;
          return [
            '<button type="button" class="recent-item" data-open-task="' + escapeHtml(task.taskId) + '">',
            '<span class="status-dot ' + statusTone + '" aria-hidden="true"></span>',
            '<div class="recent-copy">',
            '<p class="recent-title">' + escapeHtml(task.title || task.taskId) + "</p>",
            '<p class="recent-sub">' + escapeHtml(subtitle) + "</p>",
            "</div>",
            '<span class="recent-time">' + escapeHtml(fmtRelativeTime(task.updatedAt || task.createdAt || "")) + "</span>",
            "</button>",
          ].join("");
        }).join("");
      }

      function overviewHeroArt() {
        return [
          '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
          '<circle cx="60" cy="62" r="19"></circle>',
          '<circle cx="51" cy="58" r="2.2"></circle>',
          '<circle cx="69" cy="58" r="2.2"></circle>',
          '<path d="M42 60h-9l-7-7"></path>',
          '<path d="M78 60h9l7-7"></path>',
          '<path d="M41 72 27 78"></path>',
          '<path d="M79 72 93 78"></path>',
          '<path d="M50 79 44 91"></path>',
          '<path d="M70 79 76 91"></path>',
          '<path d="M47 41 38 34"></path>',
          '<path d="M73 41 82 34"></path>',
          '</svg>',
        ].join("");
      }

      function reviewEvidenceSnippet(task) {
        const stage = String(task.currentStage || "").toLowerCase();
        const title = String(task.title || "task");
        if (stage.includes("qa")) return "QA concluído para " + title + ". Validar evidências e aprovar rollout.";
        if (stage.includes("research")) return "Pesquisa finalizada para " + title + ". Confirmar fontes e consistência.";
        if (stage.includes("front") || stage.includes("back") || stage.includes("mobile")) return "Código gerado para " + title + ". Revisar diffs e riscos.";
        if (stage.includes("review")) return "Saída pronta para decisão humana em " + title + ".";
        return "Entrega pronta para revisão humana. Confirme qualidade e aderência ao escopo.";
      }

      function detectArtifactLanguage(name, content) {
        const file = String(name || "").toLowerCase();
        const text = String(content || "");
        if (file.endsWith(".json")) return "json";
        if (file.endsWith(".md")) return "markdown";
        if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx")) return "typescript";
        if (file.endsWith(".py")) return "python";
        if (file.endsWith(".yml") || file.endsWith(".yaml")) return "yaml";
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) return "json";
        return "text";
      }

      function highlightArtifactContent(content, language) {
        const escaped = escapeHtml(String(content || ""));
        if (!escaped) return "";
        let highlighted = escaped;
        if (language === "json") {
          highlighted = highlighted
            .replace(/(&quot;[^&]*&quot;)(\s*:)/g, '<span class="code-line-key">$1</span>$2')
            .replace(/(:\s*)(&quot;[^&]*&quot;)/g, '$1<span class="code-line-string">$2</span>')
            .replace(/(:\s*)(-?\d+(\.\d+)?)/g, '$1<span class="code-line-number">$2</span>');
        } else if (language === "typescript" || language === "python") {
          highlighted = highlighted
            .replace(/\b(const|let|var|function|return|if|else|for|while|class|async|await|import|from|export|try|catch|raise|def)\b/g, '<span class="code-line-keyword">$1</span>')
            .replace(/(&quot;[^&]*&quot;|&#039;[^&]*&#039;)/g, '<span class="code-line-string">$1</span>')
            .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="code-line-number">$1</span>');
        }
        return highlighted;
      }

      function renderArtifactPane(title, artifact) {
        const safe = artifact && typeof artifact === "object" ? artifact : {};
        const name = String(safe.name || title || "artifact.txt");
        const content = String(safe.content || "No artifact content available.");
        const language = detectArtifactLanguage(name, content);
        return [
          '<article class="artifact-pane">',
          '<div class="artifact-head"><strong>' + escapeHtml(title) + "</strong><span class=\"artifact-lang\">" + escapeHtml(language) + "</span></div>",
          '<pre class="artifact-code"><code>' + highlightArtifactContent(content, language) + "</code></pre>",
          "</article>",
        ].join("");
      }

      async function fetchTaskArtifact(taskId, scope, name) {
        if (!taskId || !scope || !name) return null;
        try {
          return await api("/api/tasks/" + encodeURIComponent(taskId) + "/artifact?scope=" + encodeURIComponent(scope) + "&name=" + encodeURIComponent(name));
        } catch {
          return null;
        }
      }

      async function resolveDecisionArtifacts(detail) {
        const taskId = String(detail.taskId || "");
        const safeViews = Array.isArray(detail.views) ? detail.views : [];
        const safeArtifacts = Array.isArray(detail.artifacts) ? detail.artifacts : [];
        const safeDone = Array.isArray(detail.doneArtifacts) ? detail.doneArtifacts : [];
        const safeHuman = Array.isArray(detail.humanArtifacts) ? detail.humanArtifacts : [];

        const inputCandidate = safeViews[0]
          ? { scope: "views", name: safeViews[0] }
          : safeArtifacts[0]
          ? { scope: "artifacts", name: safeArtifacts[0] }
          : null;
        const outputCandidate = safeDone[0]
          ? { scope: "done", name: safeDone[0] }
          : safeHuman[0]
          ? { scope: "human", name: safeHuman[0] }
          : safeArtifacts[1]
          ? { scope: "artifacts", name: safeArtifacts[1] }
          : safeArtifacts[0]
          ? { scope: "artifacts", name: safeArtifacts[0] }
          : null;

        const [inputArtifact, outputArtifact] = await Promise.all([
          inputCandidate ? fetchTaskArtifact(taskId, inputCandidate.scope, inputCandidate.name) : Promise.resolve(null),
          outputCandidate ? fetchTaskArtifact(taskId, outputCandidate.scope, outputCandidate.name) : Promise.resolve(null),
        ]);

        return {
          input: inputArtifact || {
            name: inputCandidate ? inputCandidate.name : "input.txt",
            content: String(detail.title || ""),
          },
          output: outputArtifact || {
            name: outputCandidate ? outputCandidate.name : "output.txt",
            content: (detail.recentEvents || []).slice(-8).join("\n"),
          },
        };
      }

      function renderDecisionTimelineRows(history) {
        const rows = Array.isArray(history) ? history.slice().reverse().slice(0, 8) : [];
        if (!rows.length) return '<div class="empty">No timeline yet.</div>';
        return '<div class="decision-list">' + rows.map((row) => [
          '<article class="item">',
          "<strong>" + escapeHtml(String(row.stage || "stage")) + "</strong>",
          '<div class="meta">' + escapeHtml(String(row.agent || "agent")) + " • " + escapeHtml(fmtRelativeTime(row.endedAt || row.startedAt || "")) + "</div>",
          "</article>",
        ].join("")).join("") + "</div>";
      }

      function renderDecisionHistoryRows(detail) {
        const events = Array.isArray(detail.recentEvents) ? detail.recentEvents : [];
        const rows = events
          .filter((line) => /approve|reprove|rollback|decision|human/i.test(String(line)))
          .slice(-6)
          .reverse();
        if (!rows.length) return '<div class="empty">No human decisions recorded yet.</div>';
        return '<div class="decision-history">' + rows.map((line) => {
          const text = String(line || "");
          const title = text.split("|")[0] || text;
          const reason = text.includes("Reason:") ? text.split("Reason:")[1] : "";
          return [
            '<article class="row">',
            '<div class="title">' + escapeHtml(title.trim()) + "</div>",
            '<div class="reason">' + escapeHtml((reason || text).trim()) + "</div>",
            "</article>",
          ].join("");
        }).join("") + "</div>";
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
        const [overview, metrics, tasks] = await Promise.all([
          api("/api/overview"),
          api("/api/metrics/overview?hours=24"),
          api("/api/tasks"),
        ]);
        applyOverviewSnapshot(overview);

        const topSlowStage = metrics.stageSummary && metrics.stageSummary[0] ? metrics.stageSummary[0] : null;
        const runtime = overview.runtime || {};
        const taskRows = Array.isArray(tasks) ? tasks : [];
        const recentTasks = taskRows
          .slice()
          .sort((a, b) => normalizeDateValue(b.updatedAt || b.createdAt) - normalizeDateValue(a.updatedAt || a.createdAt))
          .slice(0, 8);
        const activeAgentCount = computeActiveAgentCount(taskRows, runtime);
        const counts = overview.counts || {};
        const consumption = overview.consumption || {};

        const overviewKey = [
          Number(counts.total || 0),
          Number(counts.done || 0),
          Number(counts.waitingHuman || 0),
          Number(counts.failed || 0),
          Number(counts.active || 0),
          Number(overview.reviewQueueCount || 0),
          Number(consumption.estimatedTotalTokens || 0),
          Number(consumption.estimatedCostUsd || 0),
          String(runtime.lastHeartbeatAt || ""),
          String(topSlowStage && topSlowStage.stage || ""),
          activeAgentCount,
          recentTasks.map((task) => [task.taskId, task.status, task.updatedAt, task.currentAgent].join(":")).join(","),
        ].join("|");
        if (state.overviewRenderedKey === overviewKey && document.getElementById("overview-root")) return;

        const contextLine = buildOverviewContext(runtime, activeAgentCount, counts.waitingHuman);
        const statCards = [
          {
            label: "Total Tasks",
            value: fmtNumber(counts.total),
            subtitle: "Current runtime cycle",
            valueTone: "working",
            icon: "total",
            view: "tasks",
          },
          {
            label: "Completed",
            value: fmtNumber(counts.done),
            subtitle: "Approved and done",
            valueTone: "online",
            icon: "done",
            view: "tasks",
          },
          {
            label: "Active Agents",
            value: fmtNumber(activeAgentCount),
            subtitle: "Workers processing now",
            valueTone: "working",
            icon: "agents",
            view: "tasks",
          },
          {
            label: "Waiting Human",
            value: fmtNumber(counts.waitingHuman),
            subtitle: Number(counts.waitingHuman || 0) > 0 ? "Human action required" : "Queue empty",
            valueTone: Number(counts.waitingHuman || 0) > 0 ? "attention" : "review",
            icon: "review",
            view: "board",
            statFilter: "status:waiting_human",
            waitingHot: Number(counts.waitingHuman || 0) > 0,
          },
          {
            label: "Failed / Blocked",
            value: fmtNumber(counts.failed),
            subtitle: "Needs intervention",
            valueTone: Number(counts.failed || 0) > 0 ? "error" : "working",
            icon: "failed",
            view: "board",
            statFilter: "status:blocked",
          },
          {
            label: "Token / Cost",
            value: fmtCost(consumption.estimatedCostUsd),
            subtitle: fmtNumber(consumption.estimatedTotalTokens) + " tokens",
            valueTone: "working",
            icon: "cost",
            view: "analytics",
          },
        ];

        contentEl.innerHTML = [
          '<div id="overview-root" class="overview-root">',
          '<section class="hero-card">',
          '<div class="hero-content">',
          '<h2 class="hero-title">Welcome to SYNX Control</h2>',
          '<p class="hero-context">' + escapeHtml(contextLine) + "</p>",
          '<div class="hero-meta">',
          '<span class="hero-chip strong">' + (runtime.isAlive ? "Runtime Active" : "Runtime Paused") + "</span>",
          '<span class="hero-chip">Top slow stage: ' + escapeHtml(topSlowStage ? topSlowStage.stage : "N/A") + "</span>",
          '<span class="hero-chip">Heartbeat: ' + escapeHtml(fmtRelativeTime(runtime.lastHeartbeatAt || "")) + "</span>",
          "</div>",
          "</div>",
          '<div class="hero-art" aria-hidden="true">' + overviewHeroArt() + "</div>",
          "</section>",
          '<section class="kpi-grid">' + statCards.map((item) => renderStatCard(item)).join("") + "</section>",
          '<section class="recent-card">',
          '<div class="recent-head"><h3>Recent Tasks</h3><button type="button" class="stat-link" data-stat-view="tasks">View all</button></div>',
          '<div class="recent-list">' + renderRecentTaskRows(recentTasks) + "</div>",
          "</section>",
          "</div>",
        ].join("");
        state.overviewRenderedKey = overviewKey;
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

      function boardKanbanColumnForTask(task) {
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

      function boardShortTaskId(taskId) {
        const raw = String(taskId || "");
        const numbers = raw.match(/\d+/g);
        if (numbers && numbers.length) {
          const numeric = Number(numbers[numbers.length - 1] || 0);
          if (Number.isFinite(numeric) && numeric > 0) {
            return "#TX-" + String(Math.floor(numeric)).padStart(3, "0");
          }
        }
        const compact = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
        return "#" + (compact.slice(-6) || "TASK");
      }

      function boardPriorityMeta(task) {
        const status = String(task.status || "");
        const type = String(task.type || "").toLowerCase();
        if (status === "failed" || status === "blocked" || status === "archived") return { label: "P0", klass: "p0" };
        if (status === "waiting_human") return { label: "P1", klass: "p1" };
        if (type === "bug") return { label: "P1", klass: "p1" };
        if (status === "in_progress") return { label: "P2", klass: "p2" };
        return { label: "P3", klass: "p3" };
      }

      function boardAgentRole(value) {
        const raw = String(value || "").toLowerCase();
        if (!raw) return "generic";
        if (raw.includes("dispatcher")) return "dispatcher";
        if (raw.includes("research")) return "research";
        if (raw.includes("architect") || raw.includes("planner")) return "architect";
        if (raw.includes("qa")) return "qa";
        if (raw.includes("human")) return "human";
        if (raw.includes("failed") || raw.includes("blocked")) return "blocked";
        if (
          raw.includes("coder")
          || raw.includes("engineer")
          || raw.includes("expert")
          || raw.includes("specialist")
          || raw.includes("front")
          || raw.includes("back")
          || raw.includes("mobile")
          || raw.includes("seo")
        ) return "coder";
        return "generic";
      }

      function boardAgentInitials(value, fallback) {
        const base = String(value || "").trim();
        if (!base) return fallback || "AG";
        const parts = base.split(/[\s_-]+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return base.slice(0, 2).toUpperCase();
      }

      function renderAgentAvatar(value, fallback, extraClass) {
        const role = boardAgentRole(value || fallback);
        const initials = boardAgentInitials(value || fallback, role === "human" ? "HU" : "AG");
        const label = String(value || fallback || "agent");
        return '<span class="' + escapeHtml(extraClass || "agent-avatar") + " " + escapeHtml(role) + '" title="' + escapeHtml(label) + '">' + escapeHtml(initials) + "</span>";
      }

      function boardProgressMeta(task, mode) {
        if (mode === "kanban") {
          const column = boardKanbanColumnForTask(task);
          const ordered = ["backlog", "todo", "progress", "review", "done"];
          if (column === "blocked") return { percent: 100, text: "blocked", tone: "blocked" };
          const index = Math.max(0, ordered.indexOf(column));
          const completed = index + 1;
          const total = ordered.length;
          const percent = Math.round((completed / total) * 100);
          const tone = column === "done" ? "done" : (column === "review" ? "review" : "working");
          return { percent, text: completed + "/" + total + " steps", tone };
        }
        const column = boardColumnForTask(task);
        const ordered = ["dispatcher", "research", "architect", "coder", "qa", "human"];
        if (column === "blocked") return { percent: 100, text: "blocked", tone: "blocked" };
        if (column === "done") return { percent: 100, text: ordered.length + "/" + ordered.length + " steps", tone: "done" };
        const index = Math.max(0, ordered.indexOf(column));
        const completed = index + 1;
        const total = ordered.length;
        const percent = Math.round((completed / total) * 100);
        const tone = column === "human" ? "review" : "working";
        return { percent, text: completed + "/" + total + " steps", tone };
      }

      function boardTaskMatchesFilter(task, filterQuery) {
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
        const tokenCount = Number(task && task.consumption && task.consumption.estimatedTotalTokens || 0);
        const status = String(task.status || "").toLowerCase();
        const statusAliases = {
          human_review: "waiting_human",
          review_required: "waiting_human",
        };

        for (const token of tokens) {
          if (token.startsWith("status:")) {
            const rawStatus = token.slice("status:".length);
            const normalized = statusAliases[rawStatus] || rawStatus;
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
          if (fuzzyScore(token, haystack) <= 0) return false;
        }
        return true;
      }

      function renderBoardCard(task, mode, laneId) {
        const stage = String(task.currentStage || "unscoped");
        const currentAgent = String(task.currentAgent || "unassigned");
        const nextAgent = String(task.nextAgent || "n/a");
        const project = String(task.project || "General");
        const type = String(task.type || "Task");
        const tokens = fmtNumber(task.consumption && task.consumption.estimatedTotalTokens);
        const updatedAt = fmtRelativeTime(task.updatedAt);
        const priority = boardPriorityMeta(task);
        const progress = boardProgressMeta(task, mode);
        const shortId = boardShortTaskId(task.taskId);
        const boardStatus = String(task.status || "").toLowerCase();
        const humanFocus = mode === "agent" && laneId === "human" ? " human-focus" : "";
        const chips = [
          taskStatusBadge(task.status),
          '<span class="board-chip strong">' + escapeHtml(project) + "</span>",
          '<span class="board-chip">' + escapeHtml(type) + "</span>",
          '<span class="board-chip">' + escapeHtml(stage) + "</span>",
          '<span class="board-chip">tokens ' + escapeHtml(tokens) + "</span>",
        ];
        if (task.humanApprovalRequired || boardStatus === "waiting_human") {
          chips.push('<span class="board-chip strong">needs review</span>');
        }
        return [
          '<article class="board-card ' + escapeHtml(task.status) + humanFocus + '" data-open-task="' + escapeHtml(task.taskId) + '" role="button" tabindex="0" aria-label="Open task detail for ' + escapeHtml(task.taskId) + '">',
          '<div class="head">',
          '<div class="board-ticket"><span class="id">' + escapeHtml(shortId) + '</span><span class="priority-badge ' + escapeHtml(priority.klass) + '">' + escapeHtml(priority.label) + "</span></div>",
          renderAgentAvatar(currentAgent, "agent", "agent-mini"),
          "</div>",
          '<h4 class="title">' + escapeHtml(task.title || task.taskId) + "</h4>",
          '<div class="chip-row">' + chips.join("") + "</div>",
          '<div class="board-progress"><div class="board-progress-track"><div class="board-progress-fill ' + escapeHtml(progress.tone) + '" style="width:' + String(progress.percent) + '%;"></div></div><div class="board-progress-meta">' + escapeHtml(progress.text) + "</div></div>",
          '<div class="foot"><div class="updated">updated ' + escapeHtml(updatedAt) + '</div><div class="next-owner">' + renderAgentAvatar(nextAgent, "next", "agent-avatar") + '<span>Next ' + escapeHtml(nextAgent) + "</span></div></div>",
          "</article>",
        ].join("");
      }

      function renderBoardColumn(column, cards, mode) {
        const laneClass = mode === "agent" && column.id === "human" ? " agent-human" : "";
        const columnClass = String(column.klass || "") + laneClass;
        const cardHtml = cards.length
          ? cards.map((task) => renderBoardCard(task, mode, column.id)).join("")
          : '<div class="board-empty">No tasks in this lane.</div>';
        return [
          '<section class="board-column ' + escapeHtml(columnClass.trim()) + '">',
          '<div class="board-column-head"><h3>' + escapeHtml(column.title) + '</h3><span class="board-count">' + fmtNumber(cards.length) + "</span></div>",
          '<div class="meta muted">' + escapeHtml(column.hint) + "</div>",
          '<div class="board-stack">',
          cardHtml,
          "</div>",
          "</section>",
        ].join("");
      }

      async function renderBoard() {
        const allTasks = await api("/api/tasks");
        const mode = state.boardMode === "agent" ? "agent" : "kanban";
        const filter = String(state.boardFilter || "").trim().toLowerCase();
        const tasks = filter ? allTasks.filter((task) => boardTaskMatchesFilter(task, filter)) : allTasks;
        const key = mode + "::" + filter + "::" + tasks
          .map((task) => [task.taskId, task.status, task.currentAgent, task.nextAgent, task.currentStage, task.updatedAt].join("|"))
          .join(";");
        if (state.boardRenderedKey === key && document.getElementById("board-root")) return;

        const columns = mode === "agent"
          ? [
            { id: "dispatcher", title: "Dispatcher", hint: "Task routing and orchestration", klass: "" },
            { id: "research", title: "Research", hint: "External discovery and grounding", klass: "" },
            { id: "architect", title: "Architect", hint: "Planning and architecture decisions", klass: "" },
            { id: "coder", title: "Coder", hint: "Implementation by coding specialists", klass: "" },
            { id: "qa", title: "QA", hint: "Validation and retry loops", klass: "" },
            { id: "human", title: "Human Review", hint: "Waiting for approve/reprove", klass: "" },
            { id: "done", title: "Done", hint: "Completed successfully", klass: "" },
            { id: "blocked", title: "Blocked", hint: "Failed or blocked tasks", klass: "" },
          ]
          : [
            { id: "backlog", title: "Backlog", hint: "Newly created requests", klass: "kanban-backlog" },
            { id: "todo", title: "To Do", hint: "Queued for next agent execution", klass: "kanban-todo" },
            { id: "progress", title: "In Progress", hint: "Active implementation / execution", klass: "kanban-progress" },
            { id: "review", title: "In Review", hint: "Waiting for human decision", klass: "kanban-review" },
            { id: "done", title: "Done", hint: "Completed successfully", klass: "kanban-done" },
            { id: "blocked", title: "Blocked", hint: "Failed, blocked or archived", klass: "kanban-blocked" },
          ];

        const byColumn = {};
        for (const column of columns) byColumn[column.id] = [];
        for (const task of tasks) {
          const columnId = mode === "agent" ? boardColumnForTask(task) : boardKanbanColumnForTask(task);
          if (!Array.isArray(byColumn[columnId])) byColumn[columnId] = [];
          byColumn[columnId].push(task);
        }
        for (const column of columns) {
          byColumn[column.id].sort((a, b) => Date.parse(String(b.updatedAt || "")) - Date.parse(String(a.updatedAt || "")));
        }

        contentEl.innerHTML = [
          '<div id="board-root" class="mode-' + escapeHtml(mode) + '">',
          '<div class="toolbar"><div class="muted">Auto-updating board: cards move on each poll and realtime event.</div><div class="board-controls"><div class="board-view-toggle" role="group" aria-label="Board mode"><button type="button" class="board-toggle-btn' + (mode === "kanban" ? " active" : "") + '" data-board-mode="kanban">Kanban</button><button type="button" class="board-toggle-btn' + (mode === "agent" ? " active" : "") + '" data-board-mode="agent">Agent Lanes</button></div><label class="board-filter" for="board-filter"><input id="board-filter" class="field-input" placeholder="Filter by task ID or responsible agent..." value="' + escapeHtml(state.boardFilter || "") + '" /></label><div class="muted">' + fmtNumber(tasks.length) + " of " + fmtNumber(allTasks.length) + " tasks</div></div></div>",
          '<div class="board-controls" style="margin-bottom:10px;">',
          '<span class="muted">Quick Filters:</span>',
          '<button type="button" class="btn' + (state.boardFilter === "status:blocked" ? " approve" : "") + '" data-board-preset="blocked">Blocked Tasks</button>',
          '<button type="button" class="btn' + (state.boardFilter === "tokens:high" ? " approve" : "") + '" data-board-preset="consumption">High Consumption</button>',
          '<button type="button" class="btn' + (state.boardFilter === "status:waiting_human" ? " approve" : "") + '" data-board-preset="my-reviews">My Reviews</button>',
          '<button type="button" class="btn" data-board-preset="clear">Clear</button>',
          "</div>",
          '<div class="board-columns">',
          columns.map((column) => renderBoardColumn(column, byColumn[column.id] || [], mode)).join(""),
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
          '<div class="muted" style="margin-bottom:8px;">Review Inbox: only waiting_human tasks. Approve or reprove with explicit feedback.</div>',
          '<textarea id="review-reason" class="field-input" rows="2" placeholder="Reason for reprove (required to reprove)">' + reasonValue + "</textarea>",
          '<div class="quick-reasons">',
          '<button type="button" class="quick-reason" data-quick-reason="Hallucination">Alucinação</button>',
          '<button type="button" class="quick-reason" data-quick-reason="Logic error">Erro de Lógica</button>',
          '<button type="button" class="quick-reason" data-quick-reason="Out of scope">Fora do Escopo</button>',
          "</div>",
          '<div class="actions" style="margin-top:8px;">',
          '<select id="review-rollback" class="field-select">',
          '<option value="none"' + (rollbackValue === "none" ? " selected" : "") + '>Rollback: none</option>',
          '<option value="task"' + (rollbackValue === "task" ? " selected" : "") + '>Rollback: task-scoped</option>',
          "</select>",
          '<div class="muted">Queue size: ' + fmtNumber(queue.length) + "</div>",
          "</div>",
          "</div>",
          queue.map((task) => [
            '<article class="review-card waiting">',
            '<div class="review-card-header">',
            '<div><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title) + "</button><br/><small>" + escapeHtml(task.taskId) + "</small></div>",
            taskStatusBadge(task.status),
            "</div>",
            '<p class="review-evidence">' + escapeHtml(reviewEvidenceSnippet(task)) + "</p>",
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
        const artifacts = await resolveDecisionArtifacts(detail);
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
          artifacts.input && artifacts.input.name ? String(artifacts.input.name) : "",
          artifacts.output && artifacts.output.name ? String(artifacts.output.name) : "",
          state.reviewAlertAt,
        ].join("|");
        if (state.detailRenderedKey === detailKey && document.getElementById("detail-root")) return;
        const canReview = Boolean(detail.humanApprovalRequired) || detail.status === "waiting_human";
        const canCancel = ["new", "in_progress", "waiting_agent"].includes(detail.status);
        const rollbackStepOptions = [
          '<option value="">Rollback step: latest</option>',
          ...(Array.isArray(detail.history) ? detail.history.map((row, index) => {
            const stage = String(row.stage || "stage");
            return '<option value="' + escapeHtml(stage) + '">' + escapeHtml(String(index + 1) + ". " + stage) + "</option>";
          }) : []),
        ].join("");
        const actionPanel = (canReview || canCancel)
          ? [
            '<div class="decision-actions">',
            '<h3>Decision Commands</h3>',
            '<textarea id="action-reason" class="field-input" rows="3" placeholder="Reason (required for reprove, optional for cancel)"></textarea>',
            '<div class="quick-reasons">',
            '<button type="button" class="quick-reason" data-quick-reason="Hallucination">Alucinação</button>',
            '<button type="button" class="quick-reason" data-quick-reason="Logic error">Erro de Lógica</button>',
            '<button type="button" class="quick-reason" data-quick-reason="Out of scope">Fora do Escopo</button>',
            "</div>",
            '<div class="actions" style="margin-top: 8px;">',
            '<select id="action-rollback" class="field-select">',
            '<option value="none">Rollback: none</option>',
            '<option value="task">Rollback: task-scoped</option>',
            '</select>',
            '<select id="action-rollback-step" class="field-select">' + rollbackStepOptions + "</select>",
            "</div>",
            canReview ? '<button type="button" class="btn approve" data-task-action="approve" data-task-id="' + escapeHtml(detail.taskId) + '" title="Ctrl/Cmd + Enter">Approve</button>' : "",
            canReview ? '<button type="button" class="btn reprove" data-task-action="reprove" data-task-id="' + escapeHtml(detail.taskId) + '">Reprove</button>' : "",
            canCancel ? '<button type="button" class="btn cancel" data-task-action="cancel" data-task-id="' + escapeHtml(detail.taskId) + '">Cancel Task</button>' : "",
            '<div class="muted">Shortcut: Ctrl/Cmd + Enter approve • Esc closes review</div>',
            "</div>",
            '<h4>Decision History</h4>',
            renderDecisionHistoryRows(detail),
            "<h4>Artifacts</h4>",
            '<p class="muted">Views: ' + escapeHtml((detail.views || []).join(", ") || "[none]") + '</p>',
            '<p class="muted">Done: ' + escapeHtml((detail.doneArtifacts || []).join(", ") || "[none]") + '</p>',
            '<p class="muted">Human: ' + escapeHtml((detail.humanArtifacts || []).join(", ") || "[none]") + '</p>',
            '<p class="muted">Status: ' + escapeHtml(detail.status) + "</p>",
          ].join("")
          : [
            '<div class="decision-actions">',
            '<h3>Decision Commands</h3>',
            '<div class="empty">No manual action available for this task status.</div>',
            '<h4>Decision History</h4>',
            renderDecisionHistoryRows(detail),
            "</div>",
          ].join("");
        const reviewSignal = state.reviewAlertAt
          ? '<p class="review-alert">Attention: new task entered waiting_human at ' + escapeHtml(state.reviewAlertAt) + "</p>"
          : "";
        const historyRows = renderDecisionTimelineRows(detail.history);
        const currentAgentLabel = String(detail.currentAgent || "[none]");
        const senderAgent = currentAgentLabel && currentAgentLabel !== "[none]"
          ? currentAgentLabel
          : String((detail.history && detail.history.length ? detail.history[detail.history.length - 1].agent : "") || "[none]");
        contentEl.innerHTML = [
          '<div id="detail-root">',
          '<div class="toolbar"><div><strong>' + escapeHtml(detail.title) + '</strong><div class="muted">' + escapeHtml(detail.taskId) + "</div></div>" + taskStatusBadge(detail.status) + "</div>",
          reviewSignal,
          '<div class="decision-station">',
          '<aside class="decision-pane">',
          "<h3>Context</h3>",
          '<div class="decision-list">',
          '<article class="item"><strong>ID</strong><div class="meta">' + escapeHtml(detail.taskId) + "</div></article>",
          '<article class="item"><strong>Sent by</strong><div class="meta">' + escapeHtml(senderAgent) + "</div></article>",
          '<article class="item"><strong>Current stage</strong><div class="meta">' + escapeHtml(detail.currentStage || "[none]") + "</div></article>",
          '<article class="item"><strong>Updated</strong><div class="meta">' + escapeHtml(fmtDateTime(detail.updatedAt)) + "</div></article>",
          "</div>",
          "<h4>Timeline</h4>",
          historyRows,
          "</aside>",
          '<section class="decision-pane review-panel">',
          "<h3>Review Panel</h3>",
          '<div class="review-compare">',
          renderArtifactPane("Input Original", artifacts.input),
          renderArtifactPane("Output da IA", artifacts.output),
          "</div>",
          '<h4>Recent Events</h4>',
          eventLines.length ? "<pre>" + escapeHtml(eventLines.slice(-20).join("\n")) + "</pre>" : '<div class="empty">No events logged yet.</div>',
          "</section>",
          '<aside class="decision-pane">',
          actionPanel,
          "</aside>",
          "</div>",
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
        if (!alreadyRendered && mode !== "poll") {
          if (state.view === "overview") renderOverviewSkeleton();
          else if (loadingMessage) showLoading(loadingMessage);
        }
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
        const allItems = state.liveEvents.map((event, index) => buildStreamItem(event, index));
        const filtered = allItems.filter((item) => streamFilterMatches(item, state.liveFilter));
        const pinned = filtered.filter((item) => item.pin);
        const regular = filtered.filter((item) => !item.pin);
        const virtualEnabled = regular.length > 500;
        const estimatedItemHeight = 154;
        const viewportHeight = Math.max(420, Number(state.liveViewportHeight || 680));
        const virtualCount = virtualEnabled
          ? Math.ceil(viewportHeight / estimatedItemHeight) + 16
          : regular.length;
        const virtualStart = virtualEnabled
          ? (state.liveAutoScroll
            ? Math.max(0, regular.length - virtualCount)
            : Math.max(0, Math.floor(Number(state.liveScrollTop || 0) / estimatedItemHeight) - 6))
          : 0;
        const virtualEnd = virtualEnabled
          ? Math.min(regular.length, virtualStart + virtualCount)
          : regular.length;
        const visible = regular.slice(virtualStart, virtualEnd);
        const topSpacer = virtualEnabled ? virtualStart * estimatedItemHeight : 0;
        const bottomSpacer = virtualEnabled ? Math.max(0, (regular.length - virtualEnd) * estimatedItemHeight) : 0;
        const latestKey = allItems.length ? allItems[allItems.length - 1].key : "";
        const liveKey = [
          latestKey,
          String(allItems.length),
          String(filtered.length),
          String(pinned.length),
          String(virtualStart),
          String(virtualEnd),
          String(state.liveFilter || "all"),
          String(state.realtimeConnected),
          String(state.liveExpandedLogKey || ""),
        ].join("|");
        if (state.liveRenderedKey === liveKey && document.getElementById("live-root")) return;

        function renderStreamCard(item, forcedClass) {
          const tone = item.tone === "alert" ? "alert" : item.tone;
          const classes = ["event-card", tone];
          if (item.pin || forcedClass === "pinned") classes.push("pinned");
          if (item.alert) classes.push("alert");
          const ageMs = Date.now() - new Date(item.at || 0).getTime();
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 8_000) classes.push("fresh");
          const taskTag = item.taskId
            ? '<span class="event-tag"><strong>Task</strong><button type="button" class="link" data-open-task="' + escapeHtml(item.taskId) + '">' + escapeHtml(item.taskId) + "</button></span>"
            : '<span class="event-tag"><strong>Task</strong>n/a</span>';
          const agentTag = '<span class="event-tag"><strong>Agent</strong>' + escapeHtml(item.agent || "system") + "</span>";
          const typeTag = '<span class="event-tag"><strong>Type</strong>' + escapeHtml(item.rawEvent || "event") + "</span>";
          const expanded = state.liveExpandedLogKey === item.key;
          const logButton = item.alert
            ? '<button type="button" class="btn cancel" data-live-view-logs="' + escapeHtml(item.key) + '">View Logs</button>'
            : "";
          const alertAction = item.taskId && item.pin
            ? '<button type="button" class="btn approve" data-open-review>Open Review Queue</button>'
            : "";
          const rawPayload = JSON.stringify(item.payloadObj, null, 2);
          const rawLogs = expanded
            ? '<pre class="event-raw">' + escapeHtml(rawPayload || "{}") + "</pre>"
            : "";
          return [
            '<article class="' + escapeHtml(classes.join(" ")) + '"' + (item.taskId ? ' data-open-task-drawer="' + escapeHtml(item.taskId) + '" data-drawer-context="Agent Logs"' : "") + (item.taskId ? ' role="button" tabindex="0"' : "") + '>',
            '<div class="head">',
            '<div class="title-wrap"><span class="event-icon" aria-hidden="true">' + renderEventIcon(item.iconKey) + "</span><div><div class=\"title\">" + escapeHtml(item.title) + "</div><span class=\"pill " + escapeHtml(tone === "alert" ? "alert" : tone) + "\">" + escapeHtml(item.group) + "</span></div></div>",
            '<div class="time">' + escapeHtml(fmtRelativeTime(item.at)) + "</div>",
            "</div>",
            '<div class="summary">' + escapeHtml(item.summary) + "</div>",
            '<div class="event-meta">' + taskTag + agentTag + typeTag + "</div>",
            item.alert || item.pin ? '<div class="event-alert-actions">' + logButton + alertAction + "</div>" : "",
            rawLogs,
            "</article>",
          ].join("");
        }

        const controls = [
          '<div class="actions" style="margin-bottom:10px;">',
          '<button type="button" class="btn" data-runtime-action="pause">Pause Engine</button>',
          '<button type="button" class="btn approve" data-runtime-action="resume">Resume Engine</button>',
          '<button type="button" class="btn cancel" data-runtime-action="stop">Graceful Stop</button>',
          "</div>",
        ].join("");
        if (!filtered.length) {
          contentEl.innerHTML = '<div id="live-root" class="live-stream">' + controls + '<div class="empty">No events for this filter yet. Waiting realtime events from <code>/api/stream</code>...</div></div>';
          state.liveRenderedCount = 0;
          state.liveRenderedConnected = state.realtimeConnected;
          state.liveRenderedKey = liveKey;
          return;
        }
        contentEl.innerHTML = [
          '<div id="live-root" class="live-stream">',
          '<div class="toolbar"><div class="muted">Realtime: ' + (state.realtimeConnected ? "connected" : "disconnected") + ' • events ' + fmtNumber(filtered.length) + (virtualEnabled ? " (virtual list enabled)" : "") + '</div></div>',
          '<div class="live-filters" role="group" aria-label="Live stream filters">',
          '<button type="button" class="btn' + (state.liveFilter === "all" ? " active" : "") + '" data-live-filter="all">All Events</button>',
          '<button type="button" class="btn' + (state.liveFilter === "tasks" ? " active" : "") + '" data-live-filter="tasks">Tasks Only</button>',
          '<button type="button" class="btn' + (state.liveFilter === "runtime" ? " active" : "") + '" data-live-filter="runtime">Runtime</button>',
          '<button type="button" class="btn' + (state.liveFilter === "human" ? " active" : "") + '" data-live-filter="human">Human Decisions</button>',
          '<button type="button" class="btn' + (state.liveFilter === "alerts" ? " active" : "") + '" data-live-filter="alerts">Alerts</button>',
          "</div>",
          controls,
          pinned.length
            ? '<section class="event-pins"><div class="event-pins-label">Pinned Intervention</div>' + pinned.map((item) => renderStreamCard(item, "pinned")).join("") + "</section>"
            : "",
          '<div id="live-scroll" class="event-feed' + (virtualEnabled ? " virtual" : "") + '">',
          virtualEnabled ? '<div class="event-spacer" style="height:' + String(topSpacer) + 'px;"></div>' : "",
          visible.map((item) => renderStreamCard(item, "")).join(""),
          virtualEnabled ? '<div class="event-spacer" style="height:' + String(bottomSpacer) + 'px;"></div>' : "",
          "</div>",
          "</div>",
        ].join("");
        const liveScrollEl = document.getElementById("live-scroll");
        if (liveScrollEl instanceof HTMLElement) {
          state.liveViewportHeight = liveScrollEl.clientHeight || state.liveViewportHeight;
          if (state.liveAutoScroll) {
            liveScrollEl.scrollTop = liveScrollEl.scrollHeight;
            state.liveScrollTop = liveScrollEl.scrollTop;
          }
        }
        state.liveRenderedCount = filtered.length;
        state.liveRenderedConnected = state.realtimeConnected;
        state.liveRenderedKey = liveKey;
      }

      function resolveAnalyticsWindow() {
        const preset = state.analyticsPreset === "24h" || state.analyticsPreset === "7d" || state.analyticsPreset === "30d" || state.analyticsPreset === "custom"
          ? state.analyticsPreset
          : "30d";
        if (preset === "24h") {
          return {
            preset,
            days: 1,
            label: "Last 24h",
            query: "days=1",
          };
        }
        if (preset === "7d") {
          return {
            preset,
            days: 7,
            label: "Last 7 days",
            query: "days=7",
          };
        }
        if (preset === "custom" && state.analyticsCustomFrom && state.analyticsCustomTo) {
          const fromIso = state.analyticsCustomFrom + "T00:00:00.000Z";
          const toIso = state.analyticsCustomTo + "T23:59:59.999Z";
          const fromMs = Date.parse(fromIso);
          const toMs = Date.parse(toIso);
          if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs >= fromMs) {
            const days = Math.max(1, Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1);
            return {
              preset,
              days,
              label: state.analyticsCustomFrom + " to " + state.analyticsCustomTo,
              query: "from=" + encodeURIComponent(fromIso) + "&to=" + encodeURIComponent(toIso),
            };
          }
        }
        return {
          preset: "30d",
          days: 30,
          label: "Last 30 days",
          query: "days=30",
        };
      }

      function renderDeltaText(deltaPct, inverse) {
        if (deltaPct == null || !Number.isFinite(deltaPct)) return '<span class="muted">n/a vs previous period</span>';
        const delta = Number(deltaPct);
        const sign = delta > 0 ? "+" : "";
        const positiveIsGood = inverse ? delta < 0 : delta > 0;
        const tone = positiveIsGood ? "online" : (delta === 0 ? "working" : "error");
        return '<span class="stat-value ' + tone + '" style="font-size:0.8rem;">' + sign + delta.toFixed(1) + '%</span><span class="muted"> vs previous period</span>';
      }

      function renderTokenCostChartWrapper(points, rangeLabel) {
        const rows = Array.isArray(points) ? points : [];
        if (!rows.length) return '<div class="empty">No trend points for selected range.</div>';
        const width = 760;
        const height = 240;
        const padX = 36;
        const padY = 26;
        const usableWidth = width - padX * 2;
        const usableHeight = height - padY * 2;
        const stepX = rows.length > 1 ? usableWidth / (rows.length - 1) : 0;
        const tokenValues = rows.map((row) => Number(row.estimatedTotalTokens || 0));
        const costValues = rows.map((row) => Number(row.estimatedCostUsd || 0));
        const maxTokens = Math.max(...tokenValues, 1);
        const maxCost = Math.max(...costValues, 1);
        const tokenPoints = rows.map((row, index) => {
          const x = padX + stepX * index;
          const y = height - padY - ((Number(row.estimatedTotalTokens || 0) / maxTokens) * usableHeight);
          return { x, y };
        });
        const costPoints = rows.map((row, index) => {
          const x = padX + stepX * index;
          const y = height - padY - ((Number(row.estimatedCostUsd || 0) / maxCost) * usableHeight);
          return { x, y };
        });
        const tokenPolyline = tokenPoints.map((point) => point.x.toFixed(2) + "," + point.y.toFixed(2)).join(" ");
        const costPolyline = costPoints.map((point) => point.x.toFixed(2) + "," + point.y.toFixed(2)).join(" ");
        const lastTokenPoint = tokenPoints[tokenPoints.length - 1];
        const areaPoints = padX + "," + (height - padY) + " " + tokenPolyline + " " + lastTokenPoint.x.toFixed(2) + "," + (height - padY);
        return [
          '<div class="chart-card">',
          '<div class="toolbar" style="margin-bottom:8px;"><div><strong>Token vs Cost Trend</strong><div class="muted">' + escapeHtml(rangeLabel) + "</div></div><div class=\"muted\">Dual axis trend</div></div>",
          '<svg class="chart" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Token and cost trend">',
          '<line x1="' + padX + '" y1="' + (height - padY) + '" x2="' + (width - padX) + '" y2="' + (height - padY) + '" stroke="var(--border)" stroke-width="1" />',
          '<polygon points="' + areaPoints + '" fill="rgba(84, 124, 255, 0.16)" />',
          '<polyline points="' + tokenPolyline + '" fill="none" stroke="#5f8dff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />',
          '<polyline points="' + costPolyline + '" fill="none" stroke="#8f7ef0" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />',
          "</svg>",
          '<div class="chart-legend"><span>Tokens (blue area/line)</span><span>Cost (purple line)</span></div>',
          "</div>",
        ].join("");
      }

      function renderAgentBreakdownChart(rows) {
        const data = Array.isArray(rows) ? rows.slice(0, 8) : [];
        if (!data.length) return '<div class="empty">No agent cost data in selected range.</div>';
        const maxCost = Math.max(...data.map((row) => Number(row.estimatedCostUsd || 0)), 1);
        return '<div class="panel-block">' + data.map((row) => {
          const widthPct = Math.max(4, Math.round((Number(row.estimatedCostUsd || 0) / maxCost) * 100));
          return [
            '<div style="display:grid; gap:4px; margin-bottom:10px;">',
            '<div style="display:flex; justify-content:space-between; gap:8px;"><strong>' + escapeHtml(String(row.agent || "Unknown")) + "</strong><span class=\"muted\">" + escapeHtml(fmtCost(row.estimatedCostUsd)) + " • " + escapeHtml(fmtNumber(row.estimatedTotalTokens)) + " tokens</span></div>",
            '<div style="height:8px; border-radius:999px; background:color-mix(in srgb, var(--surface-soft) 90%, transparent); overflow:hidden;"><span style="display:block; height:100%; width:' + String(widthPct) + '%; border-radius:inherit; background:linear-gradient(90deg, #5078f2 0%, #8f7ef0 100%);"></span></div>',
            "</div>",
          ].join("");
        }).join("") + "</div>";
      }

      function buildAnalyticsExportPayload() {
        const payload = state.analyticsOperationalReport;
        if (!payload) return null;
        return {
          exportedAt: new Date().toISOString(),
          range: payload.window,
          operational: payload.operational,
          advanced: payload.advanced,
        };
      }

      function exportAnalyticsData(format) {
        const payload = buildAnalyticsExportPayload();
        if (!payload) {
          setFeedback("No analytics payload available to export yet.", "error");
          return;
        }
        const normalized = format === "csv" ? "csv" : "json";
        let content = "";
        let fileName = "synx-analytics-" + Date.now() + "." + normalized;
        let mimeType = "application/json";
        if (normalized === "json") {
          content = JSON.stringify(payload, null, 2);
          mimeType = "application/json";
        } else {
          const rows = Array.isArray(payload.operational && payload.operational.trend) ? payload.operational.trend : [];
          const header = ["bucketStart", "label", "taskCount", "estimatedTotalTokens", "estimatedCostUsd"];
          const lines = [header.join(",")];
          for (const row of rows) {
            lines.push([
              '"' + String(row.bucketStart || "").replace(/"/g, '""') + '"',
              '"' + String(row.label || "").replace(/"/g, '""') + '"',
              String(row.taskCount || 0),
              String(row.estimatedTotalTokens || 0),
              String(row.estimatedCostUsd || 0),
            ].join(","));
          }
          content = lines.join("\n");
          mimeType = "text/csv;charset=utf-8;";
        }
        try {
          const blob = new Blob([content], { type: mimeType });
          const href = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = href;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(href);
          setFeedback("Analytics export generated: " + fileName, "info");
        } catch {
          setFeedback("Failed to export analytics payload.", "error");
        }
      }

      async function renderAnalytics() {
        const windowConfig = resolveAnalyticsWindow();
        const [report, operational] = await Promise.all([
          api("/api/metrics/advanced?limit=12&days=30"),
          api("/api/metrics/operational?limit=12&" + windowConfig.query),
        ]);
        const timeline = Array.isArray(report.timeline)
          ? report.timeline.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          : [];
        const opTrend = Array.isArray(operational.trend) ? operational.trend : [];
        const analyticsKey = [
          windowConfig.preset,
          windowConfig.query,
          opTrend.length,
          opTrend.length ? String(opTrend[opTrend.length - 1].bucketStart || "") : "",
          Number(operational && operational.totals && operational.totals.estimatedTotalTokens || 0),
          Number(operational && operational.totals && operational.totals.estimatedCostUsd || 0),
          Number(operational && operational.flowMetrics && operational.flowMetrics.cycleTimeAvgMs || 0),
          Number(operational && operational.reliability && operational.reliability.reviewSlaAvgMs || 0),
          Number(operational && operational.alerts && operational.alerts.deltaPct || 0),
          ((report.tasks || []).slice(0, 2).map((row) => [row.taskId, row.estimatedCostUsd].join(":")).join(",")),
        ].join("|");
        if (state.analyticsRenderedKey === analyticsKey && document.getElementById("analytics-root")) return;
        state.analyticsOperationalReport = {
          window: windowConfig,
          advanced: report,
          operational,
        };

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
        const qaLoops = report.qaLoops || { tasksWithQa: 0, totalQaLoops: 0, avgQaLoopsPerTask: 0 };
        const flow = operational.flowMetrics || {};
        const reliability = operational.reliability || {};
        const comparison = operational.comparison || {};
        const spikeAlert = operational.alerts && operational.alerts.costSpike
          ? '<div class="review-alert">Cost spike detected: latest bucket ' + escapeHtml(fmtCost(operational.alerts.latestCostUsd)) + " > moving avg " + escapeHtml(fmtCost(operational.alerts.movingAverageCostUsd)) + " by " + escapeHtml(String(operational.alerts.deltaPct || 0)) + "%.</div>"
          : "";
        const bottleneckRows = (flow.bottlenecks || []).slice(0, 6).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.label || (String(row.stage || "") + " • " + String(row.agent || ""))) + "</td>"
            + "<td>" + fmtDurationMs(row.avgDurationMs) + "</td>"
            + "<td>" + fmtNumber(row.count) + "</td>"
            + "</tr>";
        }).join("");
        const rejectionRows = (reliability.rejectionByAgent || []).slice(0, 6).map((row) => {
          return "<tr>"
            + "<td>" + escapeHtml(row.agent || "Unknown") + "</td>"
            + "<td>" + fmtNumber(row.totalReviews) + "</td>"
            + "<td>" + fmtNumber(row.reproved) + "</td>"
            + "<td>" + (Number(row.rejectionRate || 0) * 100).toFixed(1) + "%</td>"
            + "</tr>";
        }).join("");
        const tokenCostChart = renderTokenCostChartWrapper(opTrend, windowConfig.label);
        const agentBreakdown = renderAgentBreakdownChart(operational.agentBreakdown || []);
        const cycleDelta = renderDeltaText(comparison.cycleTimeAvgMs && comparison.cycleTimeAvgMs.deltaPct, true);
        const humanDelta = renderDeltaText(comparison.humanInterventionRate && comparison.humanInterventionRate.deltaPct, true);
        const reviewDelta = renderDeltaText(comparison.reviewSlaAvgMs && comparison.reviewSlaAvgMs.deltaPct, true);
        const costDelta = renderDeltaText(comparison.estimatedCostUsd && comparison.estimatedCostUsd.deltaPct, false);
        const tokenDelta = renderDeltaText(comparison.estimatedTotalTokens && comparison.estimatedTotalTokens.deltaPct, false);

        contentEl.innerHTML = [
          '<div id="analytics-root">',
          '<div class="toolbar">',
          '<div><strong>Operational Analytics</strong><div class="muted">Data-heavy efficiency tracking for runtime, agents and review quality.</div></div>',
          '<div class="actions">',
          '<select id="analytics-range-preset" class="field-select">',
          '<option value="24h"' + (state.analyticsPreset === "24h" ? " selected" : "") + '>24h</option>',
          '<option value="7d"' + (state.analyticsPreset === "7d" ? " selected" : "") + '>7 days</option>',
          '<option value="30d"' + (state.analyticsPreset === "30d" ? " selected" : "") + '>30 days</option>',
          '<option value="custom"' + (state.analyticsPreset === "custom" ? " selected" : "") + '>Custom</option>',
          "</select>",
          '<input id="analytics-from" type="date" class="field-input" value="' + escapeHtml(state.analyticsCustomFrom || "") + '"' + (state.analyticsPreset === "custom" ? "" : ' disabled') + ' />',
          '<input id="analytics-to" type="date" class="field-input" value="' + escapeHtml(state.analyticsCustomTo || "") + '"' + (state.analyticsPreset === "custom" ? "" : ' disabled') + ' />',
          '<button type="button" class="btn" data-analytics-apply>Apply</button>',
          '<button type="button" class="btn" data-analytics-export="csv">Export CSV</button>',
          '<button type="button" class="btn" data-analytics-export="json">Export JSON</button>',
          "</div>",
          "</div>",
          spikeAlert,
          '<div class="grid">',
          '<div class="metric"><div class="muted">Tokens (' + escapeHtml(windowConfig.label) + ')</div><strong>' + fmtNumber(operational.totals && operational.totals.estimatedTotalTokens) + '</strong><div>' + tokenDelta + "</div></div>",
          '<div class="metric"><div class="muted">Cost (' + escapeHtml(windowConfig.label) + ')</div><strong>' + fmtCost(operational.totals && operational.totals.estimatedCostUsd) + '</strong><div>' + costDelta + "</div></div>",
          '<div class="metric"><div class="muted">Cycle Time Avg</div><strong>' + fmtDurationMs(flow.cycleTimeAvgMs) + '</strong><div>' + cycleDelta + "</div></div>",
          '<div class="metric"><div class="muted">Human-to-AI Ratio</div><strong>' + (Number(flow.humanInterventionRate || 0) * 100).toFixed(1) + '% / ' + (Number(flow.autonomousRate || 0) * 100).toFixed(1) + '%</strong><div>' + humanDelta + "</div></div>",
          '<div class="metric"><div class="muted">Review SLA Avg</div><strong>' + fmtDurationMs(reliability.reviewSlaAvgMs) + '</strong><div>' + reviewDelta + "</div></div>",
          '<div class="metric"><div class="muted">Tasks with QA</div><strong>' + fmtNumber(qaLoops.tasksWithQa) + "</strong><div class=\"muted\">Total loops " + fmtNumber(qaLoops.totalQaLoops) + "</div></div>",
          "</div>",
          '<h3 style="margin:18px 0 8px;">Token & Cost Analytics</h3>',
          '<div class="chart-grid">' + tokenCostChart + "</div>",
          '<h3 style="margin:18px 0 8px;">Breakdown by Agent</h3>',
          agentBreakdown,
          '<h3 style="margin:18px 0 8px;">Bottleneck Discovery</h3>',
          bottleneckRows ? '<div class="table-wrap"><table><caption class="sr-only">Bottleneck ranking</caption><thead><tr><th>Stage/Agent</th><th>Avg Stop Time</th><th>Occurrences</th></tr></thead><tbody>' + bottleneckRows + "</tbody></table></div>" : '<div class="empty">No bottleneck rows in selected range.</div>',
          '<h3 style="margin:18px 0 8px;">Reliability Index (Rework)</h3>',
          rejectionRows ? '<div class="table-wrap"><table><caption class="sr-only">Rejection rate by agent</caption><thead><tr><th>Agent</th><th>Reviews</th><th>Reproved</th><th>Rate</th></tr></thead><tbody>' + rejectionRows + "</tbody></table></div>" : '<div class="empty">No rejection events in selected range.</div>',
          '<h3 style="margin:18px 0 8px;">Legacy Consumption Curves</h3>',
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

        const openCommandPaletteTarget = target.closest("[data-open-command-palette]");
        if (openCommandPaletteTarget instanceof HTMLElement && openCommandPaletteTarget.dataset.openCommandPalette !== undefined) {
          openCommandPalette(commandInputEl instanceof HTMLInputElement ? commandInputEl.value : "");
          return;
        }

        const closeCommandPaletteTarget = target.closest("[data-close-command-palette]");
        if (
          closeCommandPaletteTarget instanceof HTMLElement
          && closeCommandPaletteTarget.dataset.closeCommandPalette !== undefined
          && !(target.closest("[data-command-snippet]") instanceof HTMLElement)
        ) {
          closeCommandPalette();
          if (commandInputEl instanceof HTMLInputElement) commandInputEl.focus();
          return;
        }

        const closeCommandConfirmTarget = target.closest("[data-close-command-confirm]");
        if (closeCommandConfirmTarget instanceof HTMLElement && closeCommandConfirmTarget.dataset.closeCommandConfirm !== undefined) {
          closeCommandConfirm();
          if (commandInputEl instanceof HTMLInputElement) commandInputEl.focus();
          return;
        }

        const closeTaskDrawerTarget = target.closest("[data-close-task-drawer]");
        if (closeTaskDrawerTarget instanceof HTMLElement && closeTaskDrawerTarget.dataset.closeTaskDrawer !== undefined) {
          closeTaskDrawer();
          return;
        }

        const confirmCommandTarget = target.closest("[data-confirm-command]");
        if (confirmCommandTarget instanceof HTMLElement && confirmCommandTarget.dataset.confirmCommand !== undefined) {
          const payload = state.commandConfirm;
          closeCommandConfirm();
          if (payload && payload.input) {
            void executeWebCommand(payload.input, payload.mode || "command", { skipConfirm: true });
          }
          return;
        }

        const openSidebarTarget = target.closest("[data-sidebar-toggle]");
        if (openSidebarTarget instanceof HTMLElement && openSidebarTarget.dataset.sidebarToggle !== undefined) {
          openSidebarOverlay();
          return;
        }

        const closeSidebarTarget = target.closest("[data-sidebar-close]");
        if (closeSidebarTarget instanceof HTMLElement && closeSidebarTarget.dataset.sidebarClose !== undefined) {
          closeSidebarOverlay();
          return;
        }

        const toggleCommandsTarget = target.closest("[data-toggle-command-ref]");
        if (toggleCommandsTarget instanceof HTMLElement && toggleCommandsTarget.dataset.toggleCommandRef !== undefined) {
          state.commandRefOpen = !state.commandRefOpen;
          renderCommandReference();
          return;
        }

        const snippetTarget = target.closest("[data-command-snippet]");
        const snippet = snippetTarget instanceof HTMLElement ? String(snippetTarget.dataset.commandSnippet || "").trim() : "";
        if (snippet) {
          const mode = snippetTarget instanceof HTMLElement ? String(snippetTarget.dataset.commandMode || "") : "";
          const shouldClosePalette = Boolean(snippetTarget instanceof HTMLElement && snippetTarget.dataset.closeCommandPalette !== undefined);
          applyCommandSnippet(snippet, mode, shouldClosePalette);
          return;
        }

        const omniTarget = target.closest("[data-omni-index]");
        const omniIndexRaw = omniTarget instanceof HTMLElement ? String(omniTarget.dataset.omniIndex || "") : "";
        if (omniIndexRaw) {
          const omniIndex = Number(omniIndexRaw);
          if (Number.isFinite(omniIndex)) applyOmniSelection(omniIndex);
          return;
        }

        const commandSuggestTarget = target.closest("[data-command-suggest-index]");
        if (commandSuggestTarget instanceof HTMLElement) {
          const index = Number(commandSuggestTarget.dataset.commandSuggestIndex || "0");
          if (Number.isFinite(index) && state.commandSuggestions[index]) {
            const row = state.commandSuggestions[index];
            applyCommandSnippet(row.snippet, row.mode, false);
          }
          return;
        }

        const commandFilterTarget = target.closest("[data-command-filter]");
        const commandFilter = commandFilterTarget instanceof HTMLElement ? String(commandFilterTarget.dataset.commandFilter || "") : "";
        if (commandFilter === "all" || commandFilter === "info" || commandFilter === "success" || commandFilter === "error") {
          state.commandLogFilter = commandFilter;
          const buttons = Array.from(document.querySelectorAll("[data-command-filter]"));
          for (const button of buttons) {
            if (!(button instanceof HTMLElement)) continue;
            button.classList.toggle("active", String(button.dataset.commandFilter || "") === commandFilter);
          }
          renderCommandLog();
          return;
        }

        const webCommandTarget = target.closest("[data-web-command]");
        const webCommand = webCommandTarget instanceof HTMLElement ? String(webCommandTarget.dataset.webCommand || "").trim() : "";
        if (webCommand) {
          const shouldFill = webCommandTarget instanceof HTMLElement && webCommandTarget.dataset.webFill === "true";
          if (shouldFill) {
            applyCommandSnippet(webCommand, "command", false);
          } else {
            const mode = commandModeEl instanceof HTMLSelectElement ? commandModeEl.value : state.commandMode;
            void executeWebCommand(webCommand, mode);
          }
          return;
        }

        const boardModeTarget = target.closest("[data-board-mode]");
        const boardMode = boardModeTarget instanceof HTMLElement ? String(boardModeTarget.dataset.boardMode || "") : "";
        if (boardMode === "kanban" || boardMode === "agent") {
          const normalizedMode = boardMode === "agent" ? "agent" : "kanban";
          if (state.boardMode !== normalizedMode) {
            state.boardMode = normalizedMode;
            state.boardRenderedKey = "";
            syncUrlState();
            persistUiPrefs();
            requestRender("user");
          }
          return;
        }

        const boardPresetTarget = target.closest("[data-board-preset]");
        const boardPreset = boardPresetTarget instanceof HTMLElement ? String(boardPresetTarget.dataset.boardPreset || "") : "";
        if (boardPreset) {
          if (boardPreset === "blocked") state.boardFilter = "status:blocked";
          else if (boardPreset === "consumption") state.boardFilter = "tokens:high";
          else if (boardPreset === "my-reviews") state.boardFilter = "status:waiting_human";
          else state.boardFilter = "";
          state.boardRenderedKey = "";
          syncUrlState();
          persistUiPrefs();
          if (state.view !== "board") setView("board");
          else requestRender("user");
          return;
        }

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

        const statViewTarget = target.closest("[data-stat-view]");
        const statView = statViewTarget instanceof HTMLElement ? String(statViewTarget.dataset.statView || "") : "";
        if (statView === "overview" || statView === "tasks" || statView === "board" || statView === "review" || statView === "detail" || statView === "live" || statView === "analytics") {
          const statFilter = statViewTarget instanceof HTMLElement ? String(statViewTarget.dataset.statFilter || "") : "";
          if (statView === "board" && statFilter) {
            state.boardFilter = statFilter;
            state.boardRenderedKey = "";
          }
          setView(statView);
          return;
        }

        const liveFilterTarget = target.closest("[data-live-filter]");
        const liveFilter = liveFilterTarget instanceof HTMLElement ? String(liveFilterTarget.dataset.liveFilter || "") : "";
        if (liveFilter === "all" || liveFilter === "tasks" || liveFilter === "runtime" || liveFilter === "human" || liveFilter === "alerts") {
          state.liveFilter = liveFilter;
          state.liveRenderedKey = "";
          syncUrlState();
          persistUiPrefs();
          requestRender("user");
          return;
        }

        const liveLogsTarget = target.closest("[data-live-view-logs]");
        const liveLogKey = liveLogsTarget instanceof HTMLElement ? String(liveLogsTarget.dataset.liveViewLogs || "") : "";
        if (liveLogKey) {
          state.liveExpandedLogKey = state.liveExpandedLogKey === liveLogKey ? "" : liveLogKey;
          state.liveRenderedKey = "";
          requestRender("user");
          return;
        }

        const analyticsApplyTarget = target.closest("[data-analytics-apply]");
        if (analyticsApplyTarget instanceof HTMLElement && analyticsApplyTarget.dataset.analyticsApply !== undefined) {
          if (state.analyticsPreset === "custom" && (!state.analyticsCustomFrom || !state.analyticsCustomTo)) {
            setFeedback("Select both start and end dates for custom analytics range.", "error");
            return;
          }
          state.analyticsRenderedKey = "";
          syncUrlState();
          persistUiPrefs();
          requestRender("user");
          return;
        }

        const analyticsExportTarget = target.closest("[data-analytics-export]");
        const analyticsExport = analyticsExportTarget instanceof HTMLElement ? String(analyticsExportTarget.dataset.analyticsExport || "") : "";
        if (analyticsExport === "csv" || analyticsExport === "json") {
          exportAnalyticsData(analyticsExport);
          return;
        }

        const openReviewTarget = target.closest("[data-open-review]");
        if (openReviewTarget instanceof HTMLElement && openReviewTarget.dataset.openReview !== undefined) {
          setView("review");
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
          openTaskDetail(taskId, state.view);
          return;
        }

        const openTaskDrawerTarget = target.closest("[data-open-task-drawer]");
        const drawerTaskId = openTaskDrawerTarget instanceof HTMLElement ? String(openTaskDrawerTarget.dataset.openTaskDrawer || "") : "";
        if (drawerTaskId && state.view === "live") {
          const drawerContext = openTaskDrawerTarget instanceof HTMLElement
            ? String(openTaskDrawerTarget.dataset.drawerContext || "Agent Logs")
            : "Agent Logs";
          void openTaskDrawer(drawerTaskId, drawerContext);
          return;
        }

        const quickReasonTarget = target.closest("[data-quick-reason]");
        const quickReason = quickReasonTarget instanceof HTMLElement ? String(quickReasonTarget.dataset.quickReason || "") : "";
        if (quickReason) {
          const reviewReasonEl = document.getElementById("review-reason");
          const detailReasonEl = document.getElementById("action-reason");
          if (detailReasonEl instanceof HTMLTextAreaElement && state.view === "detail") {
            detailReasonEl.value = quickReason;
            detailReasonEl.focus();
            state.reviewDraftReason = quickReason;
          } else if (reviewReasonEl instanceof HTMLTextAreaElement) {
            reviewReasonEl.value = quickReason;
            reviewReasonEl.focus();
            state.reviewDraftReason = quickReason;
          }
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
          const detailRollbackStepEl = document.getElementById("action-rollback-step");
          const useReviewControls = Boolean(actionTaskId);
          const reason = useReviewControls
            ? (reviewReasonEl instanceof HTMLTextAreaElement ? reviewReasonEl.value.trim() : String(state.reviewDraftReason || "").trim())
            : (detailReasonEl instanceof HTMLTextAreaElement ? detailReasonEl.value.trim() : "");
          const rollbackMode = useReviewControls
            ? (reviewRollbackEl instanceof HTMLSelectElement ? reviewRollbackEl.value : state.reviewRollbackMode || "none")
            : (detailRollbackEl instanceof HTMLSelectElement ? detailRollbackEl.value : "none");
          const rollbackStep = !useReviewControls && detailRollbackStepEl instanceof HTMLSelectElement
            ? String(detailRollbackStepEl.value || "")
            : "";

          (async () => {
            try {
              await executeTaskAction(taskAction, taskIdToUse, reason, rollbackMode, rollbackStep);
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
          if (runtimeAction === "stop") {
            openCommandConfirm({
              input: "/stop-runtime",
              mode: "command",
            });
            return;
          }
          const alias = runtimeAction === "pause" ? "/pause-all" : "/resume-runtime";
          void executeWebCommand(alias, "command", { skipConfirm: true });
        }
      });

      document.addEventListener("input", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.id === "task-search") {
          state.search = target.value;
          requestRender("user");
        }
        if (target instanceof HTMLInputElement && target.id === "command-ref-filter") {
          state.commandRefQuery = target.value || "";
          renderCommandReference();
        }
        if (target instanceof HTMLInputElement && target.id === "web-command-input") {
          state.commandHistoryIndex = -1;
          renderCommandSuggestions(target.value);
        }
        if (target instanceof HTMLInputElement && target.id === "command-palette-filter") {
          state.commandPaletteQuery = target.value || "";
          state.omniActiveIndex = 0;
          renderCommandPalette();
          void refreshOmniTasksCache(false).then(() => {
            if (state.commandPaletteOpen) renderCommandPalette();
          });
        }
        if (target instanceof HTMLInputElement && target.id === "board-filter") {
          state.boardFilter = target.value || "";
          syncUrlState();
          persistUiPrefs();
          if (state.view === "board") requestRender("user");
        }
        if (target instanceof HTMLInputElement && target.id === "global-search-input") {
          state.search = target.value || "";
        }
        if (target instanceof HTMLInputElement && target.id === "analytics-from") {
          state.analyticsCustomFrom = target.value || "";
          syncUrlState();
          persistUiPrefs();
        }
        if (target instanceof HTMLInputElement && target.id === "analytics-to") {
          state.analyticsCustomTo = target.value || "";
          syncUrlState();
          persistUiPrefs();
        }
        if (target instanceof HTMLTextAreaElement && target.id === "review-reason") {
          state.reviewDraftReason = target.value;
        }
        if (target instanceof HTMLTextAreaElement && target.id === "action-reason") {
          state.reviewDraftReason = target.value;
        }
      });

      document.addEventListener("scroll", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.id !== "live-scroll") return;
        const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        const nearBottom = distanceToBottom < 48;
        state.liveAutoScroll = nearBottom;
        state.liveScrollTop = target.scrollTop;
        state.liveViewportHeight = target.clientHeight;
        if (state.view === "live" && state.liveEvents.length > 500) {
          state.liveRenderedKey = "";
          requestRender("poll");
        }
      }, true);

      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (state.commandPaletteOpen) closeCommandPalette();
          else openCommandPalette(commandInputEl instanceof HTMLInputElement ? commandInputEl.value : "");
          return;
        }
        const keyTarget = event.target;
        if (state.commandPaletteOpen && (keyTarget instanceof HTMLInputElement && keyTarget.id === "command-palette-filter")) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const total = Array.isArray(state.omniResults) ? state.omniResults.length : 0;
            if (total > 0) {
              state.omniActiveIndex = ((state.omniActiveIndex + delta) % total + total) % total;
              renderCommandPalette();
              const activeEl = document.querySelector('[data-omni-index="' + String(state.omniActiveIndex) + '"]');
              if (activeEl instanceof HTMLElement) activeEl.scrollIntoView({ block: "nearest" });
            }
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            applyOmniSelection(state.omniActiveIndex);
            return;
          }
        }
        if (event.key === "Escape") {
          if (state.commandConfirm) {
            closeCommandConfirm();
            return;
          }
          if (state.commandPaletteOpen) {
            closeCommandPalette();
            return;
          }
          if (state.commandSuggestionsOpen) {
            state.commandSuggestionsOpen = false;
            state.commandSuggestions = [];
            state.commandSuggestionsIndex = 0;
            if (commandSuggestEl instanceof HTMLElement) commandSuggestEl.setAttribute("hidden", "");
            return;
          }
          if (state.view === "live" && state.liveExpandedLogKey) {
            state.liveExpandedLogKey = "";
            state.liveRenderedKey = "";
            requestRender("user");
            return;
          }
          if (state.drawerOpen) {
            closeTaskDrawer();
            return;
          }
          if (state.view === "detail") {
            state.selectedTaskId = "";
            setView("review");
            return;
          }
          closeSidebarOverlay();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          if (state.view === "detail" && state.selectedTaskId && !state.pendingActionKey) {
            event.preventDefault();
            const detailReasonEl = document.getElementById("action-reason");
            const detailRollbackEl = document.getElementById("action-rollback");
            const detailRollbackStepEl = document.getElementById("action-rollback-step");
            const reason = detailReasonEl instanceof HTMLTextAreaElement ? detailReasonEl.value.trim() : "";
            const rollbackMode = detailRollbackEl instanceof HTMLSelectElement ? detailRollbackEl.value : "none";
            const rollbackStep = detailRollbackStepEl instanceof HTMLSelectElement ? String(detailRollbackStepEl.value || "") : "";
            void executeTaskAction("approve", state.selectedTaskId, reason, rollbackMode, rollbackStep)
              .catch((error) => setFeedback(error instanceof Error ? error.message : "Action failed", "error"));
          }
          return;
        }

        const commandInputTarget = event.target;
        if (commandInputTarget instanceof HTMLInputElement && commandInputTarget.id === "web-command-input") {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const isDown = event.key === "ArrowDown";
            if (state.commandSuggestionsOpen && state.commandSuggestions.length) {
              event.preventDefault();
              setCommandSuggestionActive(state.commandSuggestionsIndex + (isDown ? 1 : -1));
              return;
            }
            event.preventDefault();
            const value = browseCommandHistory(isDown ? 1 : -1);
            commandInputTarget.value = value;
            renderCommandSuggestions(value);
            return;
          }
          if ((event.key === "Enter" || event.key === "Tab") && state.commandSuggestionsOpen && state.commandSuggestions.length) {
            event.preventDefault();
            const row = state.commandSuggestions[state.commandSuggestionsIndex] || state.commandSuggestions[0];
            if (row) applyCommandSnippet(row.snippet, row.mode, false);
            return;
          }
        }

        if (keyTarget instanceof HTMLElement && keyTarget.classList.contains("board-card") && (event.key === "Enter" || event.key === " ")) {
          const taskId = String(keyTarget.dataset.openTask || "");
          if (taskId) {
            event.preventDefault();
            openTaskDetail(taskId, "board");
            return;
          }
        }
        if (keyTarget instanceof HTMLElement && keyTarget.classList.contains("event-card") && (event.key === "Enter" || event.key === " ")) {
          const taskId = String(keyTarget.dataset.openTaskDrawer || "");
          if (taskId && state.view === "live") {
            event.preventDefault();
            void openTaskDrawer(taskId, String(keyTarget.dataset.drawerContext || "Agent Logs"));
            return;
          }
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== "global-search-input" || event.key !== "Enter") return;
        event.preventDefault();
        state.search = target.value.trim();
        if (state.view !== "tasks") setView("tasks");
        else requestRender("user");
        setFeedback(state.search ? 'Search applied: "' + state.search + '"' : "Search cleared.", "info");
      });

      document.addEventListener("submit", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLFormElement)) return;
        if (target.id !== "web-command-form") return;
        event.preventDefault();
        const input = commandInputEl instanceof HTMLInputElement ? commandInputEl.value.trim() : "";
        const mode = commandModeEl instanceof HTMLSelectElement ? commandModeEl.value : state.commandMode;
        if (!input) {
          setFeedback("Type a command before running.", "error");
          return;
        }
        void executeWebCommand(input, mode);
        state.commandSuggestionsOpen = false;
        state.commandSuggestions = [];
        state.commandSuggestionsIndex = 0;
        if (commandSuggestEl instanceof HTMLElement) commandSuggestEl.setAttribute("hidden", "");
      });

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.id === "review-rollback") {
          state.reviewRollbackMode = target.value === "task" ? "task" : "none";
        }
        if (target instanceof HTMLSelectElement && target.id === "board-mode") {
          state.boardMode = target.value === "agent" ? "agent" : "kanban";
          state.boardRenderedKey = "";
          syncUrlState();
          persistUiPrefs();
          requestRender("user");
        }
        if (target instanceof HTMLSelectElement && target.id === "web-command-mode") {
          state.commandMode = target.value === "human" ? "human" : "command";
          persistUiPrefs();
          pushCommandLog("Switched command mode to " + state.commandMode + ".", "system");
        }
        if (target instanceof HTMLSelectElement && target.id === "analytics-range-preset") {
          const value = String(target.value || "");
          if (value === "24h" || value === "7d" || value === "30d" || value === "custom") {
            state.analyticsPreset = value;
            state.analyticsRenderedKey = "";
            syncUrlState();
            persistUiPrefs();
            requestRender("user");
          }
        }
      });

      function connectRealtime() {
        try {
          const source = new EventSource("/api/stream");
          source.addEventListener("open", () => {
            state.realtimeConnected = true;
            setPollStatus("Realtime connected");
            setConnectivityIndicator(true, "Online");
          });
          source.addEventListener("error", () => {
            state.realtimeConnected = false;
            setPollStatus("Realtime reconnecting...");
            setConnectivityIndicator(false, "Offline");
          });

          const types = ["runtime.updated", "task.updated", "task.review_required", "task.decision_recorded", "metrics.updated"];
          for (const type of types) {
            source.addEventListener(type, (row) => {
              try {
                const parsed = JSON.parse(row.data);
                state.liveEvents.push(parsed);
                if (state.liveEvents.length > 1200) state.liveEvents = state.liveEvents.slice(-1200);
                if (type === "task.review_required") {
                  state.reviewAlertAt = fmtTimeNow();
                  setPollStatus("Review required now");
                  setHeaderNotificationCount(1);
                  setFeedback("New task entered waiting_human queue.", "info");
                }
                if (
                  type === "task.updated"
                  || type === "task.review_required"
                  || type === "task.decision_recorded"
                  || type === "runtime.updated"
                  || type === "metrics.updated"
                ) {
                  void refreshGlobalSnapshot();
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
          setConnectivityIndicator(false, "Offline");
        }
      }

      loadUiPrefs();
      applyRouteState();
      if (state.selectedTaskId && state.view !== "detail" && state.view !== "live") {
        state.view = "detail";
      }
      if (commandModeEl instanceof HTMLSelectElement) {
        commandModeEl.value = state.commandMode;
      }
      if (commandRefFilterEl instanceof HTMLInputElement) {
        commandRefFilterEl.value = state.commandRefQuery;
      }
      if (commandPaletteFilterEl instanceof HTMLInputElement) {
        commandPaletteFilterEl.value = state.commandPaletteQuery;
      }
      if (globalSearchInputEl instanceof HTMLInputElement) {
        globalSearchInputEl.value = state.search;
      }
      navButtons.forEach((button) => {
        const isActive = button.dataset.view === state.view;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      updateHeaderMeta();
      setHeaderNotificationCount(0);
      setRuntimeStatusPill({ isAlive: true, provider: "Local LLM" });
      setConnectivityIndicator(false, "Connecting");
      pushCommandLog("Command center online. Try /status or Cmd/Ctrl + K.", "system");
      pushCommandLog("Use ArrowUp/ArrowDown for command history.", "system");
      renderCommandReference();
      renderCommandPalette();
      renderCommandSuggestions("");
      applyThemePreference(loadThemePreference(), false);
      bindSystemThemeSync();
      syncUrlState();
      persistUiPrefs();
      if (state.drawerOpen && state.drawerTaskId) {
        void openTaskDrawer(state.drawerTaskId, state.drawerContextLabel || "Agent Logs");
      }
      setInterval(() => {
        requestRender("poll");
        if (state.view !== "overview") void refreshGlobalSnapshot();
      }, state.pollMs);
      connectRealtime();
      void refreshGlobalSnapshot();
      requestRender("user");
    </script>
  </body>
</html>`;
}
