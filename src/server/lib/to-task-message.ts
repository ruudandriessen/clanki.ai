import type { TaskMessage } from "@/lib/task-message";
import type { taskMessages } from "../db/schema";

export function toTaskMessage(row: typeof taskMessages.$inferSelect): TaskMessage {
  return {
    id: row.id,
    task_id: row.taskId,
    role: row.role,
    content: row.content,
    created_at: row.createdAt,
  };
}
