import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KanbanBoard } from "../types.js";

// Mock @dnd-kit/core — pointer events are not available in jsdom
vi.mock("@dnd-kit/core", () => ({
  DndContext:    ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay:   () => null,
  useDraggable:  () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable:  () => ({ isOver: false, setNodeRef: () => {} }),
  PointerSensor: class {},
  useSensor:     () => null,
  useSensors:    () => [],
}));

vi.mock("../api/tasks.js", () => ({
  fetchKanban: vi.fn(),
  approveTask: vi.fn().mockResolvedValue(undefined),
  reproveTask: vi.fn().mockResolvedValue(undefined),
  cancelTask:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../api/stream.js", () => ({
  useStreamTaskUpdates: () => ({ connected: true, reconnectIn: null, reconnect: vi.fn() }),
}));

import { fetchKanban, approveTask, reproveTask } from "../api/tasks.js";
import { KanbanPage } from "./KanbanPage.js";

const EMPTY_BOARD: KanbanBoard = {
  new: [], in_progress: [], waiting_agent: [],
  waiting_human: [], blocked: [], failed: [], done: [], archived: [],
};

const waitingCard = {
  taskId: "wh-1",
  title: "Waiting Human Task",
  type: "Feature" as const,
  status: "waiting_human" as const,
  project: "frontend",
  priority: 2,
  currentAgent: "Synx QA Engineer",
  humanApprovalRequired: true,
  sourceKind: "standalone" as const,
  childTaskIds: [],
  totalDurationMs: 5000,
  totalCostUsd: 0.01,
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("KanbanPage", () => {
  beforeEach(() => {
    vi.mocked(approveTask).mockResolvedValue(undefined);
    vi.mocked(fetchKanban).mockResolvedValue({ ...EMPTY_BOARD, waiting_human: [waitingCard] });
  });

  it("approve button calls approveTask with the correct taskId", async () => {
    render(<KanbanPage />);
    await screen.findByText("Waiting Human Task");
    await userEvent.click(screen.getByTitle("Approve"));
    expect(approveTask).toHaveBeenCalledWith("wh-1");
  });

  it("reprove button opens the modal and calls reproveTask on confirm", async () => {
    render(<KanbanPage />);
    await screen.findByText("Waiting Human Task");
    await userEvent.click(screen.getByTitle("Reprove"));
    expect(screen.getByText("Reprove task")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reprove", exact: true }));
    expect(reproveTask).toHaveBeenCalledWith("wh-1", "");
  });

  it("text filter hides cards that do not match the query", async () => {
    render(<KanbanPage />);
    await screen.findByText("Waiting Human Task");
    await userEvent.type(screen.getByPlaceholderText("Filter cards…"), "zzz-no-match");
    expect(screen.queryByText("Waiting Human Task")).not.toBeInTheDocument();
  });
});
