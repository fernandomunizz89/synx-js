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
            <div><strong>Command Console</strong><div class="muted">CLI-style input with fast templates and command reference.</div></div>
            <button type="button" class="btn" data-toggle-command-ref>Commands</button>
          </div>
          <div class="command-shell">
            <form id="web-command-form" class="command-form">
              <input id="web-command-input" class="field-input command-input" autocomplete="off" placeholder='status --all | new "Fix bug" --type Bug | approve --task-id task-123' />
              <select id="web-command-mode" class="field-select">
                <option value="command">Command mode</option>
                <option value="human">Human input mode</option>
              </select>
              <button type="submit" class="btn approve">Run</button>
            </form>
            <div class="command-quick">
              <button type="button" class="btn" data-web-command="help">help</button>
              <button type="button" class="btn" data-web-command="status">status</button>
              <button type="button" class="btn" data-web-command="status --all">status --all</button>
              <button type="button" class="btn" data-web-command='new "Investigate issue" --type Feature' data-web-fill="true">new</button>
              <button type="button" class="btn reprove" data-web-command='reprove --task-id task-... --reason "Need changes"' data-web-fill="true">reprove</button>
              <button type="button" class="btn approve" data-web-command='approve --task-id task-...' data-web-fill="true">approve</button>
              <button type="button" class="btn" data-runtime-action="pause">pause</button>
              <button type="button" class="btn approve" data-runtime-action="resume">resume</button>
              <button type="button" class="btn cancel" data-runtime-action="stop">stop</button>
            </div>
            <section id="command-reference" class="command-ref" hidden>
              <input id="command-ref-filter" class="field-input" placeholder="Filter command by name or usage..." />
              <div id="command-ref-list" class="command-ref-list"></div>
            </section>
            <div id="web-command-log" class="command-log" role="log" aria-live="polite"></div>
          </div>
        </section>

        <section class="card">
          <div id="content" role="region" aria-live="polite" aria-busy="false"></div>
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
      .command-shell {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--surface-soft);
        padding: var(--space-3);
      }
      .command-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: var(--space-2);
      }
      .command-input {
        width: 100%;
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
        background: var(--surface);
        padding: var(--space-2);
        min-height: 72px;
        max-height: 180px;
        overflow: auto;
        font-family: var(--font-mono);
        font-size: 0.82rem;
      }
      .command-log .line {
        margin: 0 0 6px;
        white-space: pre-wrap;
      }
      .command-log .line:last-child {
        margin-bottom: 0;
      }
      .command-log .line.user {
        color: var(--accent);
      }
      .command-log .line.critical {
        color: var(--status-failed-fg);
      }
      .command-log .line.info {
        color: var(--fg);
      }
      .command-log .line.system {
        color: var(--muted);
      }
      .command-ref {
        margin-top: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
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
        background: var(--surface-soft);
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
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 5px 7px;
      }
      .command-ref-item .muted {
        margin-top: 4px;
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
      }
      .review-card:last-child {
        margin-bottom: 0;
      }
      .review-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: 6px;
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
      .event-feed {
        display: grid;
        gap: var(--space-2);
      }
      .board-columns {
        display: flex;
        gap: var(--space-3);
        overflow-x: auto;
        padding-bottom: 6px;
      }
      .board-mode {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
      }
      .board-column {
        min-width: 270px;
        max-width: 320px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--surface-soft);
        padding: var(--space-3);
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
        gap: var(--space-2);
      }
      .board-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        padding: var(--space-3);
        transition: transform 0.16s ease, border-color 0.16s ease;
        display: grid;
        gap: var(--space-2);
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
      .board-card .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .board-card .owner {
        font-size: 0.8rem;
        color: var(--fg);
        font-weight: 600;
      }
      .board-card .updated {
        font-size: 0.78rem;
        color: var(--muted);
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
      .event-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        background: var(--surface);
      }
      .event-card .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
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
        border-radius: var(--radius-pill);
        font-size: var(--type-label-size);
        font-weight: var(--type-label-weight);
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
        .board-mode {
          width: 100%;
          justify-content: space-between;
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
        liveRenderedCount: -1,
        liveRenderedConnected: null,
        commandMode: "command",
        commandLog: [],
        commandRefOpen: false,
        commandRefQuery: "",
        boardMode: "kanban",
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
      const commandRefEl = document.getElementById("command-reference");
      const commandRefFilterEl = document.getElementById("command-ref-filter");
      const commandRefListEl = document.getElementById("command-ref-list");
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
        { mode: "command", name: "help", usage: "help", description: "Show command guide and usage hints." },
        { mode: "command", name: "status", usage: "status", description: "Show concise runtime status." },
        { mode: "command", name: "status --all", usage: "status --all", description: "Show all tasks and pipeline state." },
        { mode: "command", name: "new", usage: 'new "Title" --type Feature', description: "Create a new task." },
        { mode: "command", name: "approve", usage: "approve --task-id task-123", description: "Approve a task in waiting_human." },
        { mode: "command", name: "reprove", usage: 'reprove --task-id task-123 --reason "Need changes"', description: "Reprove and send task back to flow." },
        { mode: "command", name: "cancel", usage: 'cancel --task-id task-123 --reason "No longer needed"', description: "Request task cancellation." },
        { mode: "command", name: "pause", usage: "pause", description: "Pause runtime loop." },
        { mode: "command", name: "resume", usage: "resume", description: "Resume runtime loop." },
        { mode: "command", name: "stop", usage: "stop", description: "Request graceful runtime stop." },
        { mode: "human", name: "yes", usage: "yes", description: "Approve preferred pending review task." },
        { mode: "human", name: "no", usage: "no because <reason>", description: "Reprove preferred review task with reason." },
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

      function renderCommandLog() {
        if (!(commandLogEl instanceof HTMLElement)) return;
        if (!state.commandLog.length) {
          commandLogEl.innerHTML = '<p class="line system">Web command console ready.</p>';
          return;
        }
        commandLogEl.innerHTML = state.commandLog.map((row) => {
          const tone = String(row && row.tone || "info");
          const message = String(row && row.message || "");
          return '<p class="line ' + escapeHtml(tone) + '">' + escapeHtml(message) + "</p>";
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
        const filter = String(state.commandRefQuery || "").trim().toLowerCase();
        const rows = commandCatalog.filter((row) => {
          if (!filter) return true;
          return row.name.toLowerCase().includes(filter)
            || row.usage.toLowerCase().includes(filter)
            || row.description.toLowerCase().includes(filter);
        });
        if (!rows.length) {
          commandRefListEl.innerHTML = '<div class="empty">No commands match this filter.</div>';
          return;
        }
        commandRefListEl.innerHTML = rows.map((row) => {
          return [
            '<article class="command-ref-item">',
            '<div class="command-ref-top"><strong>' + escapeHtml(row.name) + '</strong><span class="status ' + (row.mode === "human" ? "waiting_human" : "in_progress") + '">' + escapeHtml(row.mode) + "</span></div>",
            '<div class="command-ref-code">' + escapeHtml(row.usage) + "</div>",
            '<div class="muted">' + escapeHtml(row.description) + "</div>",
            '<div class="actions" style="margin-top:6px;"><button type="button" class="btn" data-command-snippet="' + escapeHtml(row.usage) + '">Use snippet</button></div>',
            "</article>",
          ].join("");
        }).join("");
      }

      function pushCommandLog(message, tone) {
        state.commandLog.push({
          message: String(message || ""),
          tone: tone === "critical" || tone === "user" || tone === "system" ? tone : "info",
        });
        if (state.commandLog.length > 140) state.commandLog = state.commandLog.slice(-140);
        renderCommandLog();
      }

      async function executeWebCommand(input, mode) {
        const raw = String(input || "").trim();
        if (!raw) return;
        const selectedMode = mode === "human" ? "human" : "command";
        pushCommandLog(selectedMode === "human" ? "human> " + raw : "$ " + raw, "user");
        try {
          const result = await postApi("/api/command", {
            input: raw,
            mode: selectedMode,
          });
          const lines = Array.isArray(result && result.lines) ? result.lines : [];
          if (!lines.length) {
            pushCommandLog("No output lines returned by command handler.", "system");
          } else {
            for (const line of lines) {
              const text = String(line && line.message || "");
              const tone = String(line && line.level || "info");
              pushCommandLog(text || "[empty]", tone === "critical" ? "critical" : "info");
            }
          }
          if (result && result.stopRequested) {
            pushCommandLog("Runtime stop requested from command input.", "critical");
          }
          requestRender("user");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Command failed";
          pushCommandLog(message, "critical");
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
        const meta = viewMeta[view] || viewMeta.overview;
        if (headerViewKeyEl) headerViewKeyEl.textContent = meta.breadcrumb;
        if (headerScreenTitleEl) headerScreenTitleEl.textContent = meta.title;
        closeSidebarOverlay();
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
          '<button type="button" class="stat-link" data-stat-view="' + escapeHtml(view) + '">Details</button>',
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
            view: "review",
            waitingHot: Number(counts.waitingHuman || 0) > 0,
          },
          {
            label: "Failed / Blocked",
            value: fmtNumber(counts.failed),
            subtitle: "Needs intervention",
            valueTone: Number(counts.failed || 0) > 0 ? "error" : "working",
            icon: "failed",
            view: "board",
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

      function renderBoardCard(task, mode) {
        const stage = String(task.currentStage || "unscoped");
        const currentAgent = String(task.currentAgent || "unassigned");
        const nextAgent = String(task.nextAgent || "n/a");
        const project = String(task.project || "General");
        const type = String(task.type || "Task");
        const tokens = fmtNumber(task.consumption && task.consumption.estimatedTotalTokens);
        const updatedAt = fmtRelativeTime(task.updatedAt);
        const owner = mode === "kanban"
          ? currentAgent
          : currentAgent + " → " + nextAgent;
        const chips = [
          '<span class="board-chip strong">' + escapeHtml(project) + "</span>",
          '<span class="board-chip">' + escapeHtml(type) + "</span>",
          '<span class="board-chip">' + escapeHtml(stage) + "</span>",
          '<span class="board-chip">tokens ' + escapeHtml(tokens) + "</span>",
        ];
        if (task.humanApprovalRequired || task.status === "waiting_human") {
          chips.push('<span class="board-chip strong">needs review</span>');
        }
        return [
          '<article class="board-card ' + escapeHtml(task.status) + '">',
          '<div class="head"><div class="id">' + escapeHtml(task.taskId) + "</div>" + taskStatusBadge(task.status) + "</div>",
          '<h4 class="title"><button class="link" data-open-task="' + escapeHtml(task.taskId) + '">' + escapeHtml(task.title || task.taskId) + "</button></h4>",
          '<div class="chip-row">' + chips.join("") + "</div>",
          '<div class="foot"><div class="owner">' + escapeHtml(owner) + '</div><div class="updated">' + escapeHtml(updatedAt) + "</div></div>",
          "</article>",
        ].join("");
      }

      async function renderBoard() {
        const tasks = await api("/api/tasks");
        const mode = state.boardMode === "agent" ? "agent" : "kanban";
        const key = mode + "::" + tasks
          .map((task) => [task.taskId, task.status, task.currentAgent, task.nextAgent, task.currentStage, task.updatedAt].join("|"))
          .join(";");
        if (state.boardRenderedKey === key && document.getElementById("board-root")) return;

        const columns = mode === "agent"
          ? [
            { id: "new", title: "New Queue", hint: "Newly created or not yet assigned", klass: "" },
            { id: "dispatcher", title: "Dispatcher", hint: "Task routing and orchestration", klass: "" },
            { id: "planner", title: "Planner", hint: "Plan decomposition and sequencing", klass: "" },
            { id: "research", title: "Researcher", hint: "External discovery and grounding", klass: "" },
            { id: "experts", title: "Experts", hint: "Implementation by SYNX specialists", klass: "" },
            { id: "qa", title: "QA", hint: "Validation and retry loops", klass: "" },
            { id: "human", title: "Human Review", hint: "Waiting for approve/reprove", klass: "" },
            { id: "done", title: "Done", hint: "Completed successfully", klass: "" },
            { id: "failed", title: "Failed/Blocked", hint: "Needs intervention", klass: "" },
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
          '<div id="board-root">',
          '<div class="toolbar"><div class="muted">Auto-updating board: cards move on each poll and realtime event.</div><div class="board-mode"><label for="board-mode" class="muted">View</label><select id="board-mode" class="field-select"><option value="kanban"' + (mode === "kanban" ? " selected" : "") + '>Jira Kanban</option><option value="agent"' + (mode === "agent" ? " selected" : "") + '>Agent Lanes</option></select><div class="muted">' + fmtNumber(tasks.length) + " tasks</div></div></div>",
          '<div class="board-columns">',
          columns.map((column) => {
            const cards = byColumn[column.id] || [];
            const cardHtml = cards.length
              ? cards.map((task) => renderBoardCard(task, mode)).join("")
              : '<div class="empty">No tasks in this lane.</div>';
            return [
              '<section class="board-column ' + escapeHtml(column.klass || "") + '">',
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
          if (commandInputEl instanceof HTMLInputElement) {
            commandInputEl.value = snippet;
            commandInputEl.focus();
          }
          return;
        }

        const webCommandTarget = target.closest("[data-web-command]");
        const webCommand = webCommandTarget instanceof HTMLElement ? String(webCommandTarget.dataset.webCommand || "").trim() : "";
        if (webCommand) {
          const shouldFill = webCommandTarget instanceof HTMLElement && webCommandTarget.dataset.webFill === "true";
          if (shouldFill && commandInputEl instanceof HTMLInputElement) {
            commandInputEl.value = webCommand;
            commandInputEl.focus();
          } else {
            const mode = commandModeEl instanceof HTMLSelectElement ? commandModeEl.value : state.commandMode;
            void executeWebCommand(webCommand, mode);
          }
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
          setView(statView);
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
        if (target instanceof HTMLInputElement && target.id === "command-ref-filter") {
          state.commandRefQuery = target.value || "";
          renderCommandReference();
        }
        if (target instanceof HTMLInputElement && target.id === "global-search-input") {
          state.search = target.value || "";
        }
        if (target instanceof HTMLTextAreaElement && target.id === "review-reason") {
          state.reviewDraftReason = target.value;
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeSidebarOverlay();
          return;
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
        if (commandInputEl instanceof HTMLInputElement) commandInputEl.value = "";
      });

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.id === "review-rollback") {
          state.reviewRollbackMode = target.value === "task" ? "task" : "none";
        }
        if (target instanceof HTMLSelectElement && target.id === "board-mode") {
          state.boardMode = target.value === "agent" ? "agent" : "kanban";
          state.boardRenderedKey = "";
          requestRender("user");
        }
        if (target instanceof HTMLSelectElement && target.id === "web-command-mode") {
          state.commandMode = target.value === "human" ? "human" : "command";
          pushCommandLog("Switched command mode to " + state.commandMode + ".", "system");
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
                if (state.liveEvents.length > 160) state.liveEvents = state.liveEvents.slice(-160);
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

      if (commandModeEl instanceof HTMLSelectElement) {
        commandModeEl.value = state.commandMode;
      }
      if (commandRefFilterEl instanceof HTMLInputElement) {
        commandRefFilterEl.value = state.commandRefQuery;
      }
      if (globalSearchInputEl instanceof HTMLInputElement) {
        globalSearchInputEl.value = state.search;
      }
      const initialMeta = viewMeta[state.view] || viewMeta.overview;
      if (headerViewKeyEl) headerViewKeyEl.textContent = initialMeta.breadcrumb;
      if (headerScreenTitleEl) headerScreenTitleEl.textContent = initialMeta.title;
      setHeaderNotificationCount(0);
      setRuntimeStatusPill({ isAlive: true, provider: "Local LLM" });
      setConnectivityIndicator(false, "Connecting");
      pushCommandLog("Web command console ready. Try: status --all", "system");
      pushCommandLog("Human mode accepts: yes / no + reason", "system");
      renderCommandReference();
      applyThemePreference(loadThemePreference(), false);
      bindSystemThemeSync();
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
