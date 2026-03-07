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

export type PromptAssistantSessionRequest = {
  directory: string;
  prompt: string;
  sessionId: string;
};

export type PromptAssistantSessionResponse = {
  ok: true;
};
