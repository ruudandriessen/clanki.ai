import { useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate } from "@tanstack/react-router";
import { GroupNode } from "./group-node";
import type { GraphData } from "../lib/graph-data";
import * as dagre from '@dagrejs/dagre';

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

const DEFAULT_COLOR = "#6b7280";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

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
    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 120 });

    for (const group of data.groups) {
      g.setNode(group.name, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of data.groupEdges) {
      g.setEdge(edge.from, edge.to);
    }

    dagre.layout(g);

    return data.groups.map((group) => {
      const node = g.node(group.name);
      return {
        id: group.name,
        type: "group",
        position: {
          x: node.x - NODE_WIDTH / 2,
          y: node.y - NODE_HEIGHT / 2,
        },
        data: {
          label: group.name,
          fileCount: fileCounts[group.name] || 0,
          color: GROUP_COLORS[group.name] || DEFAULT_COLOR,
          description: group.description,
        },
        style: { background: "transparent", padding: 0, border: "none", boxShadow: "none" },
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
