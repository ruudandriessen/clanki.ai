import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskStreamEvent } from "@/shared/task-stream-events";
import { subscribeTaskEventStream } from "@/lib/subscribe-task-event-stream";
import { taskEventsQueryKey } from "@/lib/task-events-query";

export function useTaskEventStream(taskId: string, isRunning: boolean): TaskStreamEvent[] {
  const queryClient = useQueryClient();
  const { data: runEvents = [] } = useQuery({
    queryKey: taskEventsQueryKey(taskId),
    queryFn: () => [] as TaskStreamEvent[],
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (isRunning) {
      return;
    }

    return subscribeTaskEventStream({ queryClient, taskId });
  }, [isRunning, queryClient, taskId]);

  return runEvents;
}
