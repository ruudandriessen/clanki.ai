const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
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

export interface Snapshot {
  id: string;
  projectId: string;
  pullRequestId: string | null;
  commitSha: string | null;
  status: string;
  createdAt: number;
}

export interface GroupDefinition {
  name: string;
  description: string;
}

export interface FileClassification {
  file: string;
  group: string;
  strategy: string;
}

export interface FileEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface GroupEdge {
  from: string;
  to: string;
  weight: number;
  symbols: string[];
}

export interface GraphData {
  groups: GroupDefinition[];
  classifications: FileClassification[];
  fileEdges: FileEdge[];
  groupEdges: GroupEdge[];
}

// ---- Fetch functions ----

export function fetchProjects() {
  return fetchJson<Project[]>("/projects");
}

export function fetchSnapshots(projectId: string) {
  return fetchJson<Snapshot[]>(`/projects/${projectId}/snapshots`);
}

export function fetchLatestSnapshot(projectId: string) {
  return fetchJson<Snapshot>(`/projects/${projectId}/snapshots/latest`);
}

export function fetchGraphData(projectId: string, snapshotId: string) {
  return fetchJson<GraphData>(`/projects/${projectId}/snapshots/${snapshotId}/graph`);
}
