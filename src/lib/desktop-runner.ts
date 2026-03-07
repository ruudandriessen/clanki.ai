import { invoke } from "@tauri-apps/api/core";
import type { RunnerSessionsPayload } from "@/shared/runner-session";

async function getRunnerBaseUrl(): Promise<string> {
  return await invoke<string>("ensure_runner");
}

export async function listDesktopRunnerSessions(repoUrl: string): Promise<RunnerSessionsPayload> {
  const baseUrl = await getRunnerBaseUrl();
  const response = await fetch(
    `${baseUrl}/repo/sessions?${new URLSearchParams({ repoUrl }).toString()}`,
  );
  return parseRunnerResponse<RunnerSessionsPayload>(response);
}

export async function createDesktopRunnerSession(
  title: string,
  repoUrl: string,
): Promise<{ sessionId: string }> {
  const baseUrl = await getRunnerBaseUrl();
  const response = await fetch(`${baseUrl}/repo/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, title }),
  });
  return parseRunnerResponse<{ sessionId: string }>(response);
}

async function parseRunnerResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body =
    text.trim().length > 0 ? (JSON.parse(text) as T | { error: string }) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return body as T;
}
