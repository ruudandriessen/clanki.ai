export type ArchitectureDiffFileStatus = "added" | "removed" | "modified" | "unchanged";
export type ArchitectureDiffEdgeStatus = "added" | "removed" | "unchanged";

export type ArchitectureDiffFile = {
  file: string;
  status: ArchitectureDiffFileStatus;
};

export type ArchitectureDiffEdge = {
  fromFile: string;
  toFile: string;
  status: ArchitectureDiffEdgeStatus;
};

export type ArchitectureDiff = {
  addedEdgeCount: number;
  addedFileCount: number;
  edges: ArchitectureDiffEdge[];
  files: ArchitectureDiffFile[];
  removedEdgeCount: number;
  removedFileCount: number;
};

export function hasArchitectureDiffChanges(diff: ArchitectureDiff): boolean {
  return (
    diff.addedFileCount > 0 ||
    diff.removedFileCount > 0 ||
    diff.addedEdgeCount > 0 ||
    diff.removedEdgeCount > 0
  );
}
