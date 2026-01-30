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
      <div className="px-6 py-4 border-b border-border flex items-center gap-6 shrink-0">
        <h2 className="text-lg font-semibold">Architecture Graph</h2>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{data.groups.length} groups</span>
          <span>&middot;</span>
          <span>{data.classifications.length} files</span>
          <span>&middot;</span>
          <span>{data.groupEdges.length} dependencies</span>
        </div>
      </div>
      <div className="flex-1">
        <GraphView data={data} />
      </div>
    </div>
  );
}
