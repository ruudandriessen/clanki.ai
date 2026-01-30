import { createContext, useContext } from "react";

export interface GroupDefinition {
  name: string;
  description: string;
}

export interface FileEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface FileClassification {
  file: string;
  group: string;
  strategy: "override" | "heuristic" | "default";
}

export interface GroupEdge {
  from: string;
  to: string;
  weight: number;
  symbols: string[];
}

export interface GraphData {
  groups: GroupDefinition[];
  fileEdges: FileEdge[];
  classifications: FileClassification[];
  unclassified: string[];
  groupEdges: GroupEdge[];
}

export async function loadGraphData(): Promise<GraphData> {
  const res = await fetch("/graph-data.json");
  return res.json();
}

export const GraphDataContext = createContext<GraphData | null>(null);

export function useGraphData(): GraphData | null {
  return useContext(GraphDataContext);
}
