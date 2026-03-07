import type { ProviderListResponse } from "@opencode-ai/sdk";

export const LOCAL_RUNNER_PROTOCOL_VERSION = "v1alpha1";

export type LocalRunnerHealthResponse = {
  ok: true;
};

export type LocalRunnerInfoResponse = {
  capabilities: {
    assistantSessions: true;
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

export type EnsureAssistantSessionRequest = {
  directory: string;
  model: string;
  provider: string;
  sessionId?: string | null;
  taskTitle: string;
};

export type EnsureAssistantSessionResponse = {
  isNewSession: boolean;
  sessionId: string;
};

export type AssistantSessionSummary = {
  createdAt: number;
  directory: string;
  id: string;
  title: string;
  updatedAt: number;
};

export type ListAssistantSessionsRequest = {
  directory: string;
};

export type ListAssistantSessionsResponse = {
  sessions: AssistantSessionSummary[];
};

export type PromptAssistantSessionRequest = {
  directory: string;
  prompt: string;
  sessionId: string;
};

export type PromptAssistantSessionResponse = {
  ok: true;
};

export type PromptTaskAssistantSessionRequest = {
  directory: string;
  prompt: string;
  sessionId: string;
  taskRun: {
    backendBaseUrl: string;
    callbackToken: string;
    executionId: string;
  };
};

export type PromptTaskAssistantSessionResponse = {
  ok: true;
};
