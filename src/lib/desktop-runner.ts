type CreateDesktopRunnerSessionResponse = {
  runnerType: string;
  sessionId: string;
  workspaceDirectory: string;
};

type DesktopRunnerBridge = {
  createRunnerSession: (
    title: string,
    repoUrl: string,
  ) => Promise<CreateDesktopRunnerSessionResponse>;
  deleteRunnerWorkspace: (workspaceDirectory: string) => Promise<void>;
  promptRunnerTask: (args: {
    backendBaseUrl: string;
    callbackToken: string;
    directory: string;
    executionId: string;
    prompt: string;
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

export async function promptDesktopRunnerTask(args: {
  backendBaseUrl: string;
  callbackToken: string;
  directory: string;
  executionId: string;
  prompt: string;
  sessionId: string;
}): Promise<void> {
  await getDesktopRunnerBridge().promptRunnerTask(args);
}
