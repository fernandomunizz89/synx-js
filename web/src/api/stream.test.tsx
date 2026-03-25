import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useStream, useStreamTaskUpdates } from "./stream.js";

// ── Minimal EventSource mock ───────────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  private _listeners = new Map<string, Array<(e: Event) => void>>();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: Event) => void) {
    this._listeners.set(type, [...(this._listeners.get(type) ?? []), fn]);
  }

  fire(type: string, data: string) {
    const evt = new MessageEvent(type, { data });
    this._listeners.get(type)?.forEach((fn) => fn(evt));
    if (type === "message") this.onmessage?.(evt);
  }

  close() {}
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── useStream ─────────────────────────────────────────────────────────────────

describe("useStream", () => {
  it("starts disconnected with no events", () => {
    function Fixture() {
      const { connected, events } = useStream();
      return <div>{connected ? "yes" : "no"}-{events.length}</div>;
    }
    render(<Fixture />);
    expect(screen.getByText("no-0")).toBeInTheDocument();
  });

  it("sets connected=true when EventSource opens", async () => {
    function Fixture() {
      const { connected } = useStream();
      return <div>{connected ? "connected" : "disconnected"}</div>;
    }
    render(<Fixture />);
    await act(async () => { MockEventSource.instances[0]?.onopen?.(); });
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("parses onmessage data and adds to events array", async () => {
    function Fixture() {
      const { events } = useStream();
      return <div>{events[0]?.type ?? "empty"}</div>;
    }
    render(<Fixture />);
    await act(async () => {
      MockEventSource.instances[0]?.fire("message", JSON.stringify({
        id: 1, type: "task.created", at: new Date().toISOString(), payload: {},
      }));
    });
    expect(screen.getByText("task.created")).toBeInTheDocument();
  });
});

  it("sets connected=false and schedules reconnect on onerror", async () => {
    vi.useFakeTimers();
    function Fixture() {
      const { connected, reconnectIn } = useStream();
      return <div>{connected ? "up" : `down-${reconnectIn}`}</div>;
    }
    render(<Fixture />);

    await act(async () => { MockEventSource.instances[0]?.onopen?.(); });
    expect(screen.getByText("up")).toBeInTheDocument();

    await act(async () => { MockEventSource.instances[0]?.onerror?.(); });
    expect(screen.getByText("down-1")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("reconnects automatically after the backoff delay", async () => {
    vi.useFakeTimers();
    function Fixture() {
      const { connected } = useStream();
      return <div>{connected ? "up" : "down"}</div>;
    }
    render(<Fixture />);

    await act(async () => { MockEventSource.instances[0]?.onerror?.(); });
    const countBefore = MockEventSource.instances.length;

    // Advance past the 1 s initial backoff — triggers the countdown ticks and retry
    await act(async () => { vi.advanceTimersByTime(1_100); });
    expect(MockEventSource.instances.length).toBeGreaterThan(countBefore);

    vi.useRealTimers();
  });

// ── useStreamTaskUpdates ──────────────────────────────────────────────────────

describe("useStreamTaskUpdates", () => {
  it("calls onUpdate when a task event is fired", async () => {
    const onUpdate = vi.fn();
    function Fixture() {
      useStreamTaskUpdates(onUpdate);
      return null;
    }
    render(<Fixture />);
    await act(async () => {
      MockEventSource.instances[0]?.fire("task.updated", "{}");
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
