import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../types.js";

const MAX_EVENTS = 200;
const BACKOFF_INIT = 1_000;
const BACKOFF_MAX = 30_000;

const TASK_EVENT_TYPES = [
  "task.updated",
  "task.created",
  "stage.completed",
  "stage.failed",
] as const;

const ALL_EVENT_TYPES = [
  "runtime.updated",
  "task.updated",
  "task.created",
  "task.conflict_blocked",
  "stage.started",
  "stage.completed",
  "stage.failed",
] as const;

export interface SSEStatus {
  connected: boolean;
  reconnectIn: number | null; // seconds until next attempt, null when connected
  reconnect: () => void;      // cancel pending timer and reconnect immediately
}

// ── Core reconnecting SSE hook ─────────────────────────────────────────────────
//
// `setup(es)` is called each time a new EventSource is created.
// It's stored in a ref so callers don't need to memoize it.
// The connection re-establishes automatically with exponential backoff on error.

function useReconnectingSSE(
  url: string,
  setup: (es: EventSource) => void,
): SSEStatus {
  const setupRef = useRef(setup);
  useEffect(() => { setupRef.current = setup; });

  const [connected, setConnected] = useState(false);
  const [reconnectIn, setReconnectIn] = useState<number | null>(null);

  // imperative reconnect trigger — set by the effect, called by the returned fn
  const reconnectNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let destroyed = false;
    let backoff = BACKOFF_INIT;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    function connect() {
      if (destroyed) return;

      const es = new EventSource(url);
      setupRef.current(es);

      es.onopen = () => {
        if (destroyed) { es.close(); return; }
        backoff = BACKOFF_INIT;
        setConnected(true);
        setReconnectIn(null);
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      };

      es.onerror = () => {
        es.close();
        if (destroyed) return;

        setConnected(false);
        reconnectNowRef.current = null;

        const delay = backoff;
        backoff = Math.min(backoff * 2, BACKOFF_MAX);

        let secs = Math.ceil(delay / 1000);
        setReconnectIn(secs);

        countdownTimer = setInterval(() => {
          secs -= 1;
          setReconnectIn(secs > 0 ? secs : null);
          if (secs <= 0) { clearInterval(countdownTimer!); countdownTimer = null; }
        }, 1_000);

        retryTimer = setTimeout(() => {
          if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
          retryTimer = null;
          connect();
        }, delay);

        // imperative early reconnect
        reconnectNowRef.current = () => {
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
          if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
          setReconnectIn(null);
          backoff = BACKOFF_INIT;
          connect();
        };
      };
    }

    connect();

    return () => {
      destroyed = true;
      reconnectNowRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, [url]);

  const reconnect = () => reconnectNowRef.current?.();

  return { connected, reconnectIn, reconnect };
}

// ── Public hooks ───────────────────────────────────────────────────────────────

export function useStream(): { events: StreamEvent[] } & SSEStatus {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  const status = useReconnectingSSE("/api/stream", (es) => {
    const push = (raw: string) => {
      try {
        const event = JSON.parse(raw) as StreamEvent;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch { /* ignore malformed */ }
    };

    es.onmessage = (e) => push(e.data as string);
    for (const type of ALL_EVENT_TYPES) {
      es.addEventListener(type, (e) => push((e as MessageEvent).data as string));
    }
  });

  return { events, ...status };
}

export function useStreamTaskUpdates(onUpdate: () => void): SSEStatus {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  return useReconnectingSSE("/api/stream", (es) => {
    const handler = () => onUpdateRef.current();
    for (const type of TASK_EVENT_TYPES) {
      es.addEventListener(type, handler);
    }
  });
}
