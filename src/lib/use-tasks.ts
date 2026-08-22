import { useQuery } from "@tanstack/react-query";
import { isTaskRunning } from "@/lib/task";
import { listTasks } from "@/server/functions/tasks";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function useTasks(refetchIntervalMs?: number) {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => listTasks(),
    refetchInterval: (query) => {
      if (refetchIntervalMs !== undefined) {
        return refetchIntervalMs;
      }

      const tasks = query.state.data;
      return tasks?.some((task) => isTaskRunning(task.execution)) ? 3_000 : false;
    },
  });
}
