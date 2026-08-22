import type { ListOpencodeModelsResponse } from "./runner-protocol.js";

export type DesktopWorkspaceEditor = "cursor" | "vscode" | "zed";

export type CreateDesktopRunnerSessionResponse = {
  runnerType: string;
  sessionId: string;
  workspaceDirectory: string;
};

export type DesktopRunnerModelSelection = {
  model: string;
  provider: string;
};

export type ListDesktopRunnerModelsResponse = ListOpencodeModelsResponse;
