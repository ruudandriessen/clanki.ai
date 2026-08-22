import type {
  ProjectSummary,
  DiagnosticSummary,
  ModelSummary,
  SourceFileDependencySummary,
} from "../functions/run/models/report";

export interface ProjectAnalysisGraph {
  nodes: ProjectAnalysisGraphNode[];
  edges: ProjectAnalysisGraphEdge[];
}

export interface ProjectAnalysisGraphNode {
  id: string;
  type: "source-file" | "model";
  label: string;
  sourceFile: string;
}

export interface ProjectAnalysisGraphEdge {
  from: string;
  to: string;
  type: "imports" | "defines-model" | "references-type";
}

export interface ProjectAnalysisResult {
  project: ProjectSummary;
  diagnostics: DiagnosticSummary[];
  models: ModelSummary[];
  sourceFileDependencies: SourceFileDependencySummary[];
  graph: ProjectAnalysisGraph;
}
