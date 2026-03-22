import { describe, expect, it } from "vitest";
import { buildWebUiHtml } from "./web-app.js";

describe("lib/ui/web-app", () => {
  it("renders core dashboard sections and actions", () => {
    const html = buildWebUiHtml();
    expect(html).toContain("SYNX Web Observability");
    expect(html).toContain('data-view="overview"');
    expect(html).toContain('data-view="tasks"');
    expect(html).toContain('data-view="review"');
    expect(html).toContain('data-view="detail"');
    expect(html).toContain('data-view="live"');
    expect(html).toContain('data-view="analytics"');
    expect(html).toContain("/api/overview");
    expect(html).toContain("/api/metrics/advanced");
    expect(html).toContain("setInterval(render, state.pollMs)");
    expect(html).toContain("/api/stream");
    expect(html).toContain("/approve");
    expect(html).toContain("/reprove");
    expect(html).toContain("/cancel");
    expect(html).toContain("/api/runtime/");
    expect(html).toContain("Cost Curve (30d)");
    expect(html).toContain("Token Curve (30d)");
    expect(html).toContain("Duration Curve (30d)");
  });

  it("includes phase 5 UX hardening markers for loading, accessibility, and retries", () => {
    const html = buildWebUiHtml();
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('id="content" role="region" aria-live="polite" aria-busy="false"');
    expect(html).toContain('id="feedback" class="feedback" role="status" aria-live="polite"');
    expect(html).toContain("showLoading(");
    expect(html).toContain("Loading task list...");
    expect(html).toContain('data-retry-render');
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('caption class="sr-only"');
    expect(html).toContain('class="chart-grid"');
    expect(html).toContain("renderCurveChart(");
    expect(html).toContain("@media (max-width: 940px)");
    expect(html).toContain("@media (max-width: 640px)");
  });
});
