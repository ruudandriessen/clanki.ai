import type { Task } from "@/lib/task";
import {
  loadTaskThreadSnapshots,
  resolveTaskExecutionState,
  type TaskThreadSnapshot,
} from "@/server/lib/task-thread-state";
import type { tasks } from "../db/schema";

export function toTask(
  row: typeof tasks.$inferSelect,
  threadSnapshot: TaskThreadSnapshot = { hasActiveRun: false, latestChatError: null },
): Task {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    execution: resolveTaskExecutionState({
      workspaceError: row.error,
      thread: threadSnapshot,
    }),
    runner_type: row.runnerType,
    runner_session_id: row.runnerSessionId,
    workspace_path: row.workspacePath,
    branch: row.branch,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export { loadTaskThreadSnapshots };
