export type Task = {
  id: string;
  project_id: string | null;
  title: string;
  status: string;
  runner_type: string | null;
  runner_session_id: string | null;
  workspace_path: string | null;
  branch: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};
