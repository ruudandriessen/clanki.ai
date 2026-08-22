import { useEffect, useState } from "react";
import type { TaskStreamEvent } from "@/shared/task-stream-events";

function getTaskEventStreamUrl(taskId: string) {
  return `${globalThis.location.origin}/api/tasks/${taskId}/stream`;
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

export function useTaskEventStream(taskId: string): TaskStreamEvent[] {
  const [runEvents, setRunEvents] = useState<TaskStreamEvent[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(getTaskEventStreamUrl(taskId));
    setRunEvents([]);

    function handleMessage(message: MessageEvent<string>) {
      try {
        const parsed = JSON.parse(message.data) as unknown;
        if (!isTaskStreamEvent(parsed)) {
          return;
        }

        setRunEvents((previousEvents) => {
          if (previousEvents.some((event) => event.id === parsed.id)) {
            return previousEvents;
          }

          return [...previousEvents, parsed];
        });
      } catch {
        console.error("Failed to parse task stream event");
      }
    }

    function handleError() {
      console.error("Failed to subscribe to task stream");
    }

    eventSource.addEventListener("message", handleMessage);
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("message", handleMessage);
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [taskId]);

  return runEvents;
}
