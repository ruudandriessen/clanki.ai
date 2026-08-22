export type TaskExecutionState =
  | { kind: "running" }
  | { kind: "blocked"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "idle" };

export type Task = {
  id: string;
  project_id: string | null;
  title: string;
  execution: TaskExecutionState;
  runner_type: string | null;
  runner_session_id: string | null;
  workspace_path: string | null;
  branch: string | null;
  created_at: number;
  updated_at: number;
};

export function isTaskRunning(execution: TaskExecutionState): boolean {
  return execution.kind === "running";
}

export function taskExecutionMessage(execution: TaskExecutionState): string | null {
  if (execution.kind === "blocked" || execution.kind === "failed") {
    return execution.message;
  }

  return null;
}

export function taskNeedsAction(execution: TaskExecutionState): boolean {
  return execution.kind === "blocked" || execution.kind === "failed";
}
