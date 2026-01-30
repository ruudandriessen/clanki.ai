import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate } from "@tanstack/react-router";
import { GroupNode } from "./group-node";
import type { GraphData } from "../lib/graph-data";

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

const DEFAULT_COLOR = "#6b7280";

const nodeTypes = { group: GroupNode };

export function GraphView({ data }: { data: GraphData }) {
  const navigate = useNavigate();

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data.classifications) {
      counts[c.group] = (counts[c.group] || 0) + 1;
    }
    return counts;
  }, [data]);

  const nodes: Node[] = useMemo(() => {
    const count = data.groups.length;
    const centerX = 400;
    const centerY = 300;
    const radius = 250;

    return data.groups.map((g, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      return {
        id: g.name,
        type: "group",
        position: {
          x: centerX + radius * Math.cos(angle) - 90,
          y: centerY + radius * Math.sin(angle) - 40,
        },
        data: {
          label: g.name,
          fileCount: fileCounts[g.name] || 0,
          color: GROUP_COLORS[g.name] || DEFAULT_COLOR,
          description: g.description,
        },
      };
    });
  }, [data, fileCounts]);

  const edges: Edge[] = useMemo(
    () =>
      data.groupEdges.map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        label: `${e.weight} edges · ${e.symbols.length} symbols`,
        labelStyle: { fill: "#a1a1aa", fontWeight: 500, fontSize: 11 },
        labelBgStyle: { fill: "#141414" },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: GROUP_COLORS[e.from] || DEFAULT_COLOR,
          strokeWidth: Math.max(1.5, Math.min(e.weight, 6)),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: GROUP_COLORS[e.from] || DEFAULT_COLOR,
        },
        animated: true,
      })),
    [data],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      navigate({ to: "/group/$name", params: { name: node.id } });
    },
    [navigate],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
