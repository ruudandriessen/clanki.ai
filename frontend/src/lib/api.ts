const BASE = "/api";

function parseTxid(res: Response): number | undefined {
  const txidHeader = res.headers.get("x-electric-txid");
  if (!txidHeader) {
    return undefined;
  }

  const txid = Number(txidHeader);
  if (!Number.isFinite(txid)) {
    return undefined;
  }

  return txid;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }
  return res.json();
}

export interface MutationResult<T> {
  data: T;
  txid?: number;
}

async function postJsonWithTx<T>(path: string, body: unknown): Promise<MutationResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }
  return {
    data: await res.json(),
    txid: parseTxid(res),
  };
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }

  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const result = await postJsonWithTx<T>(path, body);
  return result.data;
}

async function patchJsonWithTx<T>(path: string, body: unknown): Promise<MutationResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }

  return {
    data: await res.json(),
    txid: parseTxid(res),
  };
}

async function deleteJsonWithTx(path: string): Promise<{ txid?: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }

  return {
    txid: parseTxid(res),
  };
}

async function deleteJson(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await toApiErrorMessage(res, path));
  }
}

async function toApiErrorMessage(res: Response, path: string): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown; message?: unknown };
    const error = payload.error ?? payload.message;
    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
  } catch {}

  return `API ${res.status}: ${path}`;
}

// ---- Types matching API responses ----

export interface Project extends Record<string, unknown> {
  id: string;
  organizationId: string;
  name: string;
  repoUrl: string | null;
  installationId: number | null;
  setupCommand: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Installation {
  installationId: number;
  accountLogin: string;
  accountType: string;
  createdAt: number;
  deletedAt: number | null;
  updatedAt: number | null;
}

export interface GitHubRepo {
  id: number;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
}

export function fetchInstallations() {
  return fetchJson<Installation[]>("/installations");
}

export function fetchInstallationRepos(installationId: number) {
  return fetchJson<GitHubRepo[]>(`/installations/${installationId}/repos`);
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  repoUrl: string;
  installationId: number;
  createdAt?: number;
  updatedAt?: number;
}

export function createProjects(
  repos: Array<CreateProjectInput>,
): Promise<MutationResult<Project[]>> {
  return postJsonWithTx<Project[]>("/projects", { repos });
}

export function updateProjectSetupCommand(
  projectId: string,
  setupCommand: string | null,
): Promise<MutationResult<Project>> {
  return patchJsonWithTx<Project>(`/projects/${projectId}`, { setupCommand });
}

// ---- Task types ----

export interface Task extends Record<string, unknown> {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskMessage extends Record<string, unknown> {
  id: string;
  taskId: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  tool: string;
  status: string;
  inputMessageId: string | null;
  outputMessageId: string | null;
  sandboxId: string | null;
  branch: string | null;
  sessionId: string | null;
  initiatedByUserId: string | null;
  provider: string;
  model: string;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskStreamEvent {
  id: string;
  taskId: string;
  runId: string;
  kind: string;
  payload: string;
  createdAt: number;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  projectId: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
}

export function createTask(input: CreateTaskInput): Promise<MutationResult<Task>> {
  return postJsonWithTx<Task>("/tasks", input);
}

export function updateTask(taskId: string, title: string): Promise<MutationResult<Task>> {
  return patchJsonWithTx<Task>(`/tasks/${taskId}`, { title });
}

export function deleteTask(taskId: string): Promise<{ txid?: number }> {
  return deleteJsonWithTx(`/tasks/${taskId}`);
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
  return postJsonWithTx<TaskMessage>(`/tasks/${taskId}/messages`, input);
}

export function createTaskRun(
  taskId: string,
  messageId?: string,
  options?: { provider?: string; model?: string },
) {
  const body: { messageId?: string; provider?: string; model?: string } = {};
  if (messageId) {
    body.messageId = messageId;
  }
  if (options?.provider) {
    body.provider = options.provider;
  }
  if (options?.model) {
    body.model = options.model;
  }
  return postJson<TaskRun>(`/tasks/${taskId}/runs`, body);
}

export function getTaskEventStreamUrl(taskId: string) {
  return `${globalThis.location.origin}/api/tasks/${taskId}/stream`;
}

// ---- Provider settings ----

export interface ProviderCredentialStatus {
  provider: string;
  configured: boolean;
  authType: "api" | "oauth" | "wellknown" | null;
  updatedAt: number | null;
}

export function fetchProviderCredentialStatus(provider: string) {
  return fetchJson<ProviderCredentialStatus>(`/settings/providers/${provider}`);
}

export function upsertProviderCredential(provider: string, apiKey: string) {
  return putJson<ProviderCredentialStatus>(`/settings/providers/${provider}`, { apiKey });
}

export function deleteProviderCredential(provider: string) {
  return deleteJson(`/settings/providers/${provider}`);
}

export interface ProviderOauthStart {
  attemptId: string;
  url: string;
  instructions: string;
  method: "auto" | "code";
  expiresAt: number;
}

export function startProviderOauth(provider: string) {
  return postJson<ProviderOauthStart>(`/settings/providers/${provider}/oauth/start`, {});
}

export function completeProviderOauth(provider: string, attemptId: string, code?: string) {
  const body: { attemptId: string; code?: string } = { attemptId };
  if (code?.trim()) {
    body.code = code.trim();
  }
  return postJson<ProviderCredentialStatus>(`/settings/providers/${provider}/oauth/complete`, body);
}
