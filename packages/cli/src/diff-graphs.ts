import type { DependencyGraph, SourceFileDependency } from "./analysis-engine/types";

export type DependencyGraphFileStatus = "added" | "removed" | "modified" | "unchanged";
export type DependencyGraphEdgeStatus = "added" | "removed" | "unchanged";

export interface DependencyGraphFileChange {
  file: string;
  status: DependencyGraphFileStatus;
}

export interface DependencyGraphEdgeChange {
  fromFile: string;
  toFile: string;
  status: DependencyGraphEdgeStatus;
}

export interface DependencyGraphDiff {
  files: DependencyGraphFileChange[];
  edges: DependencyGraphEdgeChange[];
}

export interface DependencyGraphDiffCounts {
  addedEdgeCount: number;
  addedFileCount: number;
  removedEdgeCount: number;
  removedFileCount: number;
}

export function diffDependencyGraphs(
  before: DependencyGraph,
  after: DependencyGraph,
): DependencyGraphDiff {
  const beforeFiles = new Set(before.files);
  const afterFiles = new Set(after.files);
  const beforeEdgeKeys = new Set(before.edges.map(toEdgeKey));
  const afterEdgeKeys = new Set(after.edges.map(toEdgeKey));
  const edgesByKey = new Map<string, SourceFileDependency>();

  for (const edge of [...before.edges, ...after.edges]) {
    edgesByKey.set(toEdgeKey(edge), edge);
  }

  const edges: DependencyGraphEdgeChange[] = Array.from(edgesByKey.entries())
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, edge]) => ({
      fromFile: edge.fromFile,
      toFile: edge.toFile,
      status: !beforeEdgeKeys.has(key)
        ? "added"
        : !afterEdgeKeys.has(key)
          ? "removed"
          : "unchanged",
    }));

  const filesWithChangedEdges = new Set<string>();

  for (const edge of edges) {
    if (edge.status === "unchanged") {
      continue;
    }

    filesWithChangedEdges.add(edge.fromFile);
    filesWithChangedEdges.add(edge.toFile);
  }

  const files: DependencyGraphFileChange[] = Array.from(new Set([...before.files, ...after.files]))
    .toSorted((left, right) => left.localeCompare(right))
    .map((file) => ({
      file,
      status: !beforeFiles.has(file)
        ? "added"
        : !afterFiles.has(file)
          ? "removed"
          : filesWithChangedEdges.has(file)
            ? "modified"
            : "unchanged",
    }));

  return { files, edges };
}

export function selectChangedDependencyGraph(diff: DependencyGraphDiff): DependencyGraphDiff {
  const files = diff.files.filter((file) => file.status !== "unchanged");
  const changedFiles = new Set(files.map((file) => file.file));
  const edges = diff.edges.filter(
    (edge) =>
      edge.status !== "unchanged" ||
      (changedFiles.has(edge.fromFile) && changedFiles.has(edge.toFile)),
  );

  return { files, edges };
}

export function countDependencyGraphChanges(diff: DependencyGraphDiff): DependencyGraphDiffCounts {
  return {
    addedEdgeCount: diff.edges.filter((edge) => edge.status === "added").length,
    addedFileCount: diff.files.filter((file) => file.status === "added").length,
    removedEdgeCount: diff.edges.filter((edge) => edge.status === "removed").length,
    removedFileCount: diff.files.filter((file) => file.status === "removed").length,
  };
}

function toEdgeKey(edge: SourceFileDependency): string {
  return `${edge.fromFile}\0${edge.toFile}`;
}
