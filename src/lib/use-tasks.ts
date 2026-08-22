import { useQuery } from "@tanstack/react-query";
import { listTasks } from "@/server/functions/tasks";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function useTasks(refetchIntervalMs?: number) {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => listTasks(),
    refetchInterval: refetchIntervalMs,
  });
}
