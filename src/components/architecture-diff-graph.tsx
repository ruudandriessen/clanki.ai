import type { ArchitectureDiff } from "@clanki/protocol";
import {
  architectureEdgeStatusClass,
  architectureFileNodeClass,
  architectureStatusLabel,
} from "@/lib/architecture-diff-status";
import { layoutArchitectureDiffGraph } from "@/lib/layout-architecture-diff-graph";

interface ArchitectureDiffGraphProps {
  diff: ArchitectureDiff;
}

export function ArchitectureDiffGraph({ diff }: ArchitectureDiffGraphProps) {
  const layout = layoutArchitectureDiffGraph(diff);

  return (
    <div className="neo-scroll overflow-auto">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="min-w-full"
        role="img"
        aria-label="Architectural dependency diff"
      >
        <defs>
          <marker
            id="architecture-arrow-added"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-emerald-600" />
          </marker>
          <marker
            id="architecture-arrow-removed"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-destructive" />
          </marker>
          <marker
            id="architecture-arrow-unchanged"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-border" />
          </marker>
        </defs>

        {layout.columns.map((column) => (
          <text
            key={column.directory}
            x={column.x}
            y={column.y + 12}
            className="fill-muted-foreground text-[10px]"
          >
            {column.directory}
          </text>
        ))}

        {layout.edges.map((edge) => (
          <path
            key={`${edge.status}:${edge.fromFile}->${edge.toFile}`}
            d={edge.d}
            fill="none"
            className={architectureEdgeStatusClass(edge.status)}
            strokeWidth={edge.status === "unchanged" ? 1.25 : 1.75}
            strokeDasharray={edge.status === "removed" ? "5 3" : undefined}
            markerEnd={`url(#architecture-arrow-${edge.status})`}
          />
        ))}

        {layout.nodes.map((node) => (
          <g key={node.file} transform={`translate(${node.x} ${node.y})`}>
            <title>{node.file}</title>
            <rect
              width={node.width}
              height={node.height}
              rx={6}
              className={architectureFileNodeClass(node.status)}
              strokeWidth={1.25}
            />
            <text x={12} y={18} className="fill-foreground text-[11px] font-medium">
              {node.label}
            </text>
            <text x={12} y={32} className="fill-muted-foreground text-[9px]">
              {architectureStatusLabel(node.status)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
