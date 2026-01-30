import { useGraphData } from "../lib/graph-data";
import { GraphView } from "../components/graph-view";

export function GraphPage() {
  const data = useGraphData();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
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
        <GraphView data={data} />
      </div>
    </div>
  );
}
