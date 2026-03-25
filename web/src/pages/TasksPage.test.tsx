import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TaskSummary } from "../types.js";

vi.mock("../api/tasks.js", () => ({
  fetchTasks:  vi.fn().mockResolvedValue([]),
  approveTask: vi.fn().mockResolvedValue(undefined),
  reproveTask: vi.fn().mockResolvedValue(undefined),
  cancelTask:  vi.fn().mockResolvedValue(undefined),
}));

// Mutable SSE status controlled per test
const sseStatus = { connected: true, reconnectIn: null as number | null, reconnect: vi.fn() };
vi.mock("../api/stream.js", () => ({
  useStreamTaskUpdates: () => sseStatus,
}));

import { fetchTasks, reproveTask } from "../api/tasks.js";
import { TasksPage } from "./TasksPage.js";

const waitingTask: TaskSummary = {
  taskId: "t-1",
  title: "Review this feature",
  type: "Feature",
  status: "waiting_human",
  project: "core",
  currentAgent: "Synx QA Engineer",
  nextAgent: "",
  humanApprovalRequired: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  rootProjectId: "",
  sourceKind: "standalone",
  history: [],
};

describe("TasksPage", () => {
  beforeEach(() => {
    sseStatus.connected = true;
    sseStatus.reconnectIn = null;
  });

  it("reprove button opens the modal and calls reproveTask with the typed reason", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([waitingTask]);
    render(<TasksPage />);

    await screen.findByText("Review this feature");
    await userEvent.click(screen.getByRole("button", { name: /✗ reprove/i }));

    expect(screen.getByText("Reprove task")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Reason for reproval (optional)"), "needs rework");
    // Click the modal's confirm button (exact name "Reprove", not "✗ Reprove")
    await userEvent.click(screen.getByRole("button", { name: "Reprove" }));

    expect(reproveTask).toHaveBeenCalledWith("t-1", "needs rework");
  });

  it("shows DisconnectedBanner with countdown when SSE is not connected", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([]);
    sseStatus.connected = false;
    sseStatus.reconnectIn = 5;

    render(<TasksPage />);

    expect(screen.getByText(/Real-time disconnected/)).toBeInTheDocument();
    expect(screen.getByText(/reconnecting in 5s/i)).toBeInTheDocument();
  });
});
