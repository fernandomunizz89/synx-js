import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../types.js";

const MAX_EVENTS = 200;

export function useStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as StreamEvent;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed events
      }
    };

    // Named event types
    const eventTypes = [
      "runtime.updated",
      "task.updated",
      "task.created",
      "task.conflict_blocked",
      "stage.started",
      "stage.completed",
      "stage.failed",
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        try {
          const event = JSON.parse((e as MessageEvent).data as string) as StreamEvent;
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        } catch {
          // ignore
        }
      });
    }

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { events, connected };
}

export function useStreamTaskUpdates(onUpdate: () => void) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    const handler = () => onUpdate();
    es.addEventListener("task.updated", handler);
    es.addEventListener("task.created", handler);
    es.addEventListener("stage.completed", handler);
    es.addEventListener("stage.failed", handler);

    return () => es.close();
  }, [onUpdate]);
}
