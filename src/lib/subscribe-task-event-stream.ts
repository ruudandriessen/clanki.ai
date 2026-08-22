import type { QueryClient } from "@tanstack/react-query";
import type { TaskStreamEvent } from "@/shared/task-stream-events";
import { appendTaskStreamEvent, taskEventsQueryKey } from "@/lib/task-events-query";

function getTaskEventStreamUrl(taskId: string) {
  return `${globalThis.location.origin}/api/tasks/${taskId}/stream`;
}

function handleTaskEventStreamError() {
  console.error("Failed to subscribe to task stream");
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

export function subscribeTaskEventStream(args: {
  queryClient: QueryClient;
  taskId: string;
}): () => void {
  const eventSource = new EventSource(getTaskEventStreamUrl(args.taskId));

  function handleMessage(message: MessageEvent<string>) {
    try {
      const parsed = JSON.parse(message.data) as unknown;
      if (!isTaskStreamEvent(parsed)) {
        return;
      }

      args.queryClient.setQueryData(
        taskEventsQueryKey(args.taskId),
        (currentEvents: TaskStreamEvent[] | undefined) =>
          appendTaskStreamEvent(currentEvents, parsed),
      );
    } catch {
      console.error("Failed to parse task stream event");
    }
  }

  eventSource.addEventListener("message", handleMessage);
  eventSource.addEventListener("error", handleTaskEventStreamError);

  return () => {
    eventSource.removeEventListener("message", handleMessage);
    eventSource.removeEventListener("error", handleError);
    eventSource.close();
  };
}
