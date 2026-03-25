import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./pages/TasksPage.js",   () => ({ TasksPage:   () => <div>tasks-page</div>   }));
vi.mock("./pages/KanbanPage.js",  () => ({ KanbanPage:  () => <div>kanban-page</div>  }));
vi.mock("./pages/StreamPage.js",  () => ({ StreamPage:  () => <div>stream-page</div>  }));
vi.mock("./pages/MetricsPage.js", () => ({ MetricsPage: () => <div>metrics-page</div> }));
vi.mock("./api/tasks.js", () => ({
  fetchOverview: vi.fn().mockResolvedValue({ runtime: { status: "idle" } }),
  fetchTasks:    vi.fn().mockResolvedValue([]),
}));
vi.mock("./components/layout/Header.js",  () => ({ Header:  () => <div /> }));
vi.mock("./components/layout/TabBar.js",  () => ({
  TabBar: ({ active, onChange }: { active: string; onChange: (t: string) => void }) => (
    <nav>
      <span data-testid="active-tab">{active}</span>
      {(["tasks", "kanban", "metrics", "stream"] as const).map((t) => (
        <button key={t} onClick={() => onChange(t)}>{t}</button>
      ))}
    </nav>
  ),
}));

import { App } from "./App.js";

describe("App — hash-based tab navigation", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("reads the initial active tab from location.hash on mount", () => {
    window.location.hash = "#kanban";
    render(<App />);
    expect(screen.getByTestId("active-tab")).toHaveTextContent("kanban");
  });

  it("updates location.hash when a tab is selected", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "metrics" }));
    expect(window.location.hash).toBe("#metrics");
    expect(screen.getByTestId("active-tab")).toHaveTextContent("metrics");
  });
});
