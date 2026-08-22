import type { ArchitectureDiff } from "./architecture-diff.js";

export const LOCAL_RUNNER_PROTOCOL_VERSION = "v1alpha1";

export type LocalRunnerHealthResponse = {
  ok: true;
};

export type LocalRunnerInfoResponse = {
  capabilities: {
    workspaces: true;
  };
  protocolVersion: typeof LOCAL_RUNNER_PROTOCOL_VERSION;
  runnerType: "local-worktree";
};

export type ListOpencodeModelsRequest = {
  directory: string;
};

export type OpencodeModel = {
  id: string;
  name: string;
};

export type OpencodeModelProvider = {
  id: string;
  models: Record<string, OpencodeModel>;
  name: string;
};

export type ListOpencodeModelsResponse = {
  connected: string[];
  default: Record<string, string>;
  providers: OpencodeModelProvider[];
};

export type CreateAssistantSessionRequest = {
  repoUrl: string;
  taskTitle: string;
};

export type CreateAssistantSessionResponse = {
  sessionId: string;
  workspaceDirectory: string;
};

export type GetAssistantSessionArchitectureDiffRequest = {
  directory: string;
};

export type GetAssistantSessionArchitectureDiffResponse = ArchitectureDiff;

export type DeleteWorkspaceRequest = {
  workspaceDirectory: string;
};

export type DeleteWorkspaceResponse = {
  ok: true;
};
