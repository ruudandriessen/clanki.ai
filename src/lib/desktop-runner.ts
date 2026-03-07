import { invoke } from "@tauri-apps/api/core";
import type { RunnerSessionsPayload } from "@/shared/runner-session";

export async function listDesktopRunnerSessions(repoUrl: string): Promise<RunnerSessionsPayload> {
  return await invoke<RunnerSessionsPayload>("list_runner_sessions", { repoUrl });
}

export async function createDesktopRunnerSession(
  title: string,
  repoUrl: string,
): Promise<{ sessionId: string }> {
  return await invoke<{ sessionId: string }>("create_runner_session", {
    repoUrl,
    title,
  });
}
