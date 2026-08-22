import { useQuery } from "@tanstack/react-query";
import { listTaskMessages } from "@/server/functions/tasks";

export function taskMessagesQueryKey(taskId: string) {
  return ["task-messages", taskId] as const;
}

export function useTaskMessages(taskId: string) {
  return useQuery({
    queryKey: taskMessagesQueryKey(taskId),
    queryFn: () => listTaskMessages({ data: { taskId } }),
  });
}
