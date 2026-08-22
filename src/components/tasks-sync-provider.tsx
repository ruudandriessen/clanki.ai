import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TASKS_POLL_INTERVAL_MS, tasksQueryOptions } from "@/lib/use-tasks";

export function TasksSyncProvider({ children }: { children: ReactNode }) {
  useQuery({
    ...tasksQueryOptions(),
    refetchInterval: (query) => {
      const currentTasks = query.state.data;
      if (!currentTasks?.some((task) => task.status === "running")) {
        return false;
      }

      return TASKS_POLL_INTERVAL_MS;
    },
  });

  return children;
}
