import type { ProviderListResponse } from "@opencode-ai/sdk";

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

export type ArchitectureDiffFileStatus = "added" | "removed" | "modified" | "unchanged";

export type ArchitectureDiffEdgeStatus = "added" | "removed" | "unchanged";

export type ArchitectureDiffFile = {
  file: string;
  status: ArchitectureDiffFileStatus;
};

export type ArchitectureDiffEdge = {
  fromFile: string;
  toFile: string;
  status: ArchitectureDiffEdgeStatus;
};

export type ArchitectureDiff = {
  addedEdgeCount: number;
  addedFileCount: number;
  edges: ArchitectureDiffEdge[];
  files: ArchitectureDiffFile[];
  removedEdgeCount: number;
  removedFileCount: number;
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
