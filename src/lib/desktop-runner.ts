type CreateDesktopRunnerSessionResponse = {
  runnerType: string;
  sessionId: string;
  workspaceDirectory: string;
};

export type DesktopWorkspaceEditor = "cursor" | "vscode" | "zed";

export type DesktopRunnerModelSelection = {
  model: string;
  provider: string;
};

export type DesktopRunnerModelProvider = {
  id: string;
  models: Record<string, { id: string; name: string }>;
  name: string;
};

export type ListDesktopRunnerModelsResponse = {
  connected: string[];
  default: Record<string, string>;
  providers: DesktopRunnerModelProvider[];
};

type DesktopRunnerBridge = {
  createRunnerSession: (
    title: string,
    repoUrl: string,
  ) => Promise<CreateDesktopRunnerSessionResponse>;
  deleteRunnerWorkspace: (workspaceDirectory: string) => Promise<void>;
  listRunnerModels: (args: { directory: string }) => Promise<ListDesktopRunnerModelsResponse>;
  openWorkspaceInEditor: (args: {
    editor: DesktopWorkspaceEditor;
    workspaceDirectory: string;
  }) => Promise<void>;
  promptRunnerTask: (args: {
    backendBaseUrl: string;
    callbackToken: string;
    directory: string;
    executionId: string;
    model?: string;
    prompt: string;
    provider?: string;
    sessionId: string;
  }) => Promise<void>;
};

declare global {
  interface Window {
    clankiDesktop?: DesktopRunnerBridge;
  }
}

function getDesktopRunnerBridge(): DesktopRunnerBridge {
  if (typeof window === "undefined" || !window.clankiDesktop) {
    throw new Error("The desktop runner API is only available in the Electron app.");
  }

  return window.clankiDesktop;
}

export async function createDesktopRunnerSession(
  title: string,
  repoUrl: string,
): Promise<{ runnerType: string; sessionId: string; workspaceDirectory: string }> {
  return await getDesktopRunnerBridge().createRunnerSession(title, repoUrl);
}

export async function deleteDesktopRunnerWorkspace(workspaceDirectory: string): Promise<void> {
  await getDesktopRunnerBridge().deleteRunnerWorkspace(workspaceDirectory);
}

export async function listDesktopRunnerModels(args: {
  directory: string;
}): Promise<ListDesktopRunnerModelsResponse> {
  return await getDesktopRunnerBridge().listRunnerModels(args);
}

export async function openDesktopWorkspaceInEditor(args: {
  editor: DesktopWorkspaceEditor;
  workspaceDirectory: string;
}): Promise<void> {
  await getDesktopRunnerBridge().openWorkspaceInEditor(args);
}

export async function promptDesktopRunnerTask(args: {
  backendBaseUrl: string;
  callbackToken: string;
  directory: string;
  executionId: string;
  model?: string;
  prompt: string;
  provider?: string;
  sessionId: string;
}): Promise<void> {
  await getDesktopRunnerBridge().promptRunnerTask(args);
}
