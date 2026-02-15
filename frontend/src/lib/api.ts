import type {
  GitHubRepo,
  Installation,
  ProviderCredentialStatus,
  ProviderOauthStart,
  TaskStreamEvent,
} from "../../../shared/orpc/contract";
import { apiClient } from "./orpc-client";

export type { Installation, GitHubRepo, TaskStreamEvent };

export function fetchInstallations() {
  return apiClient.installations.list();
}

export function fetchInstallationRepos(installationId: number) {
  return apiClient.installations.repos({ installationId });
}

export function updateProjectSetupCommand(projectId: string, setupCommand: string | null) {
  return apiClient.projects.updateSetupCommand({ projectId, setupCommand });
}

export function createTaskRun(
  taskId: string,
  messageId?: string,
  options?: { provider?: string; model?: string },
) {
  return apiClient.tasks.createRun({
    taskId,
    messageId,
    provider: options?.provider,
    model: options?.model,
  });
}

export function getTaskEventStreamUrl(taskId: string) {
  return `${globalThis.location.origin}/api/tasks/${taskId}/stream`;
}

export type { ProviderCredentialStatus, ProviderOauthStart };

export function fetchProviderCredentialStatus(provider: string) {
  return apiClient.settings.getProviderCredentialStatus({ provider });
}

export function upsertProviderCredential(provider: string, apiKey: string) {
  return apiClient.settings.upsertProviderCredential({ provider, apiKey });
}

export function deleteProviderCredential(provider: string) {
  return apiClient.settings.deleteProviderCredential({ provider });
}

export function startProviderOauth(provider: string) {
  return apiClient.settings.startProviderOauth({ provider });
}

export function completeProviderOauth(provider: string, attemptId: string, code?: string) {
  const trimmedCode = code?.trim();
  return apiClient.settings.completeProviderOauth({
    provider,
    attemptId,
    code: trimmedCode && trimmedCode.length > 0 ? trimmedCode : undefined,
  });
}
