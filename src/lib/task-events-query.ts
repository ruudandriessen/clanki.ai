import type { TaskStreamEvent } from "@/shared/task-stream-events";

export function taskEventsQueryKey(taskId: string) {
  return ["task-events", taskId] as const;
}

export function appendTaskStreamEvent(
  currentEvents: TaskStreamEvent[] | undefined,
  event: TaskStreamEvent,
): TaskStreamEvent[] {
  const events = currentEvents ?? [];

  if (events.some((existingEvent) => existingEvent.id === event.id)) {
    return events;
  }

  return [...events, event];
}
