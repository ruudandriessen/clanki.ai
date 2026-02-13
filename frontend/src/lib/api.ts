const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

// ---- Types matching API responses ----

export interface Project {
  id: string;
  name: string;
  repoUrl: string | null;
  installationId: number | null;
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

// ---- Fetch functions ----

export function fetchProjects() {
  return fetchJson<Project[]>("/projects");
}

export function fetchInstallations() {
  return fetchJson<Installation[]>("/installations");
}

export function fetchInstallationRepos(installationId: number) {
  return fetchJson<GitHubRepo[]>(`/installations/${installationId}/repos`);
}

export function createProjects(
  repos: Array<{ name: string; repoUrl: string; installationId: number }>,
) {
  return postJson<Project[]>("/projects", { repos });
}

// ---- Task types ----

export interface Task {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskMessage {
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
  sessionId: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRunEvent {
  id: string;
  runId: string;
  kind: string;
  payload: string;
  createdAt: number;
}

// ---- Task fetch functions ----

export function fetchTasks() {
  return fetchJson<Task[]>("/tasks");
}

export function createTask(title: string, projectId: string) {
  return postJson<Task>("/tasks", { title, projectId });
}

export function updateTask(taskId: string, title: string) {
  return patchJson<Task>(`/tasks/${taskId}`, { title });
}

export function fetchTaskMessages(taskId: string) {
  return fetchJson<TaskMessage[]>(`/tasks/${taskId}/messages`);
}

export function createTaskMessage(taskId: string, role: string, content: string) {
  return postJson<TaskMessage>(`/tasks/${taskId}/messages`, { role, content });
}

export function createTaskRun(taskId: string, messageId?: string) {
  return postJson<TaskRun>(`/tasks/${taskId}/runs`, messageId ? { messageId } : {});
}

export function fetchTaskRun(runId: string) {
  return fetchJson<TaskRun>(`/tasks/runs/${runId}`);
}

export function fetchTaskRunEvents(runId: string, after?: number) {
  const query = after !== undefined ? `?after=${after}` : "";
  return fetchJson<TaskRunEvent[]>(`/tasks/runs/${runId}/events${query}`);
}
