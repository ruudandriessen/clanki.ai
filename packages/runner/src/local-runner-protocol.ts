import type { FileDiff, ProviderListResponse } from "@opencode-ai/sdk";

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

export type LocalRunnerOpencodeProvider = ProviderListResponse["all"][number];

export type ListOpencodeModelsResponse = {
  connected: ProviderListResponse["connected"];
  default: ProviderListResponse["default"];
  providers: Array<LocalRunnerOpencodeProvider>;
};

export type CreateAssistantSessionRequest = {
  repoUrl: string;
  taskTitle: string;
};

export type CreateAssistantSessionResponse = {
  sessionId: string;
  workspaceDirectory: string;
};

export type GetAssistantSessionDiffRequest = {
  directory: string;
  messageId?: string;
  sessionId?: string;
};

export type GetAssistantSessionDiffResponse = {
  diffs: FileDiff[];
};

export type DeleteWorkspaceRequest = {
  workspaceDirectory: string;
};

export type DeleteWorkspaceResponse = {
  ok: true;
};
