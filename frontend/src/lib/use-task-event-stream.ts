import { useEffect, useState } from "react";
import { stream } from "@durable-streams/client";
import type { TaskStreamEvent } from "../../../shared/task-stream-events";
import { getTaskEventStreamUrl } from "./api";
import { readTaskStreamCache, writeTaskStreamCache } from "./task-stream-cache";

const STREAM_STORAGE_PREFIX = "task-event-stream";
const MAX_PERSISTED_EVENTS = 1_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function appendUniqueEvents(
  previousEvents: TaskStreamEvent[],
  nextEvents: readonly TaskStreamEvent[],
): TaskStreamEvent[] {
  if (nextEvents.length === 0) {
    return previousEvents;
  }

  const seenEventIds = new Set(previousEvents.map((event) => event.id));
  const mergedEvents = [...previousEvents];
  let didAddEvent = false;

  for (const event of nextEvents) {
    if (seenEventIds.has(event.id)) {
      continue;
    }

    seenEventIds.add(event.id);
    mergedEvents.push(event);
    didAddEvent = true;
  }

  return didAddEvent ? mergedEvents : previousEvents;
}

function getTaskStreamStorageKey(taskId: string, streamId: string): string {
  return `${STREAM_STORAGE_PREFIX}:${taskId}:${streamId}`;
}

function trimPersistedEvents(events: TaskStreamEvent[]): TaskStreamEvent[] {
  if (events.length <= MAX_PERSISTED_EVENTS) {
    return events;
  }

  return events.slice(events.length - MAX_PERSISTED_EVENTS);
}

function parsePersistedEvents(value: unknown): TaskStreamEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isTaskStreamEvent);
}

function isTaskStreamEvent(value: unknown): value is TaskStreamEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.taskId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.kind === "string" &&
    typeof candidate.payload === "string"
  );
}

function extractBatchItems(value: unknown): readonly TaskStreamEvent[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  const parsedItems = parsePersistedEvents(candidate.items);
  return parsedItems;
}

function extractBatchOffset(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.offset === "string" && candidate.offset.length > 0) {
    return candidate.offset;
  }

  return null;
}

function isLikelyDurableStreamOffset(value: string): boolean {
  if (value === "-1" || value === "now") {
    return true;
  }

  return value.includes("_");
}

interface UseTaskEventStreamArgs {
  taskId: string;
  streamId: string | null;
}

export function useTaskEventStream(args: UseTaskEventStreamArgs): TaskStreamEvent[] {
  const { taskId, streamId } = args;
  const [runEvents, setRunEvents] = useState<TaskStreamEvent[]>([]);

  useEffect(() => {
    if (!streamId) {
      return;
    }

    const storageKey = getTaskStreamStorageKey(taskId, streamId);
    const abortController = new AbortController();
    setRunEvents([]);

    async function connect(): Promise<void> {
      const persisted = await readTaskStreamCache(storageKey);
      if (abortController.signal.aborted) {
        return;
      }

      let latestOffset = persisted.offset;
      if (latestOffset !== null && !isLikelyDurableStreamOffset(latestOffset)) {
        latestOffset = null;
        void writeTaskStreamCache(storageKey, null, persisted.events);
      }
      setRunEvents(trimPersistedEvents(persisted.events));

      try {
        const streamUrl = getTaskEventStreamUrl(taskId);
        const res = await stream<TaskStreamEvent>({
          url: streamUrl,
          offset: latestOffset ?? "-1",
          live: "sse",
          json: true,
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        res.subscribeJson((batch) => {
          const items = extractBatchItems(batch);
          const batchOffset = extractBatchOffset(batch);
          if (batchOffset !== null && isLikelyDurableStreamOffset(batchOffset)) {
            latestOffset = batchOffset;
          }

          setRunEvents((previousEvents) => {
            const mergedEvents = appendUniqueEvents(previousEvents, items);
            const trimmedEvents = trimPersistedEvents(mergedEvents);
            void writeTaskStreamCache(storageKey, latestOffset, trimmedEvents);
            return trimmedEvents;
          });
        });
      } catch (error: unknown) {
        if (isAbortError(error)) {
          return;
        }

        console.error("Failed to subscribe to task stream", error);
      }
    }

    void connect();

    return () => {
      abortController.abort();
    };
  }, [taskId, streamId]);

  useEffect(() => {
    if (streamId) {
      return;
    }

    setRunEvents([]);
  }, [taskId, streamId]);

  return runEvents;
}
