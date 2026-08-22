import type { Task } from "@/lib/task";
import type { TaskThreadState } from "@/server/lib/task-thread-state";
import type { tasks } from "../db/schema";

export function toTask(
  row: typeof tasks.$inferSelect,
  threadState: TaskThreadState = { isRunning: false, chatError: null },
): Task {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    status: row.status,
    is_running: threadState.isRunning,
    runner_type: row.runnerType,
    runner_session_id: row.runnerSessionId,
    workspace_path: row.workspacePath,
    branch: row.branch,
    error: row.error ?? threadState.chatError,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
