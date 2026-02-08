import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2 } from "lucide-react";
import { useActiveProject } from "../lib/project-context";
import { getGraphCollections } from "../lib/collections";
import { GraphView } from "../components/graph-view";
import type { GraphData } from "../lib/api";

export function GraphPage() {
  const ctx = useActiveProject();

  const graphCollections = ctx ? getGraphCollections(ctx.projectId, ctx.snapshotId) : null;

  const { data: groups, isLoading: groupsLoading } = useLiveQuery(
    (q) => (graphCollections ? q.from({ g: graphCollections.groups }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { data: classifications, isLoading: classLoading } = useLiveQuery(
    (q) => (graphCollections ? q.from({ c: graphCollections.classifications }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { data: groupEdges, isLoading: edgesLoading } = useLiveQuery(
    (q) => (graphCollections ? q.from({ ge: graphCollections.groupEdges }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const isLoading = groupsLoading || classLoading || edgesLoading;

  const data: GraphData | null = useMemo(() => {
    if (!groups || !classifications || !groupEdges) return null;
    return {
      groups,
      classifications,
      fileEdges: [],
      groupEdges,
    };
  }, [groups, classifications, groupEdges]);

  if (!ctx) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No project selected
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading graph data...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
        <h2 className="text-base md:text-lg font-semibold">Architecture Graph</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs md:text-sm text-muted-foreground mt-0.5">
          <span>{data.groups.length} groups</span>
          <span>&middot;</span>
          <span>{data.classifications.length} files</span>
          <span>&middot;</span>
          <span>{data.groupEdges.length} dependencies</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <GraphView data={data} projectId={ctx.projectId} />
      </div>
    </div>
  );
}
