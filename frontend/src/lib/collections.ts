import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/query-core";
import {
  fetchProjects,
  fetchSnapshots,
  fetchGraphData,
  type Project,
  type Snapshot,
  type GroupDefinition,
  type FileClassification,
  type FileEdge,
  type GroupEdge,
  type GraphData,
} from "./api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

// ---- Projects collection ----

export const projectsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ["projects"] as const,
    queryFn: async (): Promise<Array<Project>> => fetchProjects(),
    queryClient,
    getKey: (p) => p.id,
  }),
);

// ---- Snapshots collection (per project) ----

const snapshotCollections = new Map<string, ReturnType<typeof createSnapshotsCollection>>();

function createSnapshotsCollection(projectId: string) {
  return createCollection(
    queryCollectionOptions({
      queryKey: ["snapshots", projectId] as const,
      queryFn: async (): Promise<Array<Snapshot>> => fetchSnapshots(projectId),
      queryClient,
      getKey: (s) => s.id,
    }),
  );
}

export function getSnapshotsCollection(projectId: string) {
  let col = snapshotCollections.get(projectId);
  if (!col) {
    col = createSnapshotsCollection(projectId);
    snapshotCollections.set(projectId, col);
  }
  return col;
}

// ---- Graph data collections (per project + snapshot) ----
// A single API call returns groups, classifications, fileEdges, groupEdges.
// We split them into 4 collections using the `select` option.

type GraphCollections = ReturnType<typeof createGraphCollections>;

const graphCollectionsMap = new Map<string, GraphCollections>();

function graphKey(projectId: string, snapshotId: string) {
  return `${projectId}:${snapshotId}`;
}

function createGraphCollections(projectId: string, snapshotId: string) {
  const qk = ["graph", projectId, snapshotId] as const;
  const qFn = async (): Promise<GraphData> => fetchGraphData(projectId, snapshotId);

  const groups = createCollection(
    queryCollectionOptions({
      queryKey: [...qk],
      queryFn: qFn,
      select: (data): Array<GroupDefinition> => data.groups,
      queryClient,
      getKey: (g) => g.name,
    }),
  );

  const classifications = createCollection(
    queryCollectionOptions({
      queryKey: [...qk],
      queryFn: qFn,
      select: (data): Array<FileClassification> => data.classifications,
      queryClient,
      getKey: (c) => c.file,
    }),
  );

  const fileEdges = createCollection(
    queryCollectionOptions({
      queryKey: [...qk],
      queryFn: qFn,
      select: (data): Array<FileEdge> => data.fileEdges,
      queryClient,
      getKey: (e) => `${e.from}->${e.to}`,
    }),
  );

  const groupEdges = createCollection(
    queryCollectionOptions({
      queryKey: [...qk],
      queryFn: qFn,
      select: (data): Array<GroupEdge> => data.groupEdges,
      queryClient,
      getKey: (e) => `${e.from}->${e.to}`,
    }),
  );

  return { groups, classifications, fileEdges, groupEdges };
}

export function getGraphCollections(projectId: string, snapshotId: string): GraphCollections {
  const key = graphKey(projectId, snapshotId);
  let cols = graphCollectionsMap.get(key);
  if (!cols) {
    cols = createGraphCollections(projectId, snapshotId);
    graphCollectionsMap.set(key, cols);
  }
  return cols;
}
