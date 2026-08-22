import type { Task } from "@/lib/task";
import type { tasks } from "../db/schema";

export function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    status: row.status,
    runner_type: row.runnerType,
    runner_session_id: row.runnerSessionId,
    workspace_path: row.workspacePath,
    branch: row.branch,
    error: row.error,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
