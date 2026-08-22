import type {
  ArchitectureDiff,
  CreateDesktopRunnerSessionResponse,
  DesktopWorkspaceEditor,
} from "@clanki/protocol";

export type {
  DesktopRunnerModelSelection,
  DesktopWorkspaceEditor,
  ListDesktopRunnerModelsResponse,
} from "@clanki/protocol";

type DesktopRunnerBridge = {
  createRunnerSession: (
    title: string,
    repoUrl: string,
  ) => Promise<CreateDesktopRunnerSessionResponse>;
  deleteRunnerWorkspace: (workspaceDirectory: string) => Promise<void>;
  getRunnerArchitectureDiff: (args: { directory: string }) => Promise<ArchitectureDiff>;
  openWorkspaceInEditor: (args: {
    editor: DesktopWorkspaceEditor;
    workspaceDirectory: string;
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
): Promise<CreateDesktopRunnerSessionResponse> {
  return await getDesktopRunnerBridge().createRunnerSession(title, repoUrl);
}

export async function deleteDesktopRunnerWorkspace(workspaceDirectory: string): Promise<void> {
  await getDesktopRunnerBridge().deleteRunnerWorkspace(workspaceDirectory);
}

export async function getDesktopRunnerArchitectureDiff(args: {
  directory: string;
}): Promise<ArchitectureDiff> {
  return await getDesktopRunnerBridge().getRunnerArchitectureDiff(args);
}

export async function openDesktopWorkspaceInEditor(args: {
  editor: DesktopWorkspaceEditor;
  workspaceDirectory: string;
}): Promise<void> {
  await getDesktopRunnerBridge().openWorkspaceInEditor(args);
}
