import { describe, expect, it } from "vitest";
import { buildWebUiHtml } from "./web-app.js";

describe("lib/ui/web-app", () => {
  it("renders phase 1 dashboard sections", () => {
    const html = buildWebUiHtml();
    expect(html).toContain("SYNX Web Observability");
    expect(html).toContain('data-view="overview"');
    expect(html).toContain('data-view="tasks"');
    expect(html).toContain('data-view="review"');
    expect(html).toContain('data-view="detail"');
    expect(html).toContain("/api/overview");
    expect(html).toContain("setInterval(render, state.pollMs)");
  });
});
