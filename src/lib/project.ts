export type Project = {
  id: string;
  name: string;
  repo_url: string;
  setup_command: string | null;
  run_command: string | null;
  run_port: number | null;
  created_at: number;
  updated_at: number;
};
