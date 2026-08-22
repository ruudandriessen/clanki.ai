import { queryOptions, useQuery } from "@tanstack/react-query";
import { listTasks } from "@/server/functions/tasks";

export const TASKS_QUERY_KEY = ["tasks"] as const;
export const TASKS_POLL_INTERVAL_MS = 2_000;

export function tasksQueryOptions() {
  return queryOptions({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => listTasks(),
  });
}

export function useTasks() {
  return useQuery(tasksQueryOptions());
}
