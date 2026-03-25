import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StreamEvent } from "../types.js";

// Mutable state controlled per test
const streamState = {
  events: [] as StreamEvent[],
  connected: true,
  reconnectIn: null as number | null,
  reconnect: vi.fn(),
};

vi.mock("../api/stream.js", () => ({
  useStream: () => streamState,
}));

import { StreamPage } from "./StreamPage.js";

describe("StreamPage", () => {
  it("renders the event type and payload message for each SSE event", () => {
    streamState.connected = true;
    streamState.events = [
      { id: 1, type: "stage.completed", at: new Date().toISOString(), payload: { message: "QA passed" } },
      { id: 2, type: "task.created",    at: new Date().toISOString(), payload: { message: "new task"  } },
    ];

    render(<StreamPage />);

    expect(screen.getByText("stage.completed")).toBeInTheDocument();
    expect(screen.getByText("QA passed")).toBeInTheDocument();
    expect(screen.getByText("task.created")).toBeInTheDocument();
    expect(screen.getByText("new task")).toBeInTheDocument();
  });

  it("shows Reconnecting when the SSE connection is down", () => {
    streamState.connected = false;
    streamState.events = [];

    render(<StreamPage />);

    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    expect(screen.queryByText(/connected to event stream/i)).not.toBeInTheDocument();
  });
});
