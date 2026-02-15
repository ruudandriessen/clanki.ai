import type {
  CreateProjectInput as ContractCreateProjectInput,
  CreateTaskInput as ContractCreateTaskInput,
  GitHubRepo,
  Installation,
  Project,
  ProviderCredentialStatus,
  ProviderOauthStart,
  Task,
  TaskMessage,
  TaskRun,
  TaskStreamEvent,
} from "../../../shared/orpc/contract";
import { apiClient } from "./orpc-client";

export interface MutationResult<T> {
  data: T;
  txid?: number;
}

export type { Project, Installation, GitHubRepo, Task, TaskMessage, TaskRun, TaskStreamEvent };
export type CreateProjectInput = ContractCreateProjectInput;
export type CreateTaskInput = ContractCreateTaskInput;

export function fetchInstallations() {
  return apiClient.installations.list();
}

export function fetchInstallationRepos(installationId: number) {
  return apiClient.installations.repos({ installationId });
}

export function createProjects(
  repos: Array<CreateProjectInput>,
): Promise<MutationResult<Project[]>> {
  return apiClient.projects.create({ repos });
}

export function updateProjectSetupCommand(
  projectId: string,
  setupCommand: string | null,
): Promise<MutationResult<Project>> {
  return apiClient.projects.updateSetupCommand({ projectId, setupCommand });
}

export function createTask(input: CreateTaskInput): Promise<MutationResult<Task>> {
  return apiClient.tasks.create(input);
}

export function updateTask(taskId: string, title: string): Promise<MutationResult<Task>> {
  return apiClient.tasks.update({ taskId, title });
}

export function deleteTask(taskId: string): Promise<{ txid?: number }> {
  return apiClient.tasks.delete({ taskId });
}

export function createTaskMessage(
  taskId: string,
  input: {
    id?: string;
    role: string;
    content: string;
    createdAt?: number;
  },
): Promise<MutationResult<TaskMessage>> {
  return apiClient.tasks.createMessage({ taskId, message: input });
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
