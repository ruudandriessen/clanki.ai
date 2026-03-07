export type RunnerSessionSummary = {
  createdAt: number;
  directory: string;
  id: string;
  title: string;
  updatedAt: number;
};

export type RunnerSessionsPayload = {
  sessions: RunnerSessionSummary[];
  workspaceDirectory: string;
};
