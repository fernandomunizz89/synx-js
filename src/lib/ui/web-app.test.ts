import { describe, expect, it } from "vitest";
import { buildWebUiHtml } from "./web-app.js";

describe("lib/ui/web-app", () => {
  it("returns a non-empty HTML string", () => {
    const html = buildWebUiHtml();
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });

  it("contains valid inline script", () => {
    const html = buildWebUiHtml();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const source of scripts) {
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it("renders the sidebar navigation", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('data-page="dashboard"');
    expect(html).toContain('data-page="tasks"');
    expect(html).toContain('data-page="review"');
    expect(html).toContain('data-page="stream"');
  });

  it("renders the tasks page with search and status filter", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="page-tasks"');
    expect(html).toContain('id="task-search"');
    expect(html).toContain('id="task-filter"');
    expect(html).toContain('id="tasks-body"');
  });

  it("renders the review page", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="page-review"');
    expect(html).toContain('id="review-list"');
    expect(html).toContain('id="nb-review"');
  });

  it("renders the stream page", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="page-stream"');
    expect(html).toContain('id="stream-log"');
    expect(html).toContain('id="stream-count"');
  });

  it("renders the reprove modal", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="reprove-modal"');
    expect(html).toContain('id="reprove-reason"');
    expect(html).toContain('id="reprove-rollback"');
    expect(html).toContain('id="reprove-submit"');
  });

  it("renders the engine status indicators", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="engine-dot"');
    expect(html).toContain('id="engine-label"');
    expect(html).toContain('id="s-active"');
    expect(html).toContain('id="s-waiting"');
  });

  it("renders the prompt bar", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="prompt-ta"');
    expect(html).toContain('id="btn-send"');
    expect(html).toContain('id="prompt-msg"');
  });

  it("renders the agent squad list", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('data-agent="Dispatcher"');
    expect(html).toContain('data-agent="Synx Front Expert"');
    expect(html).toContain('data-agent="Synx QA Engineer"');
  });

  it("uses the correct API endpoints", () => {
    const html = buildWebUiHtml();
    expect(html).toContain("/api/overview");
    expect(html).toContain("/api/tasks");
    expect(html).toContain("/api/project");
    expect(html).toContain("/api/stream");
    expect(html).toContain("/approve");
    expect(html).toContain("/reprove");
    expect(html).toContain("/cancel");
  });

  it("does not contain Portuguese strings from the old UI", () => {
    const html = buildWebUiHtml();
    expect(html).not.toContain("Fluxo simples");
    expect(html).not.toContain("Buscar tarefas");
    expect(html).not.toContain("Avancado");
    expect(html).not.toContain("Reprovar");
    expect(html).not.toContain("Mostrar ajuda");
  });

  it("does not reference the removed React island bundle", () => {
    const html = buildWebUiHtml();
    expect(html).not.toContain("task-assistant.react.js");
    expect(html).not.toContain("react-task-assistant-root");
  });

  // ── Phase 3 new UI features ──────────────────────────────────────────────────

  it("Phase 3 — renders Metrics and Settings pages", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="page-metrics"');
    expect(html).toContain('id="page-settings"');
    expect(html).toContain('data-page="metrics"');
    expect(html).toContain('data-page="settings"');
    // Metrics cards
    expect(html).toContain('id="m-tokens"');
    expect(html).toContain('id="m-cost"');
    expect(html).toContain('id="sparkline"');
    // Settings sections
    expect(html).toContain('id="cfg-providers-table"');
    expect(html).toContain('id="cfg-threshold"');
    expect(html).toContain('id="cfg-project-info"');
    expect(html).toContain('id="settings-msg"');
  });

  it("Phase 3 — renders the task detail drawer", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="drawer"');
    expect(html).toContain('id="drawer-title"');
    expect(html).toContain('id="drawer-subtitle"');
    expect(html).toContain('id="dtab-overview"');
    expect(html).toContain('id="dtab-artifacts"');
    expect(html).toContain('id="dtab-history"');
    expect(html).toContain('id="drawer-overlay"');
  });

  it("Phase 3 — renders the new task modal", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('id="newtask-modal"');
    expect(html).toContain('id="nt-title"');
    expect(html).toContain('id="nt-desc"');
    expect(html).toContain('id="nt-type"');
    expect(html).toContain('id="nt-submit"');
    expect(html).toContain('id="nt-err"');
  });

  it("Phase 3 — renders topbar extras (new-task button, notif bell, inline command)", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('class="btn-newtask"');
    expect(html).toContain('id="btn-notif"');
    expect(html).toContain('id="cmd-input"');
    expect(html).toContain('id="cmd-out"');
  });

  it("Phase 3 — agent squad shows Code Reviewer and DevOps Expert", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('data-agent="Synx Code Reviewer"');
    expect(html).toContain('data-agent="Synx DevOps Expert"');
  });

  it("Phase 3 — uses new API endpoints", () => {
    const html = buildWebUiHtml();
    expect(html).toContain("/api/config");
    expect(html).toContain("/api/tasks/");
    expect(html).toContain("/api/metrics/overview");
    expect(html).toContain("/api/metrics/agents");
    // runtime control uses dynamic path: '/api/runtime/' + cmd
    expect(html).toContain("/api/runtime/");
    expect(html).toContain("/api/command");
  });
});
