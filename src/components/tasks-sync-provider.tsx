import { useEffect, useMemo, type ReactNode } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscribeTaskEventStream } from "@/lib/subscribe-task-event-stream";
import { taskMessagesQueryKey } from "@/lib/use-task-messages";
import { TASKS_POLL_INTERVAL_MS, tasksQueryOptions } from "@/lib/use-tasks";
import { listTaskMessages } from "@/server/functions/tasks";

const RUNNING_TASK_MESSAGES_POLL_INTERVAL_MS = 2_000;

function getRunningTaskIds(tasks: Array<{ id: string; status: string }>): string[] {
  return tasks.filter((task) => task.status === "running").map((task) => task.id);
}

export function TasksSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery({
    ...tasksQueryOptions(),
    refetchInterval: (query) => {
      const currentTasks = query.state.data;
      if (!currentTasks?.some((task) => task.status === "running")) {
        return false;
      }

      return TASKS_POLL_INTERVAL_MS;
    },
  });

  const runningTaskIdsKey = useMemo(() => getRunningTaskIds(tasks).toSorted().join("\0"), [tasks]);

  useQueries({
    queries: (runningTaskIdsKey.length > 0 ? runningTaskIdsKey.split("\0") : []).map((taskId) => ({
      queryKey: taskMessagesQueryKey(taskId),
      queryFn: () => listTaskMessages({ data: { taskId } }),
      refetchInterval: RUNNING_TASK_MESSAGES_POLL_INTERVAL_MS,
    })),
  });

  useEffect(() => {
    const runningTaskIds = runningTaskIdsKey.length > 0 ? runningTaskIdsKey.split("\0") : [];
    const unsubscribes = runningTaskIds.map((taskId) =>
      subscribeTaskEventStream({ queryClient, taskId }),
    );

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [queryClient, runningTaskIdsKey]);

  return children;
}
