import { invoke } from "@tauri-apps/api/core";

export async function createDesktopRunnerSession(
  title: string,
  repoUrl: string,
): Promise<{ runnerType: string; sessionId: string; workspaceDirectory: string }> {
  return await invoke<{ runnerType: string; sessionId: string; workspaceDirectory: string }>(
    "create_runner_session",
    {
      repoUrl,
      title,
    },
  );
}

export async function promptDesktopRunnerTask(args: {
  backendBaseUrl: string;
  callbackToken: string;
  directory: string;
  executionId: string;
  prompt: string;
  sessionId: string;
}): Promise<void> {
  await invoke("prompt_runner_task", {
    backendBaseUrl: args.backendBaseUrl,
    callbackToken: args.callbackToken,
    directory: args.directory,
    executionId: args.executionId,
    prompt: args.prompt,
    sessionId: args.sessionId,
  });
}
