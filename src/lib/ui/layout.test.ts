import { describe, expect, it } from "vitest";
import { buildHeader, buildMainLayout, buildSidebar } from "./layout.js";

describe("lib/ui/layout", () => {
  it("builds a sidebar with operational navigation and utility links", () => {
    const sidebar = buildSidebar();
    expect(sidebar).toContain('id="app-sidebar"');
    expect(sidebar).toContain('data-view="overview"');
    expect(sidebar).toContain('data-view="board"');
    expect(sidebar).toContain('data-view="review"');
    expect(sidebar).toContain('data-view="live"');
    expect(sidebar).toContain('data-view="tasks"');
    expect(sidebar).toContain("Settings");
    expect(sidebar).toContain("Integrations");
    expect(sidebar).toContain("Profile");
    expect(sidebar).toContain('data-theme-option="system"');
    expect(sidebar).toContain('data-sidebar-close');
  });

  it("builds a compact runtime header with search and status zones", () => {
    const header = buildHeader();
    expect(header).toContain("app-header");
    expect(header).toContain('id="header-screen-title"');
    expect(header).toContain('id="react-header-search-root"');
    expect(header).toContain('id="header-search-fallback"');
    expect(header).toContain('id="global-search-input"');
    expect(header).toContain('id="connectivity-indicator"');
    expect(header).toContain('id="header-notif-count"');
    expect(header).toContain('id="runtime-status-pill"');
    expect(header).toContain('data-sidebar-toggle');
  });

  it("wraps header and sidebar in the main app shell", () => {
    const html = buildMainLayout({ sidebar: "<aside>Side</aside>", header: "<header>Head</header>", content: "<div>Body</div>" });
    expect(html).toContain('data-app-shell');
    expect(html).toContain('class="workspace-scroll"');
    expect(html).toContain('data-sidebar-close');
    expect(html).toContain("<aside>Side</aside>");
    expect(html).toContain("<header>Head</header>");
    expect(html).toContain("<div>Body</div>");
  });
});
